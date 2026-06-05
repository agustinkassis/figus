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

// Merge nostr + local taking the max per sticker
function mergeOwn(nostr: Ownership, local: Ownership): Ownership {
  const result: Ownership = { ...local };
  for (const k of Object.keys(nostr)) {
    const n = Number(k);
    result[n] = Math.max(result[n] ?? 0, nostr[n]);
  }
  return result;
}

// Subtract confirmed sales from merged ownership.
// soldCounts[num] = how many times the current user has sold sticker `num`.
// This corrects mergeOwn when local cache is stale (higher than Nostr after a sale).
function subtractSales(merged: Ownership, soldCounts: Record<number, number>): Ownership {
  if (Object.keys(soldCounts).length === 0) return merged;
  const result = { ...merged };
  for (const k of Object.keys(soldCounts)) {
    const n = Number(k);
    result[n] = Math.max(0, (result[n] ?? 0) - soldCounts[n]);
  }
  return result;
}

export function useGameState(pubkey: string | null) {
  const [ownership, setOwnership] = useState<Ownership>({});
  const [listings, setListings] = useState<Listing[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasClaimedFreePack, setHasClaimedFreePack] = useState(false);
  const ownEvents    = useRef<Event[]>([]);
  const listingEvents = useRef<Event[]>([]);
  // Track how many of each sticker the current user has sold (confirmed by settlement events).
  // Subtracted from the merged ownership so stale local cache doesn't show sold stickers.
  const soldCounts = useRef<Record<number, number>>({});

  useEffect(() => {
    // Reset all refs when account changes
    ownEvents.current = [];
    soldCounts.current = {};

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
          setOwnership(subtractSales(mergeOwn(parseOwnership(owns), readLocalOwn(pubkey)), soldCounts.current));
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
        const parsedSt = st.map(parseSettlement).filter((s): s is Settlement => s !== null);
        setSettlements(parsedSt);

        // Remove settled listings from the open market (client-side, since the issuer
        // can't close the seller's listing — it's signed by the seller's key).
        // Build a count of how many times each (seller, stickerNum) pair was settled,
        // then remove that many open listings from our local state.
        if (parsedSt.length > 0) {
          const settledCounts: Record<string, number> = {};
          for (const s of parsedSt) {
            const key = `${s.from}:${s.stickerNum}`;
            settledCounts[key] = (settledCounts[key] ?? 0) + 1;
          }
          setListings(prev => {
            const remaining = { ...settledCounts };
            return prev.filter(l => {
              const key = `${l.seller}:${l.stickerNum}`;
              if ((remaining[key] ?? 0) > 0) {
                remaining[key]--;
                return false;
              }
              return true;
            });
          });
        }

        if (pubkey) {
          // Rebuild sold counts from all historical settlements where we're the seller
          const counts: Record<number, number> = {};
          for (const s of parsedSt) {
            if (s.from === pubkey) {
              counts[s.stickerNum] = (counts[s.stickerNum] ?? 0) + 1;
            }
          }
          soldCounts.current = counts;

          if (Object.keys(counts).length > 0) {
            // Re-apply ownership with sold counts subtracted
            setOwnership(subtractSales(
              mergeOwn(parseOwnership(ownEvents.current), readLocalOwn(pubkey)),
              counts
            ));
          }
        }
      }

      if (!cancelled) setLoading(false);

      if (pubkey) {
        unsubs.push(
          subscribe(
            [{ kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], "#p": [pubkey] }],
            (ev) => {
              ownEvents.current = [...ownEvents.current, ev];
              setOwnership(subtractSales(
                mergeOwn(parseOwnership(ownEvents.current), readLocalOwn(pubkey)),
                soldCounts.current
              ));
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
          if (s) {
            setSettlements((prev) => {
              // Dedup: ignore if already in state (relay may re-deliver on reconnect)
              if (prev.some(p => p.id === s.id)) return prev;
              return [s, ...prev];
            });
            // Remove the settled listing from the open market regardless of who sold it
            setListings(prev => {
              const idx = prev.findIndex(l => l.seller === s.from && l.stickerNum === s.stickerNum);
              if (idx === -1) return prev;
              return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
            });
            if (pubkey && s.from === pubkey) {
              // Update soldCounts ref and subtract from ownership state
              soldCounts.current = {
                ...soldCounts.current,
                [s.stickerNum]: (soldCounts.current[s.stickerNum] ?? 0) + 1,
              };
              setOwnership(prev => {
                const next = { ...prev };
                next[s.stickerNum] = Math.max(0, (next[s.stickerNum] ?? 0) - 1);
                return next;
              });
            }
          }
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
    setOwnership(subtractSales(mergeOwn(parseOwnership(owns), readLocalOwn(pubkey)), soldCounts.current));
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

  const addSticker = useCallback((num: number) => {
    if (!pubkey) return;
    try {
      const local = readLocalOwn(pubkey);
      local[num] = (local[num] ?? 0) + 1;
      writeLocalOwn(pubkey, local);
      setOwnership(prev => {
        const next = { ...prev };
        next[num] = (next[num] ?? 0) + 1;
        return next;
      });
    } catch {}
  }, [pubkey]);

  return { ownership, listings, settlements, owned, dupes, loading, refresh, albumId: ALBUM_ID, hasClaimedFreePack, claimPack, addSticker };
}
