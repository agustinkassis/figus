"use client";

import { useCallback, useEffect, useState } from "react";
import type { EventTemplate } from "nostr-tools";
import { KIND, ALBUM_ID } from "@/lib/constants";
import { list, subscribeOne, getPool, getRelays } from "@/lib/pool";
import { signEvent } from "@/lib/identity";
import type { Identity } from "@/lib/identity";

export type Prono = {
  pubkey: string;
  home: number;
  away: number;
  createdAt: number;
};

function parseProno(ev: { pubkey: string; content: string; created_at: number }): Prono | null {
  try {
    const { home, away } = JSON.parse(ev.content);
    if (typeof home !== "number" || typeof away !== "number") return null;
    return { pubkey: ev.pubkey, home, away, createdAt: ev.created_at };
  } catch {
    return null;
  }
}

export function usePronosticos(matchId: string, myPubkey: string | null) {
  const [pronos, setPronos] = useState<Map<string, Prono>>(new Map());
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    const d = `prono:${ALBUM_ID}:${matchId}`;

    (async () => {
      const evs = await list([{ kinds: [KIND.PRONO], "#d": [d] }]);
      if (cancelled) return;
      const map = new Map<string, Prono>();
      for (const ev of evs) {
        const p = parseProno(ev);
        if (!p) continue;
        const existing = map.get(ev.pubkey);
        if (!existing || p.createdAt > existing.createdAt) map.set(ev.pubkey, p);
      }
      setPronos(map);
    })();

    const unsub = subscribeOne({ kinds: [KIND.PRONO], "#d": [d] }, (ev) => {
      if (cancelled) return;
      const p = parseProno(ev);
      if (!p) return;
      setPronos((prev) => {
        const existing = prev.get(ev.pubkey);
        if (existing && p.createdAt <= existing.createdAt) return prev;
        const next = new Map(prev);
        next.set(ev.pubkey, p);
        return next;
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [matchId]);

  const myProno = myPubkey ? (pronos.get(myPubkey) ?? null) : null;

  const publish = useCallback(
    async (home: number, away: number, identity: Identity) => {
      setPublishing(true);
      try {
        const d = `prono:${ALBUM_ID}:${matchId}`;
        const template: EventTemplate = {
          kind: KIND.PRONO,
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify({ home, away }),
          tags: [["d", d]],
        };
        const signed = await signEvent(template, identity.mode);
        await Promise.any(getPool().publish(getRelays(), signed));
      } finally {
        setPublishing(false);
      }
    },
    [matchId],
  );

  return { pronos, myProno, publishing, publish };
}
