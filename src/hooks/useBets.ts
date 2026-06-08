"use client";

import { useEffect, useState, useCallback } from "react";
import type { EventTemplate } from "nostr-tools";
import { KIND } from "@/lib/constants";
import { list, subscribe } from "@/lib/pool";
import { signEvent } from "@/lib/identity";
import type { Identity } from "@/lib/identity";
import { zap } from "@/lib/zap";

export type BetPick = "home" | "draw" | "away";

export interface BetOffer {
  id: string;         // event id
  betId: string;      // d-tag
  author: string;     // sideA pubkey
  home: string;       // internal team code
  away: string;       // internal team code
  pick: BetPick;
  amount: number;     // sats per side
  createdAt: number;
}

export interface BetSettle {
  id: string;
  betId: string;
  action: "bet-locked-a" | "bet-matched" | "bet-settled";
  winner?: string;
  sideB?: string;
  amount?: number;
  result?: BetPick;
  status?: "paid" | "pending-lnaddr";
}

function parseOffer(ev: { id: string; pubkey: string; tags: string[][]; created_at: number }): BetOffer | null {
  const betId = ev.tags.find(t => t[0] === "d")?.[1];
  const home  = ev.tags.find(t => t[0] === "home")?.[1];
  const away  = ev.tags.find(t => t[0] === "away")?.[1];
  const pick  = ev.tags.find(t => t[0] === "pick")?.[1] as BetPick | undefined;
  const amt   = ev.tags.find(t => t[0] === "amount")?.[1];
  if (!betId || !home || !away || !pick || !amt) return null;
  return { id: ev.id, betId, author: ev.pubkey, home, away, pick, amount: Number(amt), createdAt: ev.created_at };
}

function parseSettle(ev: { id: string; tags: string[][] }): BetSettle | null {
  const betId  = ev.tags.find(t => t[0] === "bet")?.[1];
  const action = ev.tags.find(t => t[0] === "figus-action")?.[1];
  if (!betId || !action) return null;
  return {
    id: ev.id, betId,
    action: action as BetSettle["action"],
    winner: ev.tags.find(t => t[0] === "winner")?.[1],
    sideB:  ev.tags.find(t => t[0] === "sideB")?.[1],
    amount: ev.tags.find(t => t[0] === "amount")?.[1] ? Number(ev.tags.find(t => t[0] === "amount")![1]) : undefined,
    result: ev.tags.find(t => t[0] === "result")?.[1] as BetPick | undefined,
    status: ev.tags.find(t => t[0] === "status")?.[1] as BetSettle["status"],
  };
}

// Retorna bets abiertas/matched/settled para un partido (home, away = internal codes)
export function useBets(home: string, away: string) {
  const [offers, setOffers] = useState<BetOffer[]>([]);
  const [settles, setSettles] = useState<Map<string, BetSettle>>(new Map());
  const [loading, setLoading] = useState(true);

  const since = Math.floor(new Date("2026-06-01").getTime() / 1000);

  const reload = useCallback(async () => {
    if (!home || !away) { setLoading(false); return; }

    const [offerEvs, settleEvs] = await Promise.all([
      list([{ kinds: [KIND.BET_OFFER], since }]),
      list([{ kinds: [KIND.BET_SETTLE], since }]),
    ]);

    // Filter by team codes (relays may not support generic tag filters)
    const matchOffers = offerEvs
      .map(parseOffer)
      .filter((o): o is BetOffer => o !== null && o.home === home && o.away === away)
      .sort((a, b) => b.createdAt - a.createdAt);

    // Build latest settle per betId (prefer "bet-settled" > "bet-matched" > "bet-locked-a")
    const PRIORITY: Record<string, number> = {
      "bet-settled": 3,
      "bet-matched": 2,
      "bet-locked-a": 1,
    };
    const settleMap = new Map<string, BetSettle>();
    for (const ev of settleEvs) {
      const s = parseSettle(ev);
      if (!s) continue;
      const existing = settleMap.get(s.betId);
      const curPriority = PRIORITY[s.action] ?? 0;
      const existingPriority = existing ? (PRIORITY[existing.action] ?? 0) : -1;
      if (curPriority > existingPriority) settleMap.set(s.betId, s);
    }

    setOffers(matchOffers);
    setSettles(settleMap);
    setLoading(false);
  }, [home, away]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    reload();

    const unsub = subscribe(
      [
        { kinds: [KIND.BET_OFFER], since },
        { kinds: [KIND.BET_SETTLE], since },
      ],
      () => { if (!cancelled) reload(); }
    );
    return () => { cancelled = true; unsub(); };
  }, [home, away, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  return { offers, settles, loading, reload };
}

// Crea una oferta de apuesta y paga la primera mitad vía zap
export async function createBetAndLock(
  identity: Identity,
  home: string,
  away: string,
  pick: BetPick,
  amountSats: number,
  issuerLnAddress: string,
  issuerPubkey: string,
): Promise<{ betId: string; invoice: string; paid: boolean }> {
  const ts = Math.floor(Date.now() / 1000);
  const betId = `bet:${identity.pubkey.slice(0, 8)}:${ts}`;

  // 1. Publicar el BET_OFFER en Nostr
  const offerTmpl: EventTemplate = {
    kind: KIND.BET_OFFER,
    created_at: ts,
    content: "",
    tags: [
      ["d", betId],
      ["home", home],
      ["away", away],
      ["pick", pick],
      ["amount", String(amountSats)],
      ["expires", String(ts + 7 * 24 * 3600)], // 7 días
    ],
  };
  await signEvent(offerTmpl, identity.mode); // sign + publish handled by caller or do it here

  // Actually we need to publish too — use the pool
  const { getPool, getRelays } = await import("@/lib/pool");
  const signedOffer = await signEvent(offerTmpl, identity.mode);
  await Promise.any(getPool().publish(getRelays(), signedOffer));

  // 2. Pagar vía zap al issuer con figus-action: bet-lock
  const result = await zap({
    amountSats,
    target: { pubkey: issuerPubkey, lnurlOrAddress: issuerLnAddress },
    extraTags: [
      ["figus-action", "bet-lock"],
      ["bet", betId],
    ],
    signerMode: identity.mode,
  });

  return { betId, invoice: result.invoice, paid: result.paid };
}

// Acepta una apuesta existente y paga vía zap
export async function acceptBetAndLock(
  identity: Identity,
  offer: BetOffer,
  issuerLnAddress: string,
  issuerPubkey: string,
): Promise<{ invoice: string; paid: boolean }> {
  const result = await zap({
    amountSats: offer.amount,
    target: { pubkey: issuerPubkey, lnurlOrAddress: issuerLnAddress },
    extraTags: [
      ["figus-action", "bet-lock"],
      ["bet", offer.betId],
      ["a", `${KIND.BET_OFFER}:${offer.author}:${offer.betId}`],
    ],
    signerMode: identity.mode,
  });
  return { invoice: result.invoice, paid: result.paid };
}
