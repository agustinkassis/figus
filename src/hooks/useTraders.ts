"use client";

import { useState, useEffect } from "react";
import { KIND, ISSUER_PUBKEY } from "@/lib/constants";
import { list } from "@/lib/pool";
import { parseOwnership } from "@/lib/parsers";
import { ALL_NUMBERS } from "@/lib/catalog";
import type { Ownership } from "@/lib/types";

export interface RawTrader {
  pubkey: string;
  ownership: Ownership;
  profile: { name: string; picture: string } | null;
}

// Pure utility — what trades are possible between two players
export function computeMatch(
  myOwnership: Ownership,
  theirOwnership: Ownership
): { iOffer: number[]; theyOffer: number[] } {
  const myDupesSet = new Set(ALL_NUMBERS.filter((n) => (myOwnership[n] ?? 0) > 1));
  const myNeedsSet = new Set(ALL_NUMBERS.filter((n) => (myOwnership[n] ?? 0) === 0));

  const theirDupes = ALL_NUMBERS.filter((n) => (theirOwnership[n] ?? 0) > 1);
  const theirNeeds = ALL_NUMBERS.filter((n) => (theirOwnership[n] ?? 0) === 0);

  return {
    iOffer: theirNeeds.filter((n) => myDupesSet.has(n)),   // I have extras they need
    theyOffer: theirDupes.filter((n) => myNeedsSet.has(n)), // They have extras I need
  };
}

// Fetch a single trader's ownership + profile
export function useTraderInfo(pubkey: string | null): {
  info: RawTrader | null;
  loading: boolean;
} {
  const [info, setInfo] = useState<RawTrader | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pubkey || !ISSUER_PUBKEY) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setInfo(null);

    Promise.all([
      list([{ kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], "#p": [pubkey] }]),
      list([{ kinds: [0], authors: [pubkey] }]),
    ]).then(([ownEvents, profileEvents]) => {
      if (cancelled) return;
      const ownership = parseOwnership(ownEvents);
      let profile: { name: string; picture: string } | null = null;
      if (profileEvents.length) {
        const latest = profileEvents.sort((a, b) => b.created_at - a.created_at)[0];
        try {
          const meta = JSON.parse(latest.content);
          profile = {
            name: meta.display_name || meta.name || "",
            picture: meta.picture || "",
          };
        } catch {}
      }
      setInfo({ pubkey, ownership, profile });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  return { info, loading };
}

// Discover all players from OWNERSHIP events
export function useAllTraders(enabled: boolean): {
  traders: RawTrader[];
  loading: boolean;
} {
  const [traders, setTraders] = useState<RawTrader[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !ISSUER_PUBKEY) return;
    let cancelled = false;
    setLoading(true);
    setTraders([]);

    list([{ kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], limit: 500 }]).then(
      async (events) => {
        if (cancelled) return;

        // Group ownership events by player pubkey (extracted from #p tags)
        const byPubkey: Record<string, typeof events> = {};
        for (const ev of events) {
          const p = ev.tags.find((t) => t[0] === "p")?.[1];
          if (p) {
            if (!byPubkey[p]) byPubkey[p] = [];
            byPubkey[p].push(ev);
          }
        }

        const pubkeys = Object.keys(byPubkey);
        if (!pubkeys.length) {
          setLoading(false);
          return;
        }

        // Compute ownership per player
        const ownerships: Record<string, Ownership> = {};
        for (const pk of pubkeys) ownerships[pk] = parseOwnership(byPubkey[pk]);

        // Fetch all profiles in a single relay query
        const profiles: Record<string, { name: string; picture: string } | null> = {};
        try {
          const profileEvents = await list([{ kinds: [0], authors: pubkeys }]);
          const latest: Record<string, (typeof profileEvents)[0]> = {};
          for (const ev of profileEvents) {
            if (!latest[ev.pubkey] || ev.created_at > latest[ev.pubkey].created_at)
              latest[ev.pubkey] = ev;
          }
          for (const pk of pubkeys) {
            const ev = latest[pk];
            if (ev) {
              try {
                const meta = JSON.parse(ev.content);
                profiles[pk] = {
                  name: meta.display_name || meta.name || "",
                  picture: meta.picture || "",
                };
              } catch {}
            } else {
              profiles[pk] = null;
            }
          }
        } catch {}

        if (cancelled) return;

        setTraders(
          pubkeys.map((pk) => ({
            pubkey: pk,
            ownership: ownerships[pk],
            profile: profiles[pk] ?? null,
          }))
        );
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { traders, loading };
}
