import "dotenv/config";
import {
  generateSecretKey,
  getPublicKey,
  nip19,
  finalizeEvent,
  type EventTemplate,
} from "nostr-tools";
import { RELAYS, ALBUM_ID, pool, getIssuerSk } from "./lib";
import { CATALOG, ALL_NUMBERS } from "../src/lib/catalog";

const KIND = { ALBUM: 30050, STICKER: 30051, PACK: 30052 };

async function main() {
  let sk: Uint8Array;

  if (!process.env.ISSUER_NSEC) {
    // Generar par nuevo y mostrarlo para que lo copien al .env
    sk = generateSecretKey();
    const pk = getPublicKey(sk);
    console.log("\n=== NUEVO PAR DE CLAVES DEL ISSUER ===");
    console.log("Copiá esto en tu archivo .env:\n");
    console.log(`ISSUER_NSEC=${nip19.nsecEncode(sk)}`);
    console.log(`NEXT_PUBLIC_ISSUER_PUBKEY=${pk}\n`);
    console.log("Luego volvé a correr `npm run seed` para publicar el catálogo.\n");
    return;
  }

  sk = getIssuerSk();
  const pk = getPublicKey(sk);
  console.log("Issuer pubkey:", pk);
  console.log("Publicando catálogo en:", RELAYS.join(", "));

  const sign = (t: EventTemplate) => finalizeEvent(t, sk);
  const created_at = Math.floor(Date.now() / 1000);

  // Album definition
  const album = sign({
    kind: KIND.ALBUM,
    created_at,
    content: JSON.stringify({ description: "Álbum oficial Figus Mundial 2026" }),
    tags: [
      ["d", ALBUM_ID],
      ["title", "Álbum Mundial 2026"],
      ["total", String(ALL_NUMBERS.length)],
    ],
  });
  await Promise.any(pool.publish(RELAYS, album));

  // Sticker templates
  for (const n of ALL_NUMBERS) {
    const s = CATALOG[n];
    const ev = sign({
      kind: KIND.STICKER,
      created_at,
      content: "",
      tags: [
        ["d", `${ALBUM_ID}:${n}`],
        ["a", `${KIND.ALBUM}:${pk}:${ALBUM_ID}`],
        ["number", String(n)],
        ["name", s.name],
        ["team", s.team],
        ["rarity", s.rarity],
      ],
    });
    await Promise.any(pool.publish(RELAYS, ev));
  }

  // Pack definition
  const pack = sign({
    kind: KIND.PACK,
    created_at,
    content: JSON.stringify({
      odds: { common: 0.78, rare: 0.17, shiny: 0.045, legendary: 0.005 },
    }),
    tags: [
      ["d", "pack-basico"],
      ["a", `${KIND.ALBUM}:${pk}:${ALBUM_ID}`],
      ["title", "Sobre clásico"],
      ["price", "500"],
      ["count", "4"],
    ],
  });
  await Promise.any(pool.publish(RELAYS, pack));

  console.log(`\n✅ Catálogo publicado: ${ALL_NUMBERS.length} figus + 1 sobre.`);
  console.log("Ya podés arrancar el cliente con `npm run dev`.\n");
  pool.close(RELAYS);
}

main().then(() => process.exit(0));
