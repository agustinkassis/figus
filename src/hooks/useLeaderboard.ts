"use client";

import { useState, useEffect } from "react";
import { KIND, ISSUER_PUBKEY } from "@/lib/constants";
import { list } from "@/lib/pool";
import { parseOwnership } from "@/lib/parsers";
import { ALL_NUMBERS } from "@/lib/catalog";
import type { LeaderEntry } from "@/lib/types";

export function useLeaderboard(enabled: boolean): { entries: LeaderEntry[]; loading: boolean } {
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !ISSUER_PUBKEY) return;
    let cancelled = false;
    setLoading(true);
    setEntries([]);

    async function load() {
      // 1. Fetch all OWNERSHIP events (issuer-signed, tagged with player pubkeys)
      const ownEvents = await list([{
        kinds: [KIND.OWNERSHIP],
        authors: [ISSUER_PUBKEY],
        limit: 1000,
      }]);
      if (cancelled) return;

      // Group ownership events by player pubkey (#p tag)
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

      // 2. Compute sticker count per player
      const stickerCounts: Record<string, number> = {};
      for (const pk of pubkeys) {
        const own = parseOwnership(byPubkey[pk]);
        stickerCounts[pk] = ALL_NUMBERS.filter(n => (own[n] ?? 0) > 0).length;
      }

      // 3. Fetch PENALTY_PLAY events for all players
      const penaltyEvents = await list([{
        kinds: [KIND.PENALTY_PLAY],
        authors: pubkeys,
        limit: 5000,
      }]);
      if (cancelled) return;

      // Count goals: each event has ["result", "goal"|"save"]
      // Events are addressable per day so one per player per day
      const goalCounts: Record<string, number> = {};
      for (const ev of penaltyEvents) {
        const result = ev.tags.find(t => t[0] === "result")?.[1];
        if (result === "goal") {
          goalCounts[ev.pubkey] = (goalCounts[ev.pubkey] || 0) + 1;
        }
      }

      // 4. Fetch profiles
      const profileMap: Record<string, { name: string; picture: string } | null> = {};
      try {
        const profileEvs = await list([{ kinds: [0], authors: pubkeys }]);
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
      } catch {}

      if (cancelled) return;

      // 5. Score = stickers + goals × 5
      const scored: LeaderEntry[] = pubkeys.map(pk => {
        const stickers = stickerCounts[pk] || 0;
        const goals    = goalCounts[pk]    || 0;
        return { pubkey: pk, profile: profileMap[pk] ?? null, stickers, goals, score: stickers + goals * 5, rank: 0 };
      });

      scored.sort((a, b) => b.score - a.score || b.stickers - a.stickers);
      scored.forEach((e, i) => { e.rank = i + 1; });

      setEntries(scored);
      setLoading(false);
    }

    load().catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [enabled]);

  return { entries, loading };
}
