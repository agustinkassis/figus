import "dotenv/config";
import type { Event } from "nostr-tools";
import { pool, publish, issuerPubkey, now, tag, RELAYS } from "./lib";
import { nwcPayServer } from "../src/lib/nwc-server";
import { tlaToCode, type ApiMatch } from "./football";

const KIND_BET_OFFER = 30400;
const KIND_BET_SETTLE = 1592;

const ISSUER = issuerPubkey();
const FEE_RATE = 0.02; // 2%

// Estado en memoria de cada apuesta
interface BetState {
  offerCoord: string;             // "30400:{sideA}:{betId}"
  sideA: string;                  // pubkey del apostador A (creó la oferta)
  sideB: string | null;           // pubkey del apostador B (aceptó)
  amount: number;                 // sats por lado
  home: string;                   // código interno del equipo local (ej: "mex")
  away: string;                   // código interno del equipo visitante (ej: "rsa")
  pick: "home" | "draw" | "away"; // pronóstico del apostador A
  sideAPaid: boolean;
  sideBPaid: boolean;
}

const bets = new Map<string, BetState>();
const settledBets = new Set<string>(); // betIds ya liquidados

async function listOnce(filters: object[]): Promise<Event[]> {
  const results = await Promise.all(
    filters.map((f) => pool.querySync(RELAYS, f as any, { maxWait: 4000 }))
  );
  const byId = new Map<string, Event>();
  for (const arr of results) for (const ev of arr) byId.set(ev.id, ev);
  return Array.from(byId.values());
}

// Reconstruye estado de apuestas a partir de BET_SETTLE publicados por el issuer.
// Llamar al inicio para sobrevivir reinicios.
export async function loadBetState(): Promise<void> {
  const since = Math.floor(new Date("2026-06-01").getTime() / 1000);
  const settles = await listOnce([{ kinds: [KIND_BET_SETTLE], authors: [ISSUER], since }]);

  for (const ev of settles) {
    const betId = tag(ev, "bet");
    const action = tag(ev, "figus-action");
    if (!betId || !action) continue;

    if (action === "bet-settled") {
      settledBets.add(betId);
      continue;
    }

    const sideA = tag(ev, "sideA") ?? "";
    const sideB = tag(ev, "sideB") ?? null;
    const amount = Number(tag(ev, "amount") ?? "0");
    const home = tag(ev, "home") ?? "";
    const away = tag(ev, "away") ?? "";
    const pick = (tag(ev, "pick") ?? "home") as "home" | "draw" | "away";

    if (!bets.has(betId)) {
      bets.set(betId, {
        offerCoord: `${KIND_BET_OFFER}:${sideA}:${betId}`,
        sideA, sideB: null, amount, home, away, pick,
        sideAPaid: false, sideBPaid: false,
      });
    }
    const state = bets.get(betId)!;

    if (action === "bet-locked-a") {
      state.sideAPaid = true;
    } else if (action === "bet-matched") {
      state.sideAPaid = true;
      state.sideBPaid = true;
      if (sideB) state.sideB = sideB;
    }
  }

  console.log(
    `📊 Bet state: ${bets.size} apuestas, ${settledBets.size} ya liquidadas`
  );
}

