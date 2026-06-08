import "dotenv/config";
import type { Event } from "nostr-tools";
import { RELAYS, ALBUM_ID, pool, publish, issuerPubkey, now, tag } from "./lib";
import { CATALOG, ALL_NUMBERS, rollSticker } from "../src/lib/catalog";
import {
  parseMatch, parseCommit, parseBlock, parseReveal, deriveMatchState,
} from "../src/lib/penalty";
import { handleBetLock, handleBetCancel, loadBetState, settleBetsForMatch } from "./bets";
import { startFootballPoller } from "./football";

const KIND = {
  OWNERSHIP: 30100,
  GRANT: 1573,
  LISTING: 30200,
  SETTLEMENT: 1574,
  ZAP_RECEIPT: 9735,
  PENALTY_MATCH:  30301,
  PENALTY_COMMIT: 1576,
  PENALTY_BLOCK:  1577,
  PENALTY_REVEAL: 1578,
  STEAL_CLAIM:    1580,
  BET_CANCEL:     1593,
};

const ISSUER = issuerPubkey();
const seen = new Set<string>();

// Pubkey Nostr de la Lightning Address del issuer (puede diferir de ISSUER).
// rizful.com y otros providers tienen su propia keypair para publicar receipts.
let LN_PUBKEY: string | null = null;

async function resolveLnPubkey(): Promise<void> {
  const addr = process.env.NEXT_PUBLIC_ISSUER_LN_ADDRESS;
  if (!addr?.includes("@")) return;
  const [name, domain] = addr.split("@");
  try {
    const res = await fetch(`https://${domain}/.well-known/lnurlp/${name}`);
    const data = await res.json() as { nostrPubkey?: string };
    if (data.nostrPubkey) {
      LN_PUBKEY = data.nostrPubkey;
      console.log(`   LN pubkey (${addr}): ${LN_PUBKEY.slice(0, 12)}…`);
    }
  } catch (e) {
    console.log("   ⚠️ No se pudo resolver la pubkey de la LN address");
  }
}

/**
 * Lee la cantidad vigente de una figu para un usuario (último 30100).
 * Mantiene un cache en memoria + consulta a relays como respaldo.
 */
const ownCache = new Map<string, number>(); // `${pk}:${num}` -> count

function ownKey(pk: string, num: number) {
  return `${pk}:${num}`;
}

async function getOwnership(pk: string, num: number): Promise<number> {
  const key = ownKey(pk, num);
  if (ownCache.has(key)) return ownCache.get(key)!;
  // consultar a relays
  const evs = await listOnce([
    { kinds: [KIND.OWNERSHIP], authors: [ISSUER], "#p": [pk], "#d": [`${pk}:${ALBUM_ID}:${num}`] },
  ]);
  const latest = evs.sort((a, b) => b.created_at - a.created_at)[0];
  const count = latest ? Number(tag(latest, "count") || "0") : 0;
  ownCache.set(key, count);
  return count;
}

async function setOwnership(pk: string, num: number, count: number) {
  ownCache.set(ownKey(pk, num), count);
  await publish({
    kind: KIND.OWNERSHIP,
    created_at: now(),
    content: "",
    tags: [
      ["d", `${pk}:${ALBUM_ID}:${num}`],
      ["p", pk],
      ["sticker", `${ALBUM_ID}:${num}`],
      ["count", String(count)],
      ["pasted", count > 0 ? "true" : "false"],
    ],
  });
}

async function bump(pk: string, num: number, delta: number) {
  const cur = await getOwnership(pk, num);
  await setOwnership(pk, num, Math.max(0, cur + delta));
}

async function listOnce(filters: any[]): Promise<Event[]> {
  const results = await Promise.all(
    filters.map((f) => pool.querySync(RELAYS, f, { maxWait: 3000 }))
  );
  const byId = new Map<string, Event>();
  for (const arr of results) for (const ev of arr) byId.set(ev.id, ev);
  return Array.from(byId.values());
}

