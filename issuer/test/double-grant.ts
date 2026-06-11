// TEST DE REGRESIÓN — doble concesión por re-entrada del poller de cobro.
//
// En producción se observó que UNA orden pagada generaba 2-3 GRANTs: la
// conciliación (lookup NWC + bumps de ownership) tarda más que ORDER_POLL_MS y
// el poller volvía a entrar a fulfillOrder con la orden todavía "pending".
//
// Este test reproduce esa condición con pagos mock y un lookup artificialmente
// lento (MOCK_LOOKUP_DELAY_MS > ORDER_POLL_MS) y exige que llegue EXACTAMENTE
// UN GRANT por orden.
//
// Requisitos: relay local + issuer corriendo así:
//   npx tsx issuer/test/relay.ts
//   ISSUER_PAYMENTS=mock MOCK_LOOKUP_DELAY_MS=9000 ORDER_POLL_MS=3000 npx tsx issuer/index.ts
// Uso: npx tsx issuer/test/double-grant.ts
import "../lib"; // dotenv + WebSocket polyfill
import { SimplePool, finalizeEvent, generateSecretKey, getPublicKey, type Event } from "nostr-tools";

const RELAYS = (process.env.NEXT_PUBLIC_RELAYS || "ws://localhost:7777")
  .split(",").map((r) => r.trim()).filter(Boolean);
const ISSUER = process.env.NEXT_PUBLIC_ISSUER_PUBKEY || "";

// Ventana de observación: el lookup lento (9s) + margen para ticks re-entrantes.
const OBSERVE_MS = 25_000;

async function main() {
  if (!ISSUER) throw new Error("Falta NEXT_PUBLIC_ISSUER_PUBKEY en .env");
  const pool = new SimplePool();

  const buyerSk = generateSecretKey();
  const buyer = getPublicKey(buyerSk);
  console.log(`🙋 Comprador: ${buyer.slice(0, 12)}…`);

  const req = finalizeEvent({
    kind: 1583, // ORDER_REQUEST
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    tags: [["figus-action", "open-pack"]],
  }, buyerSk);

  const grants: Event[] = [];
  pool.subscribeMany(RELAYS, {
    kinds: [1573], authors: [ISSUER], "#p": [buyer], since: req.created_at - 2,
  } as any, { onevent: (ev) => grants.push(ev) });

  console.log("📤 Publicando ORDER_REQUEST (open-pack)…");
  await Promise.any(pool.publish(RELAYS, req)).catch(() => {});

  console.log(`⏳ Observando GRANTs durante ${OBSERVE_MS / 1000}s (lookup mock lento)…`);
  await new Promise((r) => setTimeout(r, OBSERVE_MS));
  pool.close(RELAYS);

  const ids = new Set(grants.map((g) => g.id));
  console.log(`   GRANTs recibidos: ${ids.size}`);

  if (ids.size === 1) {
    console.log("\n✅ PASS — exactamente un GRANT por orden pagada (sin re-entrada).");
    process.exit(0);
  } else if (ids.size === 0) {
    console.log("\n❌ FAIL — no llegó ningún GRANT (¿issuer corriendo con ISSUER_PAYMENTS=mock?).");
    process.exit(1);
  } else {
    console.log(`\n❌ FAIL — ${ids.size} GRANTs para UNA orden: re-entrada del poller (doble concesión).`);
    process.exit(1);
  }
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
