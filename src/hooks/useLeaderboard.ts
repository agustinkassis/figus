"use client";

import { useState, useEffect } from "react";
import { KIND, ISSUER_PUBKEY } from "@/lib/constants";
import { list } from "@/lib/pool";
import { parseOwnership } from "@/lib/parsers";
import { ALL_NUMBERS } from "@/lib/catalog";
import type { LeaderEntry } from "@/lib/types";

// Cache en módulo: sobrevive navegación entre tabs, expira a los 5 minutos.
let cachedEntries: LeaderEntry[] | null = null;
let cacheTs = 0;
const CACHE_TTL = 5 * 60 * 1000;

export function useLeaderboard(enabled: boolean): { entries: LeaderEntry[]; loading: boolean } {
  const [entries, setEntries] = useState<LeaderEntry[]>(() => cachedEntries ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !ISSUER_PUBKEY) return;

    // Servir caché si es fresco
    if (cachedEntries && Date.now() - cacheTs < CACHE_TTL) {
      setEntries(cachedEntries);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setEntries([]);

    async function load() {
      // Ownership: única query necesaria para el ranking.
      // maxWait 4000ms: estos relays tardan hasta 2.3s — no los cortamos antes de que respondan.
      const ownEvents = await list([{ kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], limit: 1000 }], 4000);
      if (cancelled) return;

      // Agrupar ownership por pubkey de jugador (#p tag)
      const byPubkey: Record<string, typeof ownEvents> = {};
      for (const ev of ownEvents) {
        const p = ev.tags.find(t => t[0] === "p")?.[1];
        if (p) {
          if (!byPubkey[p]) byPubkey[p] = [];
          byPubkey[p].push(ev);
        }
      }

      const pubkeys = Object.keys(byPubkey);
      if (!pubkeys.length) { setLoading(false); return; }

      const stickerCounts: Record<string, number> = {};
      for (const pk of pubkeys) {
        const own = parseOwnership(byPubkey[pk]);
        stickerCounts[pk] = ALL_NUMBERS.filter(n => (own[n] ?? 0) > 0).length;
      }

      // 3. Perfiles (en paralelo con el procesamiento anterior ya terminó)
      const profileMap: Record<string, { name: string; picture: string } | null> = {};
      try {
        const profileEvs = await list([{ kinds: [0], authors: pubkeys }]);
        if (!cancelled) {
          const latest: Record<string, (typeof profileEvs)[0]> = {};
          for (const ev of profileEvs) {
            if (!latest[ev.pubkey] || ev.created_at > latest[ev.pubkey].created_at)
              latest[ev.pubkey] = ev;
          }
          for (const pk of pubkeys) {
            const ev = latest[pk];
            if (ev) {
              try {
                const meta = JSON.parse(ev.content);
                profileMap[pk] = { name: meta.display_name || meta.name || "", picture: meta.picture || "" };
              } catch { profileMap[pk] = null; }
            } else {
              profileMap[pk] = null;
            }
          }
        }
      } catch {}

      if (cancelled) return;

      const scored: LeaderEntry[] = pubkeys.map(pk => {
        const stickers = stickerCounts[pk] || 0;
        return { pubkey: pk, profile: profileMap[pk] ?? null, stickers, score: stickers, rank: 0 };
      });

      scored.sort((a, b) => b.score - a.score || b.stickers - a.stickers);
      scored.forEach((e, i) => { e.rank = i + 1; });

      cachedEntries = scored;
      cacheTs = Date.now();
      setEntries(scored);
      setLoading(false);
    }

    load().catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [enabled]);

  return { entries, loading };
}