// Extrae el zap request (9734) embebido en el campo description del receipt
function extractZapRequest(receipt: Event): Event | null {
  const desc = tag(receipt, "description");
  if (!desc) return null;
  try {
    return JSON.parse(desc) as Event;
  } catch {
    return null;
  }
}

async function handleOpenPack(req: Event) {
  const buyer = req.pubkey;
  const count = 7;
  const drawn = Array.from({ length: count }, rollSticker);

  await publish({
    kind: KIND.GRANT,
    created_at: now(),
    content: "",
    tags: [
      ["p", buyer],
      ...drawn.map((n) => ["sticker", `${ALBUM_ID}:${n}`] as string[]),
    ],
  });

  for (const n of drawn) await bump(buyer, n, +1);
  console.log(`🎁 grant a ${buyer.slice(0, 8)}…: figus ${drawn.join(", ")}`);
}

async function handleBuySticker(req: Event, receipt: Event) {
  const buyer = req.pubkey;
  const aTag = tag(req, "a"); // "30200:<seller>:<d>"
  if (!aTag) return;
  const [, seller, ...dParts] = aTag.split(":");
  const d = dParts.join(":");

  // buscar el listing
  const listings = await listOnce([
    { kinds: [KIND.LISTING], authors: [seller], "#d": [d] },
  ]);
  const listing = listings.sort((a, b) => b.created_at - a.created_at)[0];
  if (!listing) return console.log("⚠️ listing no encontrado:", aTag);
  if (tag(listing, "status") !== "open") return console.log("⚠️ listing no abierto");

  const sticker = tag(listing, "sticker")!;
  const num = Number(sticker.split(":")[1]);

  // validar tenencia del vendedor
  const sellerHas = await getOwnership(seller, num);
  if (sellerHas < 1) return console.log("⚠️ el vendedor no tiene la figu");

  // transferir
  await bump(seller, num, -1);
  await bump(buyer, num, +1);

  // cerrar listing (republicar con status sold) — lo hace el issuer como árbitro
  // nota: en NIP el addressable lo reemplaza su autor; aquí publicamos el settlement
  // como verdad y el cliente filtra por settlements.
  await publish({
    kind: KIND.SETTLEMENT,
    created_at: now(),
    content: "",
    tags: [
      ["e", receipt.id],
      ["a", aTag],
      ["sticker", sticker],
      ["from", seller],
      ["to", buyer],
      ["price", tag(listing, "price") || "0"],
    ],
  });
  console.log(`🤝 settlement #${num}: ${seller.slice(0, 8)}… → ${buyer.slice(0, 8)}…`);
}

async function onReceipt(receipt: Event) {
  if (seen.has(receipt.id)) return;
  seen.add(receipt.id);

  const recipient = tag(receipt, "p");
  const req = extractZapRequest(receipt);
  const action = req ? tag(req, "figus-action") : null;
  const buyer = req?.pubkey ?? receipt.tags.find((t) => t[0] === "P")?.[1];

  const isToIssuer = recipient === ISSUER || (LN_PUBKEY !== null && recipient === LN_PUBKEY);

  console.log(`📥 Receipt ${receipt.id.slice(0, 10)} | recipient=${recipient?.slice(0, 10)} | toIssuer=${isToIssuer} | desc=${req ? "SI" : "NO"} | action=${action ?? "ninguna"} | buyer=${buyer?.slice(0, 10) ?? "?"}`);

  if (!buyer) {
    console.log("   ⚠️ Sin zapper identificable, ignorando");
    return;
  }

  try {
    if (action === "open-pack") {
      await handleOpenPack(req!);
    } else if (action === "buy-sticker") {
      await handleBuySticker(req!, receipt);
    } else if (action === "bet-lock") {
      await handleBetLock(req!, receipt);
    } else if (isToIssuer) {
      // Zap a la LN address del issuer sin action explícita → open-pack
      // (cubre providers que stripean tags custom del zap request en el description)
      console.log(`⚡ Zap al issuer, asumiendo open-pack para ${buyer.slice(0, 10)}`);
      await handleOpenPack({ pubkey: buyer, tags: req?.tags ?? [] } as unknown as Event);
    } else {
      console.log(`   ⚠️ Receipt ignorado (destinatario: ${recipient?.slice(0, 10)}, no es al issuer)`);
    }
  } catch (e) {
    console.error("Error procesando receipt:", e);
  }
}

