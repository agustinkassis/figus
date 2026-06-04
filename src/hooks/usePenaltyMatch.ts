"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventTemplate } from "nostr-tools";
import { KIND } from "@/lib/constants";
import { list, subscribe, getPool, getRelays } from "@/lib/pool";
import { signEvent } from "@/lib/identity";
import type { Identity } from "@/lib/identity";
import {
  parseMatch, parseCommit, parseBlock, parseReveal,
  deriveMatchState, generateNonce, commitZone,
  type PenaltyMatch, type PenaltyCommit, type PenaltyBlock,
  type PenaltyReveal, type MatchState,
} from "@/lib/penalty";
import type { Event } from "nostr-tools";

// ─── Listar partidas abiertas para un pubkey ──────────────────────────────────

export function useOpenMatches(myPubkey: string | null) {
  const [incoming, setIncoming] = useState<PenaltyMatch[]>([]);  // desafíos recibidos
  const [outgoing, setOutgoing] = useState<PenaltyMatch[]>([]);  // desafíos enviados
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!myPubkey) { setLoading(false); return; }
    let cancelled = false;

    const parseAll = (evs: Event[]) => {
      const latest = new Map<string, Event>();
      for (const ev of evs) {
        const d = ev.tags.find(t => t[0] === "d")?.[1];
        if (!d) continue;
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }
      return Array.from(latest.values())
        .map(parseMatch)
        .filter((m): m is PenaltyMatch => m !== null && m.status === "open");
    };

    (async () => {
      setLoading(true);
      const [recv, sent] = await Promise.all([
        list([{ kinds: [KIND.PENALTY_MATCH], "#p": [myPubkey] }]),
        list([{ kinds: [KIND.PENALTY_MATCH], authors: [myPubkey] }]),
      ]);
      if (!cancelled) {
        setIncoming(parseAll(recv));
        setOutgoing(parseAll(sent));
        setLoading(false);
      }
    })();

    const unsub = subscribe(
      [
        { kinds: [KIND.PENALTY_MATCH], "#p": [myPubkey] },
        { kinds: [KIND.PENALTY_MATCH], authors: [myPubkey] },
      ],
      () => {
        Promise.all([
          list([{ kinds: [KIND.PENALTY_MATCH], "#p": [myPubkey] }]),
          list([{ kinds: [KIND.PENALTY_MATCH], authors: [myPubkey] }]),
        ]).then(([recv, sent]) => {
          if (!cancelled) {
            setIncoming(parseAll(recv));
            setOutgoing(parseAll(sent));
          }
        });
      }
    );

    return () => { cancelled = true; unsub(); };
  }, [myPubkey]);

  return { incoming, outgoing, loading };
}

// ─── Estado en vivo de UNA partida ───────────────────────────────────────────