export async function handleBetLock(req: Event, receipt: Event): Promise<void> {
  const betId = tag(req, "bet");
  const payer = req.pubkey;
  if (!betId) return console.log("   bet-lock sin tag 'bet'");
  if (settledBets.has(betId)) return console.log(`   bet ${betId} ya liquidada, ignorando`);

  // Cargar estado desde Nostr si no está en memoria
  let state = bets.get(betId);
  if (!state) {
    const offers = await listOnce([{ kinds: [KIND_BET_OFFER], "#d": [betId] }]);
    const offer = offers.sort((a, b) => b.created_at - a.created_at)[0];
    if (!offer) return console.log(`   bet-lock: BET_OFFER ${betId} no encontrado`);

    const amount = Number(tag(offer, "amount") ?? "0");
    const home = tag(offer, "home") ?? "";
    const away = tag(offer, "away") ?? "";
    const pick = (tag(offer, "pick") ?? "home") as "home" | "draw" | "away";

    state = {
      offerCoord: `${KIND_BET_OFFER}:${offer.pubkey}:${betId}`,
      sideA: offer.pubkey,
      sideB: null,
      amount, home, away, pick,
      sideAPaid: false, sideBPaid: false,
    };
    bets.set(betId, state);
  }

  // Validar monto mínimo
  const amountMsats = Number(tag(receipt, "amount") ?? "0");
  const amountSats = Math.floor(amountMsats / 1000);
  if (amountSats < state.amount) {
    return console.log(`   bet-lock: pago insuficiente ${amountSats} < ${state.amount} sats`);
  }

  if (payer === state.sideA) {
    if (state.sideAPaid) return console.log(`   bet-lock: sideA ya pagó para ${betId}`);
    state.sideAPaid = true;
    console.log(`🎯 bet-lock sideA (${payer.slice(0, 8)}…) bet ${betId}: ${amountSats} sats`);

    await publish({
      kind: KIND_BET_SETTLE,
      created_at: now(),
      content: "",
      tags: [
        ["figus-action", "bet-locked-a"],
        ["bet", betId],
        ["a", state.offerCoord],
        ["p", state.sideA],
        ["sideA", state.sideA],
        ["amount", String(state.amount)],
        ["home", state.home],
        ["away", state.away],
        ["pick", state.pick],
      ],
    });
  } else {
    if (!state.sideAPaid) {
      return console.log(`   bet-lock: sideA aún no pagó; rechazando pago de ${payer.slice(0, 8)}…`);
    }
    if (state.sideBPaid) return console.log(`   bet-lock: sideB ya pagó para ${betId}`);

    state.sideB = payer;
    state.sideBPaid = true;
    console.log(`🎯 bet-lock sideB (${payer.slice(0, 8)}…) bet ${betId}: ${amountSats} sats → MATCHED`);

    await publish({
      kind: KIND_BET_SETTLE,
      created_at: now(),
      content: "",
      tags: [
        ["figus-action", "bet-matched"],
        ["bet", betId],
        ["a", state.offerCoord],
        ["p", state.sideA],
        ["p", payer],
        ["sideA", state.sideA],
        ["sideB", payer],
        ["amount", String(state.amount)],
        ["home", state.home],
        ["away", state.away],
        ["pick", state.pick],
      ],
    });

    console.log(`✅ Bet MATCHED ${betId}: ${state.sideA.slice(0, 8)}… vs ${payer.slice(0, 8)}… por ${state.amount * 2} sats`);
  }
}

async function getLud16(pubkey: string): Promise<string | null> {
  const profiles = await listOnce([{ kinds: [0], authors: [pubkey], limit: 1 }]);
  const profile = profiles.sort((a, b) => b.created_at - a.created_at)[0];
  if (!profile) return null;
  try {
    const content = JSON.parse(profile.content) as Record<string, unknown>;
    return typeof content.lud16 === "string" ? content.lud16 : null;
  } catch {
    return null;
  }
}

async function payLnAddress(lnAddress: string, sats: number): Promise<void> {
  const nwcStr = process.env.REWARD_NWC;
  if (!nwcStr) throw new Error("REWARD_NWC no configurado");

  const [name, domain] = lnAddress.split("@");
  if (!name || !domain) throw new Error(`lud16 inválido: ${lnAddress}`);

  const metaRes = await fetch(`https://${domain}/.well-known/lnurlp/${name}`);
  if (!metaRes.ok) throw new Error(`LNURL lookup falló: ${metaRes.status}`);
  const meta = (await metaRes.json()) as {
    callback: string;
    minSendable: number;
    maxSendable: number;
  };

  const msats = sats * 1000;
  if (msats < meta.minSendable || msats > meta.maxSendable) {
    throw new Error(
      `Monto ${sats} sats fuera de rango LNURL [${meta.minSendable / 1000}, ${meta.maxSendable / 1000}]`
    );
  }

  const cbRes = await fetch(`${meta.callback}?amount=${msats}`);
  if (!cbRes.ok) throw new Error(`LNURL callback falló: ${cbRes.status}`);
  const { pr } = (await cbRes.json()) as { pr: string };

  await nwcPayServer(pr, nwcStr);
}

