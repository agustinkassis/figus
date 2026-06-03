import "dotenv/config";
import WebSocket from "ws";

// Polyfill para Node.js 20 (no tiene WebSocket global sin --experimental-websocket)
// Debe setearse antes de que nostr-tools cree cualquier conexión
(globalThis as any).WebSocket = WebSocket;

import {
  SimplePool,
  finalizeEvent,
  getPublicKey,
  nip19,
  type EventTemplate,
  type Event,
} from "nostr-tools";

export const RELAYS = (process.env.NEXT_PUBLIC_RELAYS ||
  "wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

export const ALBUM_ID = process.env.NEXT_PUBLIC_ALBUM_ID || "mundial-2026";

// Resuelve la clave privada del issuer desde ISSUER_NSEC (nsec o hex)
export function getIssuerSk(): Uint8Array {
  const raw = process.env.ISSUER_NSEC;
  if (!raw) throw new Error("Falta ISSUER_NSEC en .env");
  if (raw.startsWith("nsec")) {
    const { data } = nip19.decode(raw);
    return data as Uint8Array;
  }
  return Uint8Array.from(Buffer.from(raw, "hex"));
}

export function issuerPubkey(): string {
  return getPublicKey(getIssuerSk());
}

export const pool = new SimplePool();

export async function publish(template: EventTemplate): Promise<Event> {
  const ev = finalizeEvent(template, getIssuerSk());
  await Promise.any(pool.publish(RELAYS, ev));
  return ev;
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

export function tag(ev: Event, name: string): string | undefined {
  return ev.tags.find((t) => t[0] === name)?.[1];
}
