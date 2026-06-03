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

export function useGameState(pubkey: string | null) {
  const [ownership, setOwnership] = useState<Ownership>({});
  const [listings, setListings] = useState<Listing[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasClaimedFreePack, setHasClaimedFreePack] = useState(false);
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
          // Al menos 1 GRANT del issuer = ya abrió algún sobre (gratis o pago)
          list([{ kinds: [KIND.GRANT], authors: [ISSUER_PUBKEY], "#p": [pubkey], limit: 1 }]),
          // El usuario mismo publica el claim como prueba persistente en Nostr
          list([{ kinds: [KIND.FREE_PACK_CLAIM], authors: [pubkey], "#d": [`free-pack:${ALBUM_ID}`] }]),
        ]);
        if (!cancelled) {
          ownEvents.current = owns;
          setOwnership(parseOwnership(owns));
          setHasClaimedFreePack(grants.length > 0 || freeClaims.length > 0);
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
              setOwnership(parseOwnership(ownEvents.current));
            }
          )
        );
      }
      unsubs.push(
        subscribe([{ kinds: [KIND.LISTING] }], () => {
          // re-leer ofertas (simple y robusto)
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
    setOwnership(parseOwnership(owns));
  }, [pubkey]);

  return { ownership, listings, settlements, owned, dupes, loading, refresh, albumId: ALBUM_ID, hasClaimedFreePack };
}
