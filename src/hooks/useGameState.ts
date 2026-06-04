"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Event } from "nostr-tools";
import { KIND, ISSUER_PUBKEY, ALBUM_ID } from "@/lib/constants";
import { list, subscribe } from "@/lib/pool";
import {
  parseListings,
  parseOwnership,
  parseSettlement,
} from "@/lib/parsers";
import type { Listing, Ownership, Settlement } from "@/lib/types";
import { ALL_NUMBERS } from "@/lib/catalog";

const ownKey     = (pk: string) => `figus_own_${pk}`;
const claimedKey = (pk: string) => `figus_claimed_${pk}`;

function readLocalOwn(pubkey: string): Ownership {
  try { return JSON.parse(localStorage.getItem(ownKey(pubkey)) ?? "{}") ?? {}; }
  catch { return {}; }
}

function writeLocalOwn(pubkey: string, own: Ownership) {
  try { localStorage.setItem(ownKey(pubkey), JSON.stringify(own)); } catch {}
}

function isLocalClaimed(pubkey: string): boolean {
  try { return !!localStorage.getItem(claimedKey(pubkey)); } catch { return false; }
}

// Take the higher count per sticker from both sources
function mergeOwn(nostr: Ownership, local: Ownership): Ownership {
  const result: Ownership = { ...local };
  for (const k of Object.keys(nostr)) {
    const n = Number(k);
    result[n] = Math.max(result[n] ?? 0, nostr[n]);
  }
  return result;
}

export function useGameState(pubkey: string | null) {
  const [ownership, setOwnership] = useState<Ownership>({});
  const [listings, setListings] = useState<Listing[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasClaimedFreePack, setHasClaimedFreePack] = useState(false);
  const ownEvents = useRef<Event[]>([]);
  const listingEvents = useRef<Event[]>([]);

  useEffect(() => {
    // Reset state immediately when account changes so previous account's data
    // never flashes on screen for the new account.
    ownEvents.current = [];
    if (pubkey) {
      setOwnership(readLocalOwn(pubkey));
      setHasClaimedFreePack(isLocalClaimed(pubkey));
    } else {
      setOwnership({});
      setHasClaimedFreePack(false);
    }

    if (!ISSUER_PUBKEY) {
      setLoading(false);
      return;
    }
    let unsubs: Array<() => void> = [];
    let cancelled = false;

    (async () => {
      setLoading(true);

      if (pubkey) {
        const [owns, grants, freeClaims] = await Promise.all([
          list([{ kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], "#p": [pubkey] }]),
          list([{ kinds: [KIND.GRANT], authors: [ISSUER_PUBKEY], "#p": [pubkey], limit: 1 }]),
          list([{ kinds: [KIND.FREE_PACK_CLAIM], authors: [pubkey], "#d": [`free-pack:${ALBUM_ID}`] }]),
        ]);
        if (!cancelled) {
          ownEvents.current = owns;
          setOwnership(mergeOwn(parseOwnership(owns), readLocalOwn(pubkey)));
          const claimed = grants.length > 0 || freeClaims.length > 0 || isLocalClaimed(pubkey);
          setHasClaimedFreePack(claimed);
          if (claimed) {
            try { localStorage.setItem(claimedKey(pubkey), "1"); } catch {}
          }
        }
      }

      const ls = await list([{ kinds: [KIND.LISTING] }]);
      if (!cancelled) {
        listingEvents.current = ls;
        setListings(parseListings(ls).filter((l) => l.status === "open"));
      }

      const st = await list([{ kinds: [KIND.SETTLEMENT], authors: [ISSUER_PUBKEY] }]);
      if (!cancelled) {
        setSettlements(
          st.map(parseSettlement).filter((s): s is Settlement => s !== null)
        );
      }

      if (!cancelled) setLoading(false);

      if (pubkey) {
        unsubs.push(
          subscribe(
            [{ kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], "#p": [pubkey] }],
            (ev) => {
              ownEvents.current = [...ownEvents.current, ev];
              setOwnership(mergeOwn(parseOwnership(ownEvents.current), readLocalOwn(pubkey)));
            }
          )
        );
      }
      unsubs.push(
        subscribe([{ kinds: [KIND.LISTING] }], (ev) => {
          listingEvents.current = [...listingEvents.current, ev];
          setListings(parseListings(listingEvents.current).filter((l) => l.status === "open"));
        })
      );
      unsubs.push(
        subscribe([{ kinds: [KIND.SETTLEMENT], authors: [ISSUER_PUBKEY] }], (ev) => {
          const s = parseSettlement(ev);
          if (s) setSettlements((prev) => [s, ...prev]);
        })
      );
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [pubkey]);

  const owned = ALL_NUMBERS.filter((n) => (ownership[n] || 0) > 0).length;
  const dupes = ALL_NUMBERS.filter((n) => (ownership[n] || 0) > 1);

  const refresh = useCallback(async () => {
    if (!pubkey || !ISSUER_PUBKEY) return;
    const owns = await list([
      { kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], "#p": [pubkey] },
    ]);
    ownEvents.current = owns;
    setOwnership(mergeOwn(parseOwnership(owns), readLocalOwn(pubkey)));
  }, [pubkey]);

  const claimPack = useCallback((nums: number[]) => {
    if (!pubkey) return;
    setHasClaimedFreePack(true);
    try {
      localStorage.setItem(claimedKey(pubkey), "1");
      const local = readLocalOwn(pubkey);
      for (const n of nums) local[n] = (local[n] ?? 0) + 1;
      writeLocalOwn(pubkey, local);
      setOwnership(prev => {
        const next = { ...prev };
        for (const n of nums) next[n] = (next[n] ?? 0) + 1;
        return next;
      });
    } catch {}
  }, [pubkey]);

  return { ownership, listings, settlements, owned, dupes, loading, refresh, albumId: ALBUM_ID, hasClaimedFreePack, claimPack };
}
