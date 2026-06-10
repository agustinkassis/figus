"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventTemplate } from "nostr-tools";
import { KIND } from "@/lib/constants";
import { list, subscribe, getPool, getRelays } from "@/lib/pool";
import { signEvent } from "@/lib/identity";
import type { Identity } from "@/lib/identity";
import { sendDM, dmNewChallenge, dmYourTurn } from "@/lib/dm";
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

    // Cache local de eventos: evita volver a consultar relays en cada suscripción.
    // Clave = "pubkey:d" → solo guardamos el evento más reciente por partida.
    const evCache = new Map<string, Event>();

    function ingestAndSetState(evs: Event[]) {
      for (const ev of evs) {
        const d = ev.tags.find(t => t[0] === "d")?.[1];
        if (!d) continue;
        const key = `${ev.pubkey}:${d}`;
        const prev = evCache.get(key);
        if (!prev || ev.created_at > prev.created_at) evCache.set(key, ev);
      }
      const all = Array.from(evCache.values())
        .map(parseMatch)
        .filter((m): m is PenaltyMatch => m !== null && m.status === "open");
      setIncoming(all.filter(m => m.challenged === myPubkey));
      setOutgoing(all.filter(m => m.challenger === myPubkey));
    }

    // Solo partidas de los últimos 60 días — evita traer eventos históricos indefinidamente
    const since = Math.floor(Date.now() / 1000) - 60 * 24 * 3600;

    (async () => {
      setLoading(true);
      // 4000ms: los relays lentos tardan hasta 2-3s — no cortamos antes de que respondan.
      const [recv, sent] = await Promise.all([
        list([{ kinds: [KIND.PENALTY_MATCH], "#p": [myPubkey], since }], 4000),
        list([{ kinds: [KIND.PENALTY_MATCH], authors: [myPubkey], since }], 4000),
      ]);
      if (!cancelled) {
        ingestAndSetState([...recv, ...sent]);
        setLoading(false);
      }
    })();

    // Suscripción viva: cuando llega un nuevo evento lo ingesta directo en el cache
    // sin volver a consultar relays (ahorra una round-trip de 4s por evento).
    const unsub = subscribe(
      [
        { kinds: [KIND.PENALTY_MATCH], "#p": [myPubkey], since },
        { kinds: [KIND.PENALTY_MATCH], authors: [myPubkey], since },
      ],
      (ev) => {
        if (!cancelled) ingestAndSetState([ev]);
      }
    );

    return () => { cancelled = true; unsub(); };
  }, [myPubkey]);

  return { incoming, outgoing, loading };
}

// ─── Estado en vivo de UNA partida ───────────────────────────────────────────

// Publica en relays con timeout de 8s — evita que la UI se quede trabada
// si todos los relays cuelgan sin responder.
function publishToRelays(ev: Event): Promise<void> {
  return Promise.race([
    Promise.any(getPool().publish(getRelays(), ev)).then(() => {}),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("publish timeout")), 8000)
    ),
  ]);
}