// Liquida todas las apuestas matched para un partido que terminó.
export async function settleBetsForMatch(match: ApiMatch): Promise<void> {
  const { homeTeam, awayTeam, score } = match;
  const homeGoals = score.fullTime.home!;
  const awayGoals = score.fullTime.away!;
  const result: "home" | "draw" | "away" =
    homeGoals > awayGoals ? "home" : homeGoals < awayGoals ? "away" : "draw";

  const homeCode = tlaToCode(homeTeam.tla);
  const awayCode = tlaToCode(awayTeam.tla);

  console.log(
    `⚽ ${homeTeam.tla}(${homeCode}) ${homeGoals}-${awayGoals} ${awayTeam.tla}(${awayCode}) → ${result}`
  );

  // Traer todas las BET_OFFERs desde el inicio del torneo y filtrar por equipos
  const since = Math.floor(new Date("2026-06-01").getTime() / 1000);
  const offers = await listOnce([{ kinds: [KIND_BET_OFFER], since }]);
  const matchOffers = offers.filter(
    (ev) => tag(ev, "home") === homeCode && tag(ev, "away") === awayCode
  );

  if (matchOffers.length === 0) {
    console.log(`   Sin apuestas para ${homeCode} vs ${awayCode}`);
    return;
  }

  console.log(`   ${matchOffers.length} BET_OFFERs encontradas para ${homeCode} vs ${awayCode}`);

  for (const offerEv of matchOffers) {
    const betId = tag(offerEv, "d");
    if (!betId) continue;
    if (settledBets.has(betId)) { console.log(`   Bet ${betId}: ya liquidada`); continue; }

    const state = bets.get(betId);
    if (!state || !state.sideAPaid || !state.sideBPaid || !state.sideB) {
      console.log(`   Bet ${betId}: no matched (sideAPaid=${state?.sideAPaid}, sideBPaid=${state?.sideBPaid})`);
      continue;
    }

    const winner = state.pick === result ? state.sideA : state.sideB!;
    const loser = winner === state.sideA ? state.sideB! : state.sideA;
    const totalPot = state.amount * 2;
    const fee = Math.floor(totalPot * FEE_RATE);
    const winAmount = totalPot - fee;

    console.log(
      `🏆 Bet ${betId}: pick=${state.pick} resultado=${result} → ganador=${winner.slice(0, 8)}… premio=${winAmount} sats (fee=${fee})`
    );

    const baseTags = [
      ["figus-action", "bet-settled"],
      ["bet", betId],
      ["a", state.offerCoord],
      ["p", winner],
      ["winner", winner],
      ["loser", loser],
      ["sideA", state.sideA],
      ["sideB", state.sideB!],
      ["amount", String(winAmount)],
      ["fee", String(fee)],
      ["result", result],
      ["home", homeCode],
      ["away", awayCode],
      ["pick", state.pick],
    ];

    const lud16 = await getLud16(winner);
    if (!lud16) {
      console.log(`⚠️ Ganador ${winner.slice(0, 8)}… sin lud16 — marcando pendiente`);
      settledBets.add(betId);
      await publish({
        kind: KIND_BET_SETTLE,
        created_at: now(),
        content: "",
        tags: [...baseTags, ["status", "pending-lnaddr"]],
      });
      continue;
    }

    try {
      await payLnAddress(lud16, winAmount);
      settledBets.add(betId);
      await publish({
        kind: KIND_BET_SETTLE,
        created_at: now(),
        content: "",
        tags: [...baseTags, ["status", "paid"], ["lud16", lud16]],
      });
      console.log(`💸 Pagado ${winAmount} sats a ${lud16} — bet ${betId} ✓`);
    } catch (e: any) {
      console.error(`❌ Error pagando bet ${betId}:`, e.message);
      // No agrego a settledBets para reintentar
    }
  }
}
