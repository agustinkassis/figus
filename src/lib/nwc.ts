"use client";

import * as nip04 from "nostr-tools/nip04";
import { finalizeEvent, getPublicKey } from "nostr-tools";

const STORAGE_KEY = "figus-nwc";

export function getNwcString(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function saveNwcString(s: string): void {
  localStorage.setItem(STORAGE_KEY, s);
}

export function clearNwcString(): void {
  localStorage.removeItem(STORAGE_KEY);
}

interface NwcConn {
  walletPubkey: string;
  relays: string[];
  secret: Uint8Array;
}

// nostr+walletconnect://<walletPubkey>?relay=<relay>&secret=<hex>
export function parseNwc(str: string): NwcConn {
  // Reemplazamos solo el scheme para que URL() pueda parsear correctamente.
  // Con "https://" el hostname queda como la walletPubkey.
  const url = new URL(str.replace(/^nostr\+walletconnect:\/\//, "https://"));
  const walletPubkey = url.hostname;
  // Algunos providers usan múltiples parámetros "relay"
  const relays = url.searchParams.getAll("relay").filter(Boolean);
  if (!relays.length) {
    const single = url.searchParams.get("relay");
    if (single) relays.push(single);
  }
  const secretHex = url.searchParams.get("secret") ?? "";
  if (!walletPubkey || !relays.length || !secretHex) {
    throw new Error("Cadena NWC inválida — verificá que incluya pubkey, relay y secret");
  }
  if (!/^[0-9a-fA-F]+$/.test(secretHex) || secretHex.length % 2 !== 0) {
    throw new Error(`NWC secret inválido: "${secretHex.slice(0, 12)}…"`);
  }
  const secret = Uint8Array.from(
    secretHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
  );
  return { walletPubkey, relays, secret };
}

// Publica un pay_invoice request (NIP-47 kind 23194) a la wallet del usuario.
// Usa WebSocket nativo en lugar del pool compartido para mayor compatibilidad con
// relays NWC que requieren rutas específicas o usan NIP-42 auth.
export async function nwcPay(invoice: string, nwcString: string): Promise<void> {
  const conn = parseNwc(nwcString);
  const payload = JSON.stringify({ method: "pay_invoice", params: { invoice } });
  const encrypted = nip04.encrypt(conn.secret, conn.walletPubkey, payload);

  const event = finalizeEvent(
    {
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      content: encrypted,
      tags: [["p", conn.walletPubkey]],
    },
    conn.secret
  );

  const errors: string[] = [];
  for (const relayUrl of conn.relays) {
    try {
      await publishViaNativeWs(relayUrl, event);
      return; // primer relay que acepta → listo
    } catch (e: any) {
      errors.push(`${relayUrl}: ${e.message}`);
    }
  }
  throw new Error(errors.join(" | ") || "No se pudo publicar en ningún relay NWC");
}

function publishViaNativeWs(
  url: string,
  event: ReturnType<typeof finalizeEvent>
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      done(() => reject(new Error(`Timeout conectando a ${url}`)));
    }, 10000);

    ws.onopen = () => {
      ws.send(JSON.stringify(["EVENT", event]));
    };

    ws.onmessage = (e: MessageEvent) => {
      try {
        const msg: unknown[] = JSON.parse(e.data as string);
        // ["OK", eventId, accepted, message?]
        if (msg[0] === "OK" && msg[1] === event.id) {
          ws.close();
          if (msg[2]) {
            done(resolve);
          } else {
            done(() => reject(new Error((msg[3] as string) || "Relay rechazó el evento")));
          }
        }
        // NOTICE sin OK → ignorar pero no cerrar
      } catch { /* ignorar parse errors */ }
    };

    ws.onerror = () => {
      done(() => reject(new Error(`Error de conexión: ${url}`)));
    };

    ws.onclose = () => {
      done(() => reject(new Error(`Conexión cerrada antes de confirmar: ${url}`)));
    };
  });
}