// ─── Robo de figuritas (penalty match) ───────────────────────────────────────

const stealSeen = new Set<string>(); // coord:winner — dedup en memoria

async function handleStealClaim(ev: Event) {
  const coord = tag(ev, "a");
  if (!coord) return console.log("⚠️ steal claim sin coord de partida");

  if (stealSeen.has(ev.id)) return;
  stealSeen.add(ev.id);

  console.log(`🃏 steal claim de ${ev.pubkey.slice(0, 8)}… para ${coord} (ev ${ev.id.slice(0, 10)}…)`);

  // Verificar que no procesamos esto antes (sobrevive reinicios del issuer)
  const existingSettlements = await listOnce([{
    kinds: [KIND.SETTLEMENT], authors: [ISSUER], "#p": [ev.pubkey], "#a": [coord],
  }]);
  if (existingSettlements.some(e => tag(e, "figus-action") === "penalty-steal")) {
    return console.log(`ℹ️ steal ya procesado anteriormente: ${coord}:${ev.pubkey.slice(0, 8)}…`);
  }

  // Parsear coord: "30301:challengerPubkey:d"
  const parts = coord.split(":");
  if (parts.length < 3) return console.log("⚠️ coord inválido:", coord);
  const challengerPk = parts[1];
  const d = parts.slice(2).join(":");

  // Obtener el evento del match
  const matchEvs = await listOnce([{
    kinds: [KIND.PENALTY_MATCH], authors: [challengerPk], "#d": [d],
  }]);
  const matchEv = matchEvs.sort((a, b) => b.created_at - a.created_at)[0];
  if (!matchEv) return console.log("⚠️ match event no encontrado:", coord);

  const match = parseMatch(matchEv);
  if (!match) return console.log("⚠️ no se pudo parsear el match");

  // Obtener eventos de juego (commits, blocks, reveals)
  const playEvs = await listOnce([{
    kinds: [KIND.PENALTY_COMMIT, KIND.PENALTY_BLOCK, KIND.PENALTY_REVEAL], "#a": [coord],
  }]);

  const commits = playEvs
    .filter(e => e.kind === KIND.PENALTY_COMMIT)
    .flatMap(e => { const c = parseCommit(e); return c ? [c] : []; });
  const blocks = playEvs
    .filter(e => e.kind === KIND.PENALTY_BLOCK)
    .flatMap(e => { const b = parseBlock(e); return b ? [b] : []; });
  const reveals = playEvs
    .filter(e => e.kind === KIND.PENALTY_REVEAL)
    .flatMap(e => { const r = parseReveal(e); return r ? [r] : []; });

  const state = deriveMatchState(match, commits, blocks, reveals);

  if (state.phase !== "finished") {
    return console.log("⚠️ match no terminado todavía (phase:", state.phase + ")");
  }
  if (!state.winner) {
    return console.log("⚠️ empate — nadie roba");
  }
  if (state.winner !== ev.pubkey) {
    return console.log(`⚠️ ${ev.pubkey.slice(0, 8)}… no es el ganador (ganó ${state.winner.slice(0, 8)}…)`);
  }

  const winner = ev.pubkey;
  const loser = winner === match.challenger ? match.challenged : match.challenger;

  // Obtener las figuritas del perdedor
  const ownershipEvs = await listOnce([{
    kinds: [KIND.OWNERSHIP], authors: [ISSUER], "#p": [loser],
  }]);

  // Agrupar por d-tag, tomar el más reciente por figurita
  const latestByD = new Map<string, { num: number; count: number; ts: number }>();
  for (const e of ownershipEvs) {
    const dTag = tag(e, "d");
    const stickerTag = tag(e, "sticker");
    const countStr = tag(e, "count");
    if (!dTag || !stickerTag || !countStr) continue;
    const num = Number(stickerTag.split(":")[1]);
    const count = Number(countStr);
    const existing = latestByD.get(dTag);
    if (!existing || e.created_at > existing.ts) {
      latestByD.set(dTag, { num, count, ts: e.created_at });
    }
  }

  const available = [...latestByD.values()]
    .filter(({ count }) => count > 0)
    .map(({ num }) => num);

  if (available.length === 0) {
    return console.log(`ℹ️ ${loser.slice(0, 8)}… no tiene figuritas para robar`);
  }

  const stolen = available[Math.floor(Math.random() * available.length)];

  await bump(loser, stolen, -1);
  await bump(winner, stolen, +1);

  await publish({
    kind: KIND.SETTLEMENT,
    created_at: now(),
    content: "",
    tags: [
      ["e", ev.id],
      ["a", coord],
      ["figus-action", "penalty-steal"],
      ["sticker", `${ALBUM_ID}:${stolen}`],
      ["from", loser],
      ["to", winner],
      ["p", winner],
    ],
  });

  console.log(`🃏 steal: figu #${stolen} de ${loser.slice(0, 8)}… → ${winner.slice(0, 8)}…`);
}

