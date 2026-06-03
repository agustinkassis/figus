export type Rarity = "common" | "rare" | "shiny" | "legendary";

export interface StickerTemplate {
  number: number;
  name: string;
  team: string; // page id
  page: string;
  rarity: Rarity;
  image?: string;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  accent: string;
}

export interface Page {
  id: string;
  name: string;
  numbers: number[];
}

export interface PackDef {
  d: string;
  title: string;
  price: number; // sats
  count: number;
  odds: Record<Rarity, number>;
}

// Estado de propiedad derivado de los eventos 30100
export type Ownership = Record<number, number>; // sticker number -> count

export interface Listing {
  id: string; // event id
  d: string;
  seller: string; // pubkey
  stickerNum: number;
  price: number; // sats
  status: "open" | "sold";
  content: string;
}

export interface Settlement {
  id: string;
  stickerNum: number;
  from: string;
  to: string;
  price: number;
}

export interface LeaderEntry {
  pubkey: string;
  profile: { name: string; picture: string } | null;
  stickers: number;
  goals: number;
  score: number;
  rank: number;
}
