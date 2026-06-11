// Server-only NWC payment module — do NOT import from client components.
// Uses the Node.js `ws` package instead of the browser WebSocket global.
import WebSocket from "ws";
import * as nip04 from "nostr-tools/nip04";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

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
  await nwcRequest("pay_invoice", { invoice }, nwcString);
}

// ── NIP-47 request/response genérico ──────────────────────────────────────────
// Publica un request (kind 23194) cifrado y espera la respuesta (kind 23195) de la
// wallet, p-tagged a nosotros y e-tagged al request. Devuelve el `result` decodificado.
export async function nwcRequest(
  method: string,
  params: Record<string, unknown>,
  nwcString: string,
  timeoutMs = 20_000
): Promise<Record<string, unknown>> {
  const conn = parseNwcServer(nwcString);
  const clientPubkey = getPublicKey(conn.secret);
  const payload = JSON.stringify({ method, params });
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
      return await requestResponseWs(relayUrl, event, conn, clientPubkey, method, timeoutMs);
    } catch (e: any) {
      errors.push(`${relayUrl}: ${e.message}`);
    }
  }
  throw new Error(errors.join(" | ") || "No se pudo completar el request NWC");
}

// Crea una factura en la wallet del issuer. Devuelve bolt11 + payment_hash.
export async function nwcMakeInvoice(
  amountSats: number,
  description: string,
  nwcString: string
): Promise<{ invoice: string; paymentHash: string }> {
  const res = await nwcRequest(
    "make_invoice",
    { amount: amountSats * 1000, description },
    nwcString
  );
  const invoice = (res.invoice ?? res.bolt11) as string | undefined;
  const paymentHash = res.payment_hash as string | undefined;
  if (!invoice || !paymentHash) {
    throw new Error("make_invoice no devolvió invoice/payment_hash");
  }
  return { invoice, paymentHash };
}

// Consulta el estado de una factura emitida por el issuer.
export async function nwcLookupInvoice(
  paymentHash: string,
  nwcString: string
): Promise<{ settled: boolean; amountSats: number }> {
  const res = await nwcRequest("lookup_invoice", { payment_hash: paymentHash }, nwcString);
  // Log crudo para diagnosticar wallets con campos no estándar
  console.log(`   lookup_invoice raw response: ${JSON.stringify(res)}`);
  // NIP-47: settled_at (epoch), state === "settled", settled === true,
  // o preimage presente y no vacío (indica pago confirmado en varias wallets)
  const settled =
    Boolean(res.settled_at) ||
    res.state === "settled" ||
    res.state === "SETTLED" ||
    res.settled === true ||
    (typeof res.preimage === "string" && res.preimage.length > 0) ||
    res.paid === true;
  const amountMsats = Number(res.amount_received ?? res.amount ?? 0);
  return { settled, amountSats: Math.floor(amountMsats / 1000) };
}

// Variante WS que envía el request y espera el 23195 correspondiente.
function requestResponseWs(
  url: string,
  event: object,
  conn: NwcConn,
  clientPubkey: string,
  method: string,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const reqId = (event as { id: string }).id;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      fn();
    };

    const ws = new WebSocket(url);
    const timer = setTimeout(
      () => done(() => reject(new Error(`Timeout esperando respuesta NWC de ${url}`))),
      timeoutMs
    );

    ws.on("open", () => {
      ws.send(JSON.stringify(["EVENT", event]));
      // Suscribirse a la respuesta 23195 dirigida a nosotros, referenciando el request.
      ws.send(JSON.stringify(["REQ", "nwc-res", {
        kinds: [23195],
        authors: [conn.walletPubkey],
        "#p": [clientPubkey],
        "#e": [reqId],
        limit: 1,
      }]));
    });

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as unknown[];
        if (msg[0] === "OK" && msg[1] === reqId && !msg[2]) {
          return done(() => reject(new Error((msg[3] as string) || "Relay rechazó el request NWC")));
        }
        if (msg[0] === "EVENT" && msg[1] === "nwc-res") {
          const resEv = msg[2] as { content: string };
          const plain = nip04.decrypt(conn.secret, conn.walletPubkey, resEv.content);
          const parsed = JSON.parse(plain) as {
            result_type?: string;
            error?: { code: string; message: string } | null;
            result?: Record<string, unknown>;
          };
          if (parsed.error) {
            return done(() => reject(new Error(`${parsed.error!.code}: ${parsed.error!.message}`)));
          }
          return done(() => resolve(parsed.result ?? {}));
        }
      } catch { /* ignorar parse/decrypt errors de mensajes ajenos */ }
    });

    ws.on("error", (e: Error) => done(() => reject(e)));
    ws.on("close", () => done(() => reject(new Error("Conexión NWC cerrada antes de responder"))));
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