export function usePenaltyMatch(
  match: PenaltyMatch | null,
  identity: Identity | null,
) {
  const [state, setState]   = useState<MatchState | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Acumuladores de eventos (ref para no re-suscribir en cada render)
  const commitsRef = useRef<PenaltyCommit[]>([]);
  const blocksRef  = useRef<PenaltyBlock[]>([]);
  const revealsRef = useRef<PenaltyReveal[]>([]);
  // Zona + nonce del commit del pateador — persiste en localStorage para sobrevivir
  // recargas de página o el browser bajando el tab en celular.
  const pendingCommitRef = useRef<{ zone: number; nonce: string } | null>(null);

  const rebuild = useCallback((m: PenaltyMatch) => {
    setState(deriveMatchState(m, commitsRef.current, blocksRef.current, revealsRef.current));
  }, []);

  useEffect(() => {
    if (!match) return;
    commitsRef.current     = [];
    blocksRef.current      = [];
    revealsRef.current     = [];
    pendingCommitRef.current = null;
    let cancelled = false;

    const coord = `${KIND.PENALTY_MATCH}:${match.challenger}:${match.d}`;
    // Commits/blocks/reveals solo pueden existir desde la creación de la partida
    const since = match.createdAt - 60;

    (async () => {
      // 4000ms: misma paciencia que el leaderboard — relays lentos tardan ~2-3s.
      const evs = await list([
        { kinds: [KIND.PENALTY_COMMIT, KIND.PENALTY_BLOCK, KIND.PENALTY_REVEAL], "#a": [coord], since },
      ], 4000);
      if (cancelled) return;
      for (const ev of evs) ingestEvent(ev, match, commitsRef, blocksRef, revealsRef);
      rebuild(match);
    })();

    const unsub = subscribe(
      [{ kinds: [KIND.PENALTY_COMMIT, KIND.PENALTY_BLOCK, KIND.PENALTY_REVEAL], "#a": [coord], since }],
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
    pendingCommitRef.current = { zone, nonce };
    // Persist to localStorage so the reveal works even after a page reload on mobile
    try {
      localStorage.setItem(
        `figus_pcommit_${match.d}`,
        JSON.stringify({ zone, nonce, round: state?.currentRound ?? 1 })
      );
    } catch {}

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
    setPublishError(null);
    try {
      const ev = await signEvent(tmpl, identity.mode);
      await publishToRelays(ev);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Error al publicar");
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
    setPublishError(null);
    try {
      const ev = await signEvent(tmpl, identity.mode);
      await publishToRelays(ev);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Error al publicar");
    } finally {
      setPublishing(false);
    }
  }, [match, identity, state]);

  const publishReveal = useCallback(async (commitId: string) => {
    if (!match || !identity) return;
    const roundNum = state?.currentRound ?? 1;

    // Try in-memory ref first, then recover from localStorage (handles page reload on mobile)
    let pending = pendingCommitRef.current;
    if (!pending) {
      try {
        const stored = localStorage.getItem(`figus_pcommit_${match.d}`);
        if (stored) {
          const data = JSON.parse(stored);
          // Accept the stored data if the round matches OR if it's the only data we have
          if (data.round === roundNum || !pending) {
            pending = { zone: data.zone, nonce: data.nonce };
            pendingCommitRef.current = pending;
          }
        }
      } catch {}
    }
    if (!pending) {
      setPublishError("No se encontraron datos del remate. Recargá la página e intentá de nuevo.");
      return;
    }

    const coord = `${KIND.PENALTY_MATCH}:${match.challenger}:${match.d}`;

    const tmpl: EventTemplate = {
      kind: KIND.PENALTY_REVEAL,
      created_at: Math.floor(Date.now() / 1000),
      content: "",
      tags: [
        ["a", coord],
        ["e", commitId],
        ["round", String(roundNum)],
        ["zone", String(pending.zone)],
        ["nonce", pending.nonce],
      ],
    };
    setPublishing(true);
    setPublishError(null);
    try {
      const ev = await signEvent(tmpl, identity.mode);
      await publishToRelays(ev);
      pendingCommitRef.current = null;
      try { localStorage.removeItem(`figus_pcommit_${match.d}`); } catch {}

      // After reveal it's the opponent's turn to kick — notify them (best-effort)
      const opponentPubkey = identity.pubkey === match.challenger
        ? match.challenged
        : match.challenger;
      sendDM(identity, opponentPubkey, dmYourTurn()).catch(() => {});
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Error al publicar");
    } finally {
      setPublishing(false);
    }
  }, [match, identity, state]);

  return { state, publishing, publishError, publishCommit, publishBlock, publishReveal };
}

// ─── Helper: publicar desafío ─────────────────────────────────────────────────

export async function createMatch(
  identity: Identity,
  challenged: string,
  rounds = 2,
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

  // Notify the challenged player via NIP-04 DM (best-effort)
  sendDM(identity, challenged, dmNewChallenge(identity.pubkey)).catch(() => {});

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
  _match: PenaltyMatch,
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

// ─── Hook: estado de turno para un conjunto de partidas (batch query) ────────
// Una sola query a los relays para todas las partidas → map matchId → myTurn
// Usa el string de IDs como clave estable para no re-suscribir en cada render
export function useTurnMap(
  allMatches: PenaltyMatch[],
  myPubkey: string | null,
): Map<string, boolean | null> {
  const [turnMap, setTurnMap] = useState<Map<string, boolean | null>>(new Map);

  // Clave estable: solo cambia si el conjunto de partidas cambia
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const coordsKey = allMatches.map(m => m.id).join(",");

  useEffect(() => {
    if (!myPubkey || allMatches.length === 0) { setTurnMap(new Map); return; }
    let cancelled = false;
    const coords = allMatches.map(m => `${KIND.PENALTY_MATCH}:${m.challenger}:${m.d}`);
    // since = la más antigua de las partidas abiertas menos 1 minuto de margen
    const since = Math.min(...allMatches.map(m => m.createdAt)) - 60;

    function turnFor(match: PenaltyMatch, evs: Event[]): boolean {
      const coord = `${KIND.PENALTY_MATCH}:${match.challenger}:${match.d}`;
      const matchEvs = evs.filter(e => e.tags.some(t => t[0] === "a" && t[1] === coord));
      const commits  = matchEvs.map(parseCommit).filter((c): c is PenaltyCommit => c !== null);
      const blocks   = matchEvs.map(parseBlock).filter((b): b is PenaltyBlock   => b !== null);
      const reveals  = matchEvs.map(parseReveal).filter((r): r is PenaltyReveal => r !== null);
      const state    = deriveMatchState(match, commits, blocks, reveals);
      if (state.phase === "finished") return false;
      const r      = state.currentRound;
      const kicker = r % 2 === 1 ? match.challenger : match.challenged;
      const keeper = r % 2 === 1 ? match.challenged : match.challenger;
      return (
        state.phase === "waiting_commit" ? myPubkey === kicker :
        state.phase === "waiting_block"  ? myPubkey === keeper  :
        state.phase === "waiting_reveal" ? myPubkey === kicker  : false
      );
    }

    // Cache local de eventos de turno: evita round-trip a relays en cada suscripción.
    const evsCache = new Map<string, Event>();

    function recalcTurnMap() {
      const all = Array.from(evsCache.values());
      const next = new Map<string, boolean | null>();
      for (const m of allMatches) next.set(m.id, turnFor(m, all));
      setTurnMap(next);
    }

    (async () => {
      if (cancelled) return;
      // 4000ms: igual que leaderboard y usePenaltyMatch.
      const evs = await list([
        { kinds: [KIND.PENALTY_COMMIT, KIND.PENALTY_BLOCK, KIND.PENALTY_REVEAL], "#a": coords, since },
      ], 4000);
      if (cancelled) return;
      for (const ev of evs) evsCache.set(ev.id, ev);
      recalcTurnMap();
    })();

    const unsub = subscribe(
      [{ kinds: [KIND.PENALTY_COMMIT, KIND.PENALTY_BLOCK, KIND.PENALTY_REVEAL], "#a": coords, since }],
      (ev) => {
        if (!cancelled) { evsCache.set(ev.id, ev); recalcTurnMap(); }
      },
    );
    return () => { cancelled = true; unsub(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordsKey, myPubkey]); // clave estable en lugar de referencia de array

  return turnMap;
}

// ─── Hook: ¿tengo alguna acción pendiente? (derivado de useTurnMap) ──────────
export function useHasMyTurn(
  incoming: PenaltyMatch[],
  outgoing: PenaltyMatch[],
  myPubkey: string | null,
): boolean {
  const allMatches = [...incoming, ...outgoing];
  const turnMap = useTurnMap(allMatches, myPubkey);
  return Array.from(turnMap.values()).some(v => v === true);
}
