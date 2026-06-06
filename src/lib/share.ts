import type { EventTemplate } from "nostr-tools";
import type { Identity } from "./identity";
import { signEvent } from "./identity";
import { getPool, getRelays } from "./pool";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://figusmundial.rho.vercel.app";

export async function shareNote(
  content: string,
  identity: Identity,
  extraTags: string[][] = [],
): Promise<void> {
  const template: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags: extraTags,
  };
  const signed = await signEvent(template, identity.mode);
  await Promise.any(getPool().publish(getRelays(), signed));
}

// ─── Image capture (html2canvas, lazy-loaded to avoid SSR) ───────────────────
export async function captureElement(el: HTMLElement): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(el, {
    scale: 3,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    logging: false,
  });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("toBlob returned null"));
    }, "image/png");
  });
}

// ─── SHA-256 helper ───────────────────────────────────────────────────────────
async function sha256hex(buf: ArrayBuffer): Promise<string> {
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Blossom upload (BUD-01) — tries multiple servers ────────────────────────
const BLOSSOM_SERVERS = [
  "https://blossom.primal.net",
  "https://cdn.blossom.band",
  "https://nostr.download",
];

export async function uploadToBlossom(blob: Blob, identity: Identity): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const sha256 = await sha256hex(arrayBuffer);
  const expiration = Math.floor(Date.now() / 1000) + 5 * 60;

  const authTemplate: EventTemplate = {
    kind: 24242,
    created_at: Math.floor(Date.now() / 1000),
    content: "Upload sticker.png",
    tags: [
      ["t", "upload"],
      ["name", "sticker.png"],
      ["size", String(blob.size)],
      ["x", sha256],
      ["expiration", String(expiration)],
    ],
  };
  const signed = await signEvent(authTemplate, identity.mode);
  const auth = btoa(JSON.stringify(signed));

  let lastErr: Error = new Error("All Blossom servers failed");
  for (const server of BLOSSOM_SERVERS) {
    try {
      const res = await fetch(`${server}/upload`, {
        method: "PUT",
        headers: {
          "Authorization": `Nostr ${auth}`,
          "Content-Type": "image/png",
        },
        body: blob,
      });
      if (!res.ok) throw new Error(`${server} HTTP ${res.status}`);
      const json = await res.json() as { url?: string };
      if (!json.url) throw new Error(`${server}: no URL in response`);
      return json.url;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr;
}

// ─── nostr.build upload with NIP-98 auth (fallback) ──────────────────────────
export async function uploadToNostrBuild(blob: Blob, identity: Identity): Promise<string> {
  const endpoint = "https://nostr.build/api/v2/upload/files";

  const authTemplate: EventTemplate = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    tags: [
      ["u", endpoint],
      ["method", "POST"],
    ],
  };
  const signed = await signEvent(authTemplate, identity.mode);
  const auth = btoa(JSON.stringify(signed));

  const form = new FormData();
  form.append("file", blob, "sticker.png");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Authorization": `Nostr ${auth}` },
    body: form,
  });
  if (!res.ok) throw new Error(`nostr.build ${res.status}`);
  const json = await res.json() as { status: string; data: { url: string }[] };
  const url = json.data?.[0]?.url;
  if (!url) throw new Error("nostr.build: no URL in response");
  return url;
}

// ─── uploadImage: Blossom first, nostr.build as fallback ─────────────────────
export async function uploadImage(blob: Blob, identity: Identity): Promise<string> {
  try {
    return await uploadToBlossom(blob, identity);
  } catch {
    return await uploadToNostrBuild(blob, identity);
  }
}
