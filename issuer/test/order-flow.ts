// TEST DEL CAMINO FELIZ — compra legítima de un sobre vía el flujo de órdenes.
// El cliente publica ORDER_REQUEST, el issuer responde con ORDER_INVOICE y, tras
// "cobrar" la factura (en MODO MOCK se autoconfirma), concede el GRANT.
//
// Requisitos: issuer corriendo con ISSUER_PAYMENTS=mock contra los mismos relays.
// Uso: npx tsx issuer/test/order-flow.ts
import "../lib"; // dotenv + WebSocket polyfill
import { SimplePool, finalizeEvent, generateSecretKey, getPublicKey, type Event } from "nostr-tools";

const RELAYS = (process.env.NEXT_PUBLIC_RELAYS || "ws://localhost:7777")
  .split(",").map((r) => r.trim()).filter(Boolean);
const ISSUER = process.env.NEXT_PUBLIC_ISSUER_PUBKEY || "";

function waitFor(pool: SimplePool, filter: object, label: string, timeoutMs: number): Promise<Event> {
  return new Promise((resolve, reject) => {
    const sub = pool.subscribeMany(RELAYS, filter as any, {
      onevent: (ev) => { sub.close(); resolve(ev); },
    });
    setTimeout(() => { sub.close(); reject(new Error(`timeout esperando ${label}`)); }, timeoutMs);
  });
}

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

  // Escuchar el GRANT desde ya (puede llegar rápido en modo mock).
  const grantP = waitFor(pool, {
    kinds: [1573], authors: [ISSUER], "#p": [buyer], since: req.created_at - 2,
  }, "GRANT", 30_000);

  console.log("📤 Publicando ORDER_REQUEST (open-pack)…");
  await Promise.any(pool.publish(RELAYS, req)).catch(() => {});

  const invoiceEv = await waitFor(pool, {
    kinds: [1584], authors: [ISSUER], "#e": [req.id],
  }, "ORDER_INVOICE", 15_000);
  const bolt11 = invoiceEv.tags.find((t) => t[0] === "bolt11")?.[1];
  const amount = invoiceEv.tags.find((t) => t[0] === "amount")?.[1];
  console.log(`🧾 Factura recibida: ${amount} sats — ${bolt11?.slice(0, 24)}…`);
  console.log("   (en MODO MOCK el issuer la autoconfirma; con NWC real, pagala ahora)");

  const grant = await grantP;
  const stickers = grant.tags.filter((t) => t[0] === "sticker").map((t) => Number(t[1].split(":")[1]));
  pool.close(RELAYS);

  if (stickers.length === 7) {
    console.log(`\n✅ PASS — sobre concedido tras pago confirmado. Figus: ${stickers.join(", ")}`);
    process.exit(0);
  } else {
    console.log(`\n❌ FAIL — se esperaban 7 figus, llegaron ${stickers.length}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
