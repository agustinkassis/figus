import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  type EventTemplate,
  type Event,
} from "nostr-tools";

// Declaración del provider NIP-07 (Alby, nos2x, etc.)
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: EventTemplate): Promise<Event>;
    };
  }
}

const LS_SK   = "figus:sk";   // clave privada local
const LS_MODE = "figus:mode"; // último modo de login ("nip07" | "local")

export type SignerMode = "nip07" | "local";

export interface Identity {
  pubkey: string;
  mode: SignerMode;
}

export function hasNip07(): boolean {
  return typeof window !== "undefined" && !!window.nostr;
}

export async function loginNip07(): Promise<Identity> {
  if (!window.nostr) throw new Error("No hay extensión NIP-07 instalada");
  const pubkey = await window.nostr.getPublicKey();
  localStorage.setItem(LS_MODE, "nip07");
  return { pubkey, mode: "nip07" };
}

// Crea o recupera una clave local guardada en el navegador (solo demo)
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

export function clearPersistedMode() {
  localStorage.removeItem(LS_MODE);
}

export function getPersistedMode(): SignerMode | null {
  return (localStorage.getItem(LS_MODE) as SignerMode) ?? null;
}

function getLocalSk(): Uint8Array {
  const hex = localStorage.getItem(LS_SK);
  if (!hex) throw new Error("No hay clave local");
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

// Firma un evento según el modo activo
export async function signEvent(
  template: EventTemplate,
  mode: SignerMode
): Promise<Event> {
  if (mode === "nip07") {
    if (!window.nostr) throw new Error("Extensión NIP-07 no disponible");
    return window.nostr.signEvent(template);
  }
  return finalizeEvent(template, getLocalSk());
}