export function usePenaltyMatch(
  match: PenaltyMatch | null,
  identity: Identity | null,
) {
  const [state, setState]   = useState<MatchState | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Acumuladores de eventos (ref para no re-suscribir en cada render)
  const commitsRef = useRef<PenaltyCommit[]>([]);
  const blocksRef  = useRef<PenaltyBlock[]>([]);
  const revealsRef = useRef<PenaltyReveal[]>([]);
  // Nonce temporal del pateador (solo en memoria, no en relays hasta el reveal)
  const pendingNonce = useRef<string | null>(null);

  const rebuild = useCallback((m: PenaltyMatch) => {
    setState(deriveMatchState(m, commitsRef.current, blocksRef.current, revealsRef.current));
  }, []);

  useEffect(() => {
    if (!match) return;
    commitsRef.current = [];
    blocksRef.current  = [];
    revealsRef.current = [];
    let cancelled = false;

    const coord = `${KIND.PENALTY_MATCH}:${match.challenger}:${match.d}`;

    (async () => {
      const evs = await list([
        { kinds: [KIND.PENALTY_COMMIT, KIND.PENALTY_BLOCK, KIND.PENALTY_REVEAL], "#a": [coord] },
      ]);
      if (cancelled) return;
      for (const ev of evs) ingestEvent(ev, match, commitsRef, blocksRef, revealsRef);
      rebuild(match);
    })();

    const unsub = subscribe(
      [{ kinds: [KIND.PENALTY_COMMIT, KIND.PENALTY_BLOCK, KIND.PENALTY_REVEAL], "#a": [coord] }],
      (ev) => {
        ingestEvent(ev, match, commitsRef, blocksRef, revealsRef);
        rebuild(match);
      }
    );

    return () => { cancelled = true; unsub(); };
  }, [match, rebuild]);

  // ── Acciones ─────────────────────────────────────────────────────────────

  const publishCommit = useCallback(async (zone: number) => {
    if (!match || !identity) return;
    const nonce  = generateNonce();
    const commit = commitZone(zone, nonce);
    pendingNonce.current = nonce;

    const coord = `${KIND.PENALTY_MATCH}:${match.challenger}:${match.d}`;
    const roundNum = state?.currentRound ?? 1;

    const tmpl: EventTemplate = {
      kind: KIND.PENALTY_COMMIT,
      created_at: Math.floor(Date.now() / 1000),
      content: "",
      tags: [
        ["a", coord],
        ["round", String(roundNum)],
        ["commit", commit],
      ],
    };
    setPublishing(true);
    try {
      const ev = await signEvent(tmpl, identity.mode);
      await Promise.any(getPool().publish(getRelays(), ev));
    } finally {
      setPublishing(false);
    }
  }, [match, identity, state]);

  const publishBlock = useCallback(async (col: number, commitId: string) => {
    if (!match || !identity) return;
    const coord    = `${KIND.PENALTY_MATCH}:${match.challenger}:${match.d}`;
    const roundNum = state?.currentRound ?? 1;

    const tmpl: EventTemplate = {
      kind: KIND.PENALTY_BLOCK,
      created_at: Math.floor(Date.now() / 1000),
      content: "",
      tags: [
        ["a", coord],
        ["e", commitId],
        ["round", String(roundNum)],
        ["col", String(col)],
      ],
    };
    setPublishing(true);
    try {
      const ev = await signEvent(tmpl, identity.mode);
      await Promise.any(getPool().publish(getRelays(), ev));
    } finally {
      setPublishing(false);
    }
  }, [match, identity, state]);

  const publishReveal = useCallback(async (zone: number, commitId: string) => {
    if (!match || !identity || !pendingNonce.current) return;
    const coord    = `${KIND.PENALTY_MATCH}:${match.challenger}:${match.d}`;
    const roundNum = state?.currentRound ?? 1;

    const tmpl: EventTemplate = {
      kind: KIND.PENALTY_REVEAL,
      created_at: Math.floor(Date.now() / 1000),
      content: "",
      tags: [
        ["a", coord],
        ["e", commitId],
        ["round", String(roundNum)],
        ["zone", String(zone)],
        ["nonce", pendingNonce.current],
      ],
    };
    setPublishing(true);
    try {
      const ev = await signEvent(tmpl, identity.mode);
      await Promise.any(getPool().publish(getRelays(), ev));
      pendingNonce.current = null;
    } finally {
      setPublishing(false);
    }
  }, [match, identity, state]);

  return { state, publishing, publishCommit, publishBlock, publishReveal };
}

// ─── Helper: publicar desafío ─────────────────────────────────────────────────

export async function createMatch(
  identity: Identity,
  challenged: string,
  rounds = 3,
): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const d  = `pmatch:${identity.pubkey.slice(0, 8)}:${ts}`;

  const tmpl: EventTemplate = {
    kind: KIND.PENALTY_MATCH,
    created_at: ts,
    content: "",
    tags: [
      ["d", d],
      ["p", challenged],
      ["rounds", String(rounds)],
      ["status", "open"],
    ],
  };
  const ev = await signEvent(tmpl, identity.mode);
  await Promise.any(getPool().publish(getRelays(), ev));
  return d;
}

export async function cancelMatch(identity: Identity, match: PenaltyMatch): Promise<void> {
  const tmpl: EventTemplate = {
    kind: KIND.PENALTY_MATCH,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    tags: [
      ["d", match.d],
      ["p", match.challenged],
      ["rounds", String(match.rounds)],
      ["status", "cancelled"],
    ],
  };
  const ev = await signEvent(tmpl, identity.mode);
  await Promise.any(getPool().publish(getRelays(), ev));
}

// ─── Helper interno ───────────────────────────────────────────────────────────

function ingestEvent(
  ev: Event,
  match: PenaltyMatch,
  commitsRef: React.MutableRefObject<PenaltyCommit[]>,
  blocksRef:  React.MutableRefObject<PenaltyBlock[]>,
  revealsRef: React.MutableRefObject<PenaltyReveal[]>,
) {
  if (ev.kind === KIND.PENALTY_COMMIT) {
    const c = parseCommit(ev);
    if (c && !commitsRef.current.find(x => x.id === c.id)) commitsRef.current = [...commitsRef.current, c];
  } else if (ev.kind === KIND.PENALTY_BLOCK) {
    const b = parseBlock(ev);
    if (b && !blocksRef.current.find(x => x.id === b.id)) blocksRef.current = [...blocksRef.current, b];
  } else if (ev.kind === KIND.PENALTY_REVEAL) {
    const r = parseReveal(ev);
    if (r && !revealsRef.current.find(x => x.id === r.id)) revealsRef.current = [...revealsRef.current, r];
  }
}
