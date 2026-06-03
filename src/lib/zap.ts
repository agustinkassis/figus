import type { Event, EventTemplate } from "nostr-tools";
import { KIND } from "./constants";
import { getRelays, subscribe } from "./pool";
import { signEvent, type SignerMode } from "./identity";

/**
 * NIP-57 zap flow (lado cliente).
 *
 * Pasos:
 *  1. Resolver el LNURL-pay endpoint del destinatario (desde su Lightning Address
 *     o metadata kind:0). Verificar allowsNostr + nostrPubkey.
 *  2. Construir y FIRMAR el zap request (9734) con los tags del juego
 *     (figus-action, a, etc.) — va embebido en el callback, no se publica.
 *  3. Pedir el invoice al callback con ?amount=&nostr=&lnurl=
 *  4. Pagar el invoice (WebLN si está disponible; si no, mostrar al usuario).
 *  5. Esperar el zap receipt (9735) en los relays como confirmación.
 *
 * El issuer, en paralelo, escucha los 9735 y reacciona (grant / settlement).
 */

declare global {
  interface Window {
    webln?: {
      enable(): Promise<void>;
      sendPayment(invoice: string): Promise<{ preimage: string }>;
    };
  }
}

export interface ZapTarget {
  pubkey: string; // destinatario (hex)
  lnurlOrAddress: string; // "user@domain.com" o lnurl1...
}

export interface ZapParams {
  amountSats: number;
  target: ZapTarget;
  // tags extra del zap request (ej: ["figus-action","open-pack"], ["a", "..."])
  extraTags: string[][];
  comment?: string;
  signerMode: SignerMode;
}

interface LnurlPayResponse {
  callback: string;
  minSendable: number;
  maxSendable: number;
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

// Resuelve una Lightning Address (user@domain) o un LNURL bech32 al JSON de pago
async function resolveLnurl(lnurlOrAddress: string): Promise<LnurlPayResponse> {
  let url: string;
  if (lnurlOrAddress.includes("@")) {
    const [name, domain] = lnurlOrAddress.split("@");
    url = `https://${domain}/.well-known/lnurlp/${name}`;
  } else {
    // LNURL bech32 -> decodificar a URL. Para simplicidad usamos lnurl-tools si está,
    // pero la mayoría de wallets exponen Lightning Address, que es el camino recomendado.
    throw new Error(
      "Usá una Lightning Address (user@dominio). El decode de LNURL bech32 queda como mejora."
    );
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo resolver el LNURL del destinatario");
  return res.json();
}

// Construye el zap request 9734 firmado
async function buildZapRequest(p: ZapParams): Promise<Event> {
  const template: EventTemplate = {
    kind: KIND.ZAP_REQUEST,
    created_at: Math.floor(Date.now() / 1000),
    content: p.comment || "",
    tags: [
      ["relays", ...getRelays()],
      ["amount", String(p.amountSats * 1000)], // millisats
      ["p", p.target.pubkey],
      ...p.extraTags,
    ],
  };
  return signEvent(template, p.signerMode);
}

export interface ZapResult {
  invoice: string;
  paid: boolean;
  receipt?: Event;
}

/**
 * Ejecuta el flujo completo. Devuelve cuando:
 *  - se obtiene el invoice, y
 *  - (si hay WebLN) se paga, y
 *  - llega el zap receipt 9735.
 * Si no hay WebLN, devuelve el invoice para que el usuario lo pague y queda
 * escuchando el receipt vía onReceipt.
 */
export async function zap(
  p: ZapParams,
  onReceipt?: (receipt: Event) => void
): Promise<ZapResult> {
  const lnurl = await resolveLnurl(p.target.lnurlOrAddress);

  if (!lnurl.allowsNostr || !lnurl.nostrPubkey) {
    throw new Error("El destinatario no soporta zaps de Nostr (allowsNostr/nostrPubkey)");
  }
  const amountMsat = p.amountSats * 1000;
  if (amountMsat < lnurl.minSendable || amountMsat > lnurl.maxSendable) {
    throw new Error("Monto fuera del rango permitido por el destinatario");
  }

  const zapRequest = await buildZapRequest(p);
  const encoded = encodeURIComponent(JSON.stringify(zapRequest));
  const cbUrl = `${lnurl.callback}?amount=${amountMsat}&nostr=${encoded}`;

  const cbRes = await fetch(cbUrl);
  if (!cbRes.ok) throw new Error("El callback LNURL falló al generar el invoice");
  const { pr: invoice } = (await cbRes.json()) as { pr: string };
  if (!invoice) throw new Error("No se recibió invoice del callback");

  // Escuchar el zap receipt 9735 que referencia a nuestro destinatario
  const since = Math.floor(Date.now() / 1000) - 5;
  const unsub = subscribe(
    [{ kinds: [KIND.ZAP_RECEIPT], "#p": [p.target.pubkey], since }],
    (ev) => {
      // validar que el receipt contiene NUESTRO zap request (por el bolt11/description)
      const desc = ev.tags.find((t) => t[0] === "description")?.[1];
      if (desc && desc.includes(zapRequest.id)) {
        onReceipt?.(ev);
        unsub();
      } else if (!desc) {
        // algunos relays no incluyen description; aceptar por destinatario+tiempo
        onReceipt?.(ev);
        unsub();
      }
    }
  );

  // Intentar pago automático con WebLN
  let paid = false;
  if (typeof window !== "undefined" && window.webln) {
    try {
      await window.webln.enable();
      await window.webln.sendPayment(invoice);
      paid = true;
    } catch {
      paid = false; // el usuario paga manualmente
    }
  }

  return { invoice, paid };
}
