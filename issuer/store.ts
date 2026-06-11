// Ledger durable del issuer (Fix #2 — anti-replay / idempotencia).
// Persiste órdenes de compra y un set de eventos ya procesados a un archivo JSON,
// para que un reinicio del issuer no reprocese pagos ni duplique grants.
import fs from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "data");
const ORDERS_PATH = path.join(DIR, "orders.json");
const SEEN_PATH = path.join(DIR, "seen.json");

export type OrderAction = "open-pack" | "open-pack-10" | "buy-sticker";

export interface Order {
  paymentHash: string;
  buyer: string;
  action: OrderAction;
  amountSats: number;
  status: "pending" | "granted" | "failed" | "expired";
  ts: number;
  // open-pack(-10)
  stickers?: number[];
  // buy-sticker
  listingCoord?: string;
  seller?: string;
  stickerNum?: number;
}

type Orders = Record<string, Order>;
type SeenSets = Record<string, string[]>; // namespace -> ids

function readJson<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(p: string, data: unknown): void {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// ── Órdenes ───────────────────────────────────────────────────────────────────

export function getOrder(paymentHash: string): Order | undefined {
  return readJson<Orders>(ORDERS_PATH, {})[paymentHash];
}

export function putOrder(order: Order): void {
  const orders = readJson<Orders>(ORDERS_PATH, {});
  orders[order.paymentHash] = order;
  writeJson(ORDERS_PATH, orders);
}

export function updateOrder(paymentHash: string, patch: Partial<Order>): void {
  const orders = readJson<Orders>(ORDERS_PATH, {});
  const cur = orders[paymentHash];
  if (!cur) return;
  orders[paymentHash] = { ...cur, ...patch };
  writeJson(ORDERS_PATH, orders);
}

export function pendingOrders(): Order[] {
  return Object.values(readJson<Orders>(ORDERS_PATH, {})).filter((o) => o.status === "pending");
}

// ── Set de "ya procesado" (receipts, free-pack claims, etc.) ──────────────────

export function wasProcessed(ns: string, id: string): boolean {
  const sets = readJson<SeenSets>(SEEN_PATH, {});
  return (sets[ns] ?? []).includes(id);
}

export function markProcessed(ns: string, id: string): void {
  const sets = readJson<SeenSets>(SEEN_PATH, {});
  const arr = sets[ns] ?? [];
  if (!arr.includes(id)) {
    arr.push(id);
    // Bound the set so the file doesn't grow forever (keep last 5000 por namespace).
    sets[ns] = arr.slice(-5000);
    writeJson(SEEN_PATH, sets);
  }
}
