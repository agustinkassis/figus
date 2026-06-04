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

const LOCAL_OWN_KEY = "figus_local_own";
const LOCAL_CLAIMED_KEY = "figus_local_claimed";

function readLocalOwn(): Ownership {
  try { return JSON.parse(localStorage.getItem(LOCAL_OWN_KEY) ?? "{}") ?? {}; }
  catch { return {}; }
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
  const [ownership, setOwnership] = useState<Ownership>(() => readLocalOwn());
  const [listings, setListings] = useState<Listing[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasClaimedFreePack, setHasClaimedFreePack] = useState<boolean>(() => {
    try { return !!localStorage.getItem(LOCAL_CLAIMED_KEY); }
    catch { return false; }
  });
  const ownEvents = useRef<Event[]>([]);

  // Carga inicial + suscripciones vivas
  useEffect(() => {
    if (!ISSUER_PUBKEY) {
      setLoading(false);
      return;
    }
    let unsubs: Array<() => void> = [];
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Mi colección + detección de sobre gratis
      if (pubkey) {
        const [owns, grants, freeClaims] = await Promise.all([
          list([{ kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], "#p": [pubkey] }]),
          list([{ kinds: [KIND.GRANT], authors: [ISSUER_PUBKEY], "#p": [pubkey], limit: 1 }]),
          list([{ kinds: [KIND.FREE_PACK_CLAIM], authors: [pubkey], "#d": [`free-pack:${ALBUM_ID}`] }]),
        ]);
        if (!cancelled) {
          ownEvents.current = owns;
          setOwnership(mergeOwn(parseOwnership(owns), readLocalOwn()));
          const claimed = grants.length > 0 || freeClaims.length > 0 || !!localStorage.getItem(LOCAL_CLAIMED_KEY);
          setHasClaimedFreePack(claimed);
          if (claimed) localStorage.setItem(LOCAL_CLAIMED_KEY, "1");
        }
      }

      // Ofertas abiertas del mercadito
      const ls = await list([{ kinds: [KIND.LISTING] }]);
      if (!cancelled) setListings(parseListings(ls).filter((l) => l.status === "open"));

      // Settlements recientes
      const st = await list([{ kinds: [KIND.SETTLEMENT], authors: [ISSUER_PUBKEY] }]);
      if (!cancelled) {
        setSettlements(
          st.map(parseSettlement).filter((s): s is Settlement => s !== null)
        );
      }

      if (!cancelled) setLoading(false);

      // --- live subscriptions ---
      if (pubkey) {
        unsubs.push(
          subscribe(
            [{ kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], "#p": [pubkey] }],
            (ev) => {
              ownEvents.current = [...ownEvents.current, ev];
              setOwnership(mergeOwn(parseOwnership(ownEvents.current), readLocalOwn()));
            }
          )
        );
      }
      unsubs.push(
        subscribe([{ kinds: [KIND.LISTING] }], () => {
          list([{ kinds: [KIND.LISTING] }]).then((all) =>
            setListings(parseListings(all).filter((l) => l.status === "open"))
          );
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
    setOwnership(mergeOwn(parseOwnership(owns), readLocalOwn()));
  }, [pubkey]);

  // Saves stickers locally (used for free-pack fallback and penalty goal reward).
  // Immediately updates state + persists to localStorage so stickers survive reload.
  const claimPack = useCallback((nums: number[]) => {
    setHasClaimedFreePack(true);
    try {
      localStorage.setItem(LOCAL_CLAIMED_KEY, "1");
      const local = readLocalOwn();
      for (const n of nums) local[n] = (local[n] ?? 0) + 1;
      localStorage.setItem(LOCAL_OWN_KEY, JSON.stringify(local));
      setOwnership(prev => {
        const next = { ...prev };
        for (const n of nums) next[n] = (next[n] ?? 0) + 1;
        return next;
      });
    } catch {}
  }, []);

  return { ownership, listings, settlements, owned, dupes, loading, refresh, albumId: ALBUM_ID, hasClaimedFreePack, claimPack };
}
