import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  type EventTemplate,
  type Event,
} from "nostr-tools";
import type { BunkerSigner } from "nostr-tools/nip46";

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: EventTemplate): Promise<Event>;
    };
  }
}

const LS_SK   = "figus:sk";
const LS_MODE = "figus:mode";
const LS_NIP46_CSK  = "figus:nip46:csk";
const LS_NIP46_BPK  = "figus:nip46:bpk";
const LS_NIP46_RELS = "figus:nip46:rels";
const LS_NIP46_SEC  = "figus:nip46:sec";
const LS_NIP46_PK   = "figus:nip46:pk";

const NIP46_RELAYS = [
  "wss://relay.nsec.app",
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
];

export type SignerMode = "nip07" | "local" | "nip46";

export interface Identity {
  pubkey: string;
  mode: SignerMode;
}

// Módulo-level signer para NIP-46
let _nip46: BunkerSigner | null = null;

export function hasNip07(): boolean {
  return typeof window !== "undefined" && !!window.nostr;
}

export async function loginNip07(): Promise<Identity> {
  if (!window.nostr) throw new Error("No hay extensión NIP-07 instalada");
  const pubkey = await window.nostr.getPublicKey();
  localStorage.setItem(LS_MODE, "nip07");
  return { pubkey, mode: "nip07" };
}

export function loginLocal(): Identity {
  let hex = localStorage.getItem(LS_SK);
  if (!hex) {
    const sk = generateSecretKey();
    hex = Buffer.from(sk).toString("hex");
    localStorage.setItem(LS_SK, hex);
  }
  const sk = Uint8Array.from(Buffer.from(hex, "hex"));
  return { pubkey: getPublicKey(sk), mode: "local" };
}

export function logoutLocal() {
  localStorage.removeItem(LS_SK);
  localStorage.removeItem(LS_MODE);
}

function clearNip46Session() {
  [LS_NIP46_CSK, LS_NIP46_BPK, LS_NIP46_RELS, LS_NIP46_SEC, LS_NIP46_PK].forEach(
    (k) => localStorage.removeItem(k)
  );
}

function saveNip46Session(
  clientSk: Uint8Array,
  bunkerPubkey: string,
  relays: string[],
  secret: string | null,
  pubkey: string
) {
  localStorage.setItem(LS_NIP46_CSK, Buffer.from(clientSk).toString("hex"));
  localStorage.setItem(LS_NIP46_BPK, bunkerPubkey);
  localStorage.setItem(LS_NIP46_RELS, JSON.stringify(relays));
  if (secret) localStorage.setItem(LS_NIP46_SEC, secret);
  localStorage.setItem(LS_NIP46_PK, pubkey);
  localStorage.setItem(LS_MODE, "nip46");
}

export function clearPersistedMode() {
  localStorage.removeItem(LS_MODE);
  clearNip46Session();
  _nip46?.close().catch(() => {});
  _nip46 = null;
}

export function getPersistedMode(): SignerMode | null {
  return (localStorage.getItem(LS_MODE) as SignerMode) ?? null;
}

/** Conecta via bunker:// URL o NIP-05 (ej. user@nsec.app) */
export async function loginNip46Bunker(
  url: string,
  onauth?: (authUrl: string) => void
): Promise<Identity> {
  const { BunkerSigner, parseBunkerInput } = await import("nostr-tools/nip46");
  const { SimplePool } = await import("nostr-tools/pool");

  const pointer = await parseBunkerInput(url.trim());
  if (!pointer) throw new Error("URL inválida. Usá bunker:// o un NIP-05 (ej. usuario@nsec.app).");

  const clientSecret = generateSecretKey();
  const pool = new SimplePool();
  const signer = BunkerSigner.fromBunker(clientSecret, pointer, { pool, onauth });

  await signer.connect();
  const pubkey = await signer.getPublicKey();

  _nip46 = signer;
  saveNip46Session(clientSecret, pointer.pubkey, pointer.relays, pointer.secret, pubkey);

  return { pubkey, mode: "nip46" };
}

/**
 * Genera el URI nostrconnect://, crea el QR y espera que Amber/nsec.app se conecte.
 * Llama onQR con (uri, dataUrl, expiresAt) en cuanto el QR está listo (antes de conectar).
 */
export async function loginNip46QR(
  onQR: (uri: string, dataUrl: string, expiresAt: number) => void,
  onauth?: (authUrl: string) => void,
  signal?: AbortSignal
): Promise<Identity> {
  const { BunkerSigner, createNostrConnectURI } = await import("nostr-tools/nip46");
  const QRCode = (await import("qrcode")).default;

  const clientSecret = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecret);
  const secret = Math.random().toString(36).slice(2, 14);
  const relays = NIP46_RELAYS;

  const uri = createNostrConnectURI({
    clientPubkey,
    relays,
    secret,
    name: "Figus Mundial 2026",
    url: typeof window !== "undefined" ? window.location.origin : "",
    perms: ["get_public_key", "sign_event"],
  });

  const dataUrl = await QRCode.toDataURL(uri, {
    width: 280,
    margin: 3,
    color: { dark: "#e8b923", light: "#030b18" },
    errorCorrectionLevel: "M",
  });

  const expiresAt = Date.now() + 5 * 60_000;
  onQR(uri, dataUrl, expiresAt);

  const signer = await BunkerSigner.fromURI(
    clientSecret,
    uri,
    { onauth },
    signal ?? (5 * 60_000)
  );

  const pubkey = await signer.getPublicKey();
  const bp = signer.bp;

  _nip46 = signer;
  saveNip46Session(clientSecret, bp.pubkey, bp.relays.length ? bp.relays : relays, bp.secret, pubkey);

  return { pubkey, mode: "nip46" };
}

/** Restaura una sesión NIP-46 previa desde localStorage */
export async function restoreNip46(): Promise<Identity | null> {
  const cskHex = localStorage.getItem(LS_NIP46_CSK);
  const bpk    = localStorage.getItem(LS_NIP46_BPK);
  const relsJson = localStorage.getItem(LS_NIP46_RELS);
  const sec    = localStorage.getItem(LS_NIP46_SEC);
  const pubkey = localStorage.getItem(LS_NIP46_PK);

  if (!cskHex || !bpk || !relsJson || !pubkey) return null;

  try {
    const { BunkerSigner } = await import("nostr-tools/nip46");
    const { SimplePool } = await import("nostr-tools/pool");

    const clientSk = Uint8Array.from(Buffer.from(cskHex, "hex"));
    const relays = JSON.parse(relsJson) as string[];
    const pointer = { pubkey: bpk, relays, secret: sec };

    _nip46 = BunkerSigner.fromBunker(clientSk, pointer, { pool: new SimplePool() });

    return { pubkey, mode: "nip46" };
  } catch {
    clearNip46Session();
    return null;
  }
}

function getLocalSk(): Uint8Array {
  const hex = localStorage.getItem(LS_SK);
  if (!hex) throw new Error("No hay clave local");
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

export async function signEvent(
  template: EventTemplate,
  mode: SignerMode
): Promise<Event> {
  if (mode === "nip07") {
    if (!window.nostr) throw new Error("Extensión NIP-07 no disponible");
    return window.nostr.signEvent(template);
  }
  if (mode === "nip46") {
    if (!_nip46) throw new Error("No hay firmante NIP-46 activo. Volvé a conectarte.");
    return _nip46.signEvent(template) as unknown as Promise<Event>;
  }
  return finalizeEvent(template, getLocalSk());
}
