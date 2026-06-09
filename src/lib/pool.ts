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

// Pre-establish WebSocket connections to all relays so the first real query is fast
export function warmupRelays(): void {
  const p = getPool();
  const sub = p.subscribeMany(RELAYS, { kinds: [0], limit: 0 } as Filter, { onevent: () => {} });
  setTimeout(() => sub.close(), 3000);
}

// Query puntual: junta eventos de varios filtros hasta EOSE y resuelve.
// maxWait 2000ms: con 5 relays confiables el EOSE llega mucho antes;
// cualquier relay que no responda en 2s se ignora sin bloquear el resto.
export async function list(filters: Filter[]): Promise<Event[]> {
  const p = getPool();
  const results = await Promise.all(
    filters.map((f) => p.querySync(RELAYS, f, { maxWait: 2000 }))
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

// Search query usando un pool temporal para no contaminar el pool principal
// con relays de búsqueda que pueden ser lentos o inestables.
export async function searchProfiles(relays: string[], searchTerm: string, limit = 8): Promise<Event[]> {
  const searchPool = new SimplePool();
  try {
    return await searchPool.querySync(relays, { kinds: [0], search: searchTerm, limit }, { maxWait: 4000 });
  } finally {
    searchPool.close(relays);
  }
}

export type { Event, Filter };
