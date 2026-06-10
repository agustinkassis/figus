// TEST E2E CON LIGHTNING REAL — compra de un sobre pagando la factura del issuer.
// A diferencia de order-flow.ts (que solo espera el GRANT y sirve para MODO MOCK),
// este script PAGA la factura real vía NWC y verifica que el issuer la cobre
// (lookup_invoice) y conceda las figus. Prueba el camino productivo completo.
//
// Requisitos:
//   - Issuer corriendo con ISSUER_NWC real (sin ISSUER_PAYMENTS=mock).
//   - ISSUER_NWC en el entorno = wallet que paga la factura (puede ser la misma
//     que cobra; muchas wallets permiten el auto-pago).
// Uso: npm run test:pay
import "../lib"; // dotenv + WebSocket polyfill
import { SimplePool, finalizeEvent, generateSecretKey, getPublicKey, type Event } from "nostr-tools";
import { nwcPayServer } from "../../src/lib/nwc-server";

const RELAYS = (process.env.NEXT_PUBLIC_RELAYS || "ws://localhost:7777")
  .split(",").map((r) => r.trim()).filter(Boolean);
const ISSUER = process.env.NEXT_PUBLIC_ISSUER_PUBKEY || "";
const NWC = process.env.ISSUER_NWC || process.env.REWARD_NWC || "";

function waitFor(pool: SimplePool, filter: object, label: string, ms: number): Promise<Event> {
  return new Promise((res, rej) => {
    const sub = pool.subscribeMany(RELAYS, filter as any, { onevent: (ev) => { sub.close(); res(ev); } });
    setTimeout(() => { sub.close(); rej(new Error(`timeout esperando ${label}`)); }, ms);
  });
}

async function main() {
  if (!ISSUER) throw new Error("Falta NEXT_PUBLIC_ISSUER_PUBKEY en .env");
  if (!NWC) throw new Error("Falta ISSUER_NWC (o REWARD_NWC) para pagar la factura");

  const pool = new SimplePool();
  const sk = generateSecretKey();
  const buyer = getPublicKey(sk);
  console.log(`🙋 Comprador: ${buyer.slice(0, 12)}…`);

  const req = finalizeEvent({
    kind: 1583, created_at: Math.floor(Date.now() / 1000), content: "",
    tags: [["figus-action", "open-pack"]],
  }, sk);

  const grantP = waitFor(pool, {
    kinds: [1573], authors: [ISSUER], "#p": [buyer], since: req.created_at - 2,
  }, "GRANT", 60_000);

  console.log("📤 Publicando ORDER_REQUEST (open-pack)…");
  await Promise.any(pool.publish(RELAYS, req)).catch(() => {});

  const inv = await waitFor(pool, { kinds: [1584], authors: [ISSUER], "#e": [req.id] }, "ORDER_INVOICE", 20_000);
  const bolt11 = inv.tags.find((t) => t[0] === "bolt11")![1];
  const amount = inv.tags.find((t) => t[0] === "amount")?.[1];
  console.log(`🧾 Factura real: ${amount} sats — ${bolt11.slice(0, 30)}…`);

  console.log("💸 Pagando la factura vía NWC…");
  try {
    await nwcPayServer(bolt11, NWC);
    console.log("✅ pay_invoice aceptado por la wallet");
  } catch (e) {
    console.error("❌ PAGO FALLÓ:", (e as Error).message);
    console.error("   → si dice 'self payment', la wallet no permite auto-pago; pagá con otra wallet.");
    pool.close(RELAYS); process.exit(2);
  }

  console.log("⏳ Esperando que el issuer confirme (lookup_invoice) y conceda…");
  const grant = await grantP;
  const figus = grant.tags.filter((t) => t[0] === "sticker").map((t) => Number(t[1].split(":")[1]));
  pool.close(RELAYS);

  if (figus.length === 7) {
    console.log(`\n🎉 PASS — pago real confirmado, sobre concedido. Figus: ${figus.join(", ")}`);
    process.exit(0);
  } else {
    console.log(`\n❌ FAIL — se esperaban 7 figus, llegaron ${figus.length}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
