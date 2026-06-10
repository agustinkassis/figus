// TEST DE SEGURIDAD — intento de exploit: forjar un zap receipt para acuñar un sobre
// gratis. Con el issuer endurecido (Fix #1) esto NO debe conceder ninguna figurita.
//
// Requisitos: issuer corriendo contra los mismos relays (ver issuer/test/README.md).
// Uso: npx tsx issuer/test/forge-attack.ts
import "../lib"; // dotenv + WebSocket polyfill
import { SimplePool, finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";

const RELAYS = (process.env.NEXT_PUBLIC_RELAYS || "ws://localhost:7777")
  .split(",").map((r) => r.trim()).filter(Boolean);
const ISSUER = process.env.NEXT_PUBLIC_ISSUER_PUBKEY || "";

async function main() {
  if (!ISSUER) throw new Error("Falta NEXT_PUBLIC_ISSUER_PUBKEY en .env");
  const pool = new SimplePool();

  const attackerSk = generateSecretKey();
  const attacker = getPublicKey(attackerSk);
  console.log(`🦹 Atacante: ${attacker.slice(0, 12)}…`);

  // Zap request FALSO embebido en el description (lo que el issuer parseaba sin verificar).
  const fakeZapRequest = {
    kind: 9734,
    pubkey: attacker,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    tags: [["figus-action", "open-pack"], ["p", ISSUER], ["amount", "21000"]],
  };

  // Receipt 9735 forjado, firmado con la clave del propio atacante (no del provider LN).
  const forged = finalizeEvent(
    {
      kind: 9735,
      created_at: Math.floor(Date.now() / 1000),
      content: "",
      tags: [
        ["p", ISSUER],
        ["P", attacker],
        ["description", JSON.stringify(fakeZapRequest)],
      ],
    },
    attackerSk
  );

  console.log("📤 Publicando receipt forjado…");
  await Promise.any(pool.publish(RELAYS, forged)).catch(() => {});

  console.log("⏳ Esperando 10s para ver si el issuer concede figus indebidamente…");
  await new Promise((r) => setTimeout(r, 10_000));

  const grants = await pool.querySync(RELAYS, {
    kinds: [1573], authors: [ISSUER], "#p": [attacker],
  }, { maxWait: 4000 });
  const owns = await pool.querySync(RELAYS, {
    kinds: [30100], authors: [ISSUER], "#p": [attacker],
  }, { maxWait: 4000 });

  pool.close(RELAYS);

  if (grants.length === 0 && owns.length === 0) {
    console.log("\n✅ PASS — el receipt forjado NO concedió figuritas. Exploit bloqueado.");
    process.exit(0);
  } else {
    console.log(`\n❌ FAIL — VULNERABLE: ${grants.length} grant(s), ${owns.length} ownership(s) acuñados sin pago.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
