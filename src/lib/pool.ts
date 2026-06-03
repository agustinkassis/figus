import { SimplePool, type Event, type Filter } from "nostr-tools";
import { RELAYS } from "./constants";

// Pool único compartido en el cliente
let pool: SimplePool | null = null;

export function getPool(): SimplePool {
  if (!pool) pool = new SimplePool();
  return pool;
}

export function getRelays(): string[] {
  return RELAYS;
}

// Query puntual: junta eventos de varios filtros hasta EOSE y resuelve
export async function list(filters: Filter[]): Promise<Event[]> {
  const p = getPool();
  const results = await Promise.all(
    filters.map((f) => p.querySync(RELAYS, f, { maxWait: 4000 }))
  );
  const byId = new Map<string, Event>();
  for (const arr of results) for (const ev of arr) byId.set(ev.id, ev);
  return Array.from(byId.values());
}

// Suscripción viva a UN filtro. Devuelve unsub.
export function subscribeOne(
  filter: Filter,
  onevent: (ev: Event) => void
): () => void {
  const p = getPool();
  const sub = p.subscribeMany(RELAYS, filter, { onevent });
  return () => sub.close();
}

// Suscripción viva a varios filtros. Devuelve unsub que cierra todas.
export function subscribe(
  filters: Filter[],
  onevent: (ev: Event) => void
): () => void {
  const closers = filters.map((f) => subscribeOne(f, onevent));
  return () => closers.forEach((c) => c());
}

export type { Event, Filter };
