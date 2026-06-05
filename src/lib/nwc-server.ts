// Server-only NWC payment module — do NOT import from client components.
// Uses the Node.js `ws` package instead of the browser WebSocket global.
import WebSocket from "ws";
import * as nip04 from "nostr-tools/nip04";
import { finalizeEvent } from "nostr-tools/pure";

interface NwcConn {
  walletPubkey: string;
  relays: string[];
  secret: Uint8Array;
}

export function parseNwcServer(str: string): NwcConn {
  const url = new URL(str.replace(/^nostr\+walletconnect:\/\//, "https://"));
  const walletPubkey = url.hostname;
  const relays = url.searchParams.getAll("relay").filter(Boolean);
  const secretHex = url.searchParams.get("secret") ?? "";
  if (!walletPubkey || !relays.length || !secretHex) {
    throw new Error("NWC string inválida — falta pubkey, relay o secret");
  }
  const secret = Uint8Array.from(
    secretHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
  );
  return { walletPubkey, relays, secret };
}

export async function nwcPayServer(invoice: string, nwcString: string): Promise<void> {
  const conn = parseNwcServer(nwcString);
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
      await publishWs(relayUrl, event);
      return;
    } catch (e: any) {
      errors.push(`${relayUrl}: ${e.message}`);
    }
  }
  throw new Error(errors.join(" | ") || "No se pudo publicar en ningún relay NWC");
}

function publishWs(url: string, event: object): Promise<void> {
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
    }, 15_000);

    ws.on("open", () => ws.send(JSON.stringify(["EVENT", event])));

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as unknown[];
        if (msg[0] === "OK" && msg[1] === (event as { id: string }).id) {
          ws.close();
          if (msg[2]) done(resolve);
          else done(() => reject(new Error((msg[3] as string) || "Relay rechazó el evento")));
        }
      } catch {}
    });

    ws.on("error", (e: Error) => done(() => reject(e)));
    ws.on("close", () => done(() => reject(new Error("Conexión cerrada antes de confirmar"))));
  });
}

// ── Fetch a Nostr event from a relay (Node.js WebSocket) ──────────────────────

export async function fetchNostrEvents(
  relayUrl: string,
  filter: object,
  timeoutMs = 10_000
): Promise<object[]> {
  const events: object[] = [];
  return new Promise((resolve) => {
    let done = false;
    const ws = new WebSocket(relayUrl);
    const timer = setTimeout(() => {
      if (!done) { done = true; try { ws.close(); } catch {} resolve(events); }
    }, timeoutMs);

    ws.on("open", () => ws.send(JSON.stringify(["REQ", "r1", filter])));

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as unknown[];
        if (msg[0] === "EVENT" && msg[1] === "r1") {
          events.push(msg[2] as object);
        } else if (msg[0] === "EOSE" && msg[1] === "r1" && !done) {
          done = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve(events);
        }
      } catch {}
    });

    ws.on("error", () => { if (!done) { done = true; clearTimeout(timer); resolve(events); } });
  });
}
