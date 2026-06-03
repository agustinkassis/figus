import type { Event } from "nostr-tools";
import type { Listing, Ownership, Settlement } from "./types";

export function tag(ev: Event, name: string): string | undefined {
  return ev.tags.find((t) => t[0] === name)?.[1];
}

export function tagsAll(ev: Event, name: string): string[][] {
  return ev.tags.filter((t) => t[0] === name);
}

// 30100 -> { stickerNum, count }
export function parseOwnership(events: Event[]): Ownership {
  const map: Ownership = {};
  // addressable: quedarse con el más reciente por sticker
  const latest: Record<string, Event> = {};
  for (const ev of events) {
    const d = tag(ev, "d");
    if (!d) continue;
    if (!latest[d] || ev.created_at > latest[d].created_at) latest[d] = ev;
  }
  for (const ev of Object.values(latest)) {
    const sticker = tag(ev, "sticker"); // "mundial-2026:10"
    if (!sticker) continue;
    const num = Number(sticker.split(":")[1]);
    map[num] = Number(tag(ev, "count") || "0");
  }
  return map;
}

// 30200 -> Listing
export function parseListing(ev: Event): Listing | null {
  const d = tag(ev, "d");
  const sticker = tag(ev, "sticker");
  if (!d || !sticker) return null;
  return {
    id: ev.id,
    d,
    seller: ev.pubkey,
    stickerNum: Number(sticker.split(":")[1]),
    price: Number(tag(ev, "price") || "0"),
    status: (tag(ev, "status") as "open" | "sold") || "open",
    content: ev.content,
  };
}

// dedupe addressable listings por (pubkey,d): quedarse con el más nuevo
export function parseListings(events: Event[]): Listing[] {
  const latest: Record<string, Event> = {};
  for (const ev of events) {
    const d = tag(ev, "d");
    if (!d) continue;
    const key = `${ev.pubkey}:${d}`;
    if (!latest[key] || ev.created_at > latest[key].created_at) latest[key] = ev;
  }
  return Object.values(latest)
    .map(parseListing)
    .filter((l): l is Listing => l !== null);
}

// 1574 -> Settlement
export function parseSettlement(ev: Event): Settlement | null {
  const sticker = tag(ev, "sticker");
  if (!sticker) return null;
  return {
    id: ev.id,
    stickerNum: Number(sticker.split(":")[1]),
    from: tag(ev, "from") || "",
    to: tag(ev, "to") || "",
    price: Number(tag(ev, "price") || "0"),
  };
}