async function main() {
  console.log("⚡ Issuer Figus escuchando zap receipts…");
  console.log("   pubkey:", ISSUER);
  console.log("   relays:", RELAYS.join(", "));
  await resolveLnPubkey();
  await loadBetState();
  startFootballPoller(settleBetsForMatch);

  // Verificar conectividad: suscribirse a text notes para confirmar que llegan eventos
  let connOk = false;
  const connCheck = pool.subscribeMany(
    RELAYS,
    { kinds: [1], limit: 1 },
    {
      onevent: () => {
        if (!connOk) {
          connOk = true;
          connCheck.close();
          console.log("   ✅ Conectado a relays — recibiendo eventos");
        }
      },
    }
  );
  setTimeout(() => {
    if (!connOk) console.log("   ⚠️  Sin eventos tras 10s — verificá la conexión a internet");
  }, 10000);

  // escuchar receipts dirigidos a CUALQUIER destinatario relevante:
  // - al issuer (open-pack)
  // - a vendedores (buy-sticker) — filtramos por figus-action dentro del request
  console.log("   Escuchando zap receipts (kind 9735)…");
  pool.subscribeMany(
    RELAYS,
    { kinds: [KIND.ZAP_RECEIPT], since: now() - 60 },
    { onevent: onReceipt }
  );

  // Recuperar bet-lock receipts de los últimos 30 min que pudo haberse perdido
  // durante un reinicio. El estado de la apuesta (sideAPaid) previene duplicados.
  (async () => {
    const recoverSince = now() - 30 * 60;
    const recentReceipts = await pool.querySync(
      RELAYS,
      { kinds: [KIND.ZAP_RECEIPT], since: recoverSince },
      { maxWait: 6000 }
    );
    let recovered = 0;
    for (const ev of recentReceipts) {
      const req = extractZapRequest(ev);
      if (!req) continue;
      const action = tag(req, "figus-action");
      if (action === "bet-lock") {
        await onReceipt(ev); // seen-set dedup + sideAPaid check en handleBetLock
        recovered++;
      }
    }
    if (recovered > 0) console.log(`   ✅ Recuperados ${recovered} bet-lock receipt(s) perdidos`);
  })().catch(console.error);

  console.log("   Escuchando steal claims (kind 1580)…");
  pool.subscribeMany(
    RELAYS,
    { kinds: [KIND.STEAL_CLAIM], since: now() - 300 },
    { onevent: (ev) => handleStealClaim(ev).catch(console.error) }
  );

  console.log("   Escuchando bet cancels (kind 1593)…");
  pool.subscribeMany(
    RELAYS,
    { kinds: [KIND.BET_CANCEL], since: now() - 300 },
    { onevent: (ev) => handleBetCancel(ev).catch(console.error) }
  );
}

main();
