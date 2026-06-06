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

// ─── Upload to nostr.build (free, no auth) ────────────────────────────────────
export async function uploadToNostrBuild(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", blob, "sticker.png");
  const res = await fetch("https://nostr.build/api/v2/upload/files", {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`nostr.build ${res.status}`);
  const json = (await res.json()) as { status: string; data: { url: string }[] };
  const url = json.data?.[0]?.url;
  if (!url) throw new Error("nostr.build: no URL in response");
  return url;
}
