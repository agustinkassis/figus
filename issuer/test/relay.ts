// Relay Nostr mínimo en memoria para testear el issuer localmente y de forma aislada.
// Implementa lo justo de NIP-01 (EVENT/REQ/CLOSE/EOSE) y — clave para los tests de
// seguridad — RECHAZA eventos con firma inválida, igual que un relay honesto.
//
// Uso:  npx tsx issuer/test/relay.ts        (escucha en ws://localhost:7777)
import "../lib"; // polyfill WebSocket global (no usado acá, pero mantiene consistencia)
import { WebSocketServer, WebSocket } from "ws";
import { verifyEvent, type Event, type Filter } from "nostr-tools";

const PORT = Number(process.env.RELAY_PORT || "7777");
const wss = new WebSocketServer({ port: PORT });

const events: Event[] = [];
interface Sub { ws: WebSocket; id: string; filters: Filter[]; }
const subs: Sub[] = [];

function matches(ev: Event, f: Filter): boolean {
  if (f.ids && !f.ids.includes(ev.id)) return false;
  if (f.kinds && !f.kinds.includes(ev.kind)) return false;
  if (f.authors && !f.authors.includes(ev.pubkey)) return false;
  if (f.since && ev.created_at < f.since) return false;
  if (f.until && ev.created_at > f.until) return false;
  for (const [k, vals] of Object.entries(f)) {
    if (!k.startsWith("#")) continue;
    const tagName = k.slice(1);
    const want = vals as string[];
    const have = ev.tags.filter((t) => t[0] === tagName).map((t) => t[1]);
    if (!want.some((v) => have.includes(v))) return false;
  }
  return true;
}

function send(ws: WebSocket, msg: unknown[]) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    let msg: unknown[];
    try { msg = JSON.parse(data.toString()); } catch { return; }
    const [type] = msg;

    if (type === "EVENT") {
      const ev = msg[1] as Event;
      let ok = false;
      try { ok = verifyEvent(ev); } catch { ok = false; }
      if (!ok) {
        send(ws, ["OK", ev?.id ?? "", false, "invalid: bad signature"]);
        return;
      }
      events.push(ev);
      send(ws, ["OK", ev.id, true, ""]);
      // Broadcast a suscripciones activas que matcheen
      for (const sub of subs) {
        if (sub.filters.some((f) => matches(ev, f))) send(sub.ws, ["EVENT", sub.id, ev]);
      }
    } else if (type === "REQ") {
      const id = msg[1] as string;
      const filters = msg.slice(2) as Filter[];
      const matched = events.filter((ev) => filters.some((f) => matches(ev, f)));
      matched.sort((a, b) => a.created_at - b.created_at);
      for (const ev of matched) send(ws, ["EVENT", id, ev]);
      send(ws, ["EOSE", id]);
      subs.push({ ws, id, filters });
    } else if (type === "CLOSE") {
      const id = msg[1] as string;
      for (let i = subs.length - 1; i >= 0; i--) {
        if (subs[i].ws === ws && subs[i].id === id) subs.splice(i, 1);
      }
    }
  });

  ws.on("close", () => {
    for (let i = subs.length - 1; i >= 0; i--) if (subs[i].ws === ws) subs.splice(i, 1);
  });
});

console.log(`🛰️  Relay de test escuchando en ws://localhost:${PORT} (rechaza firmas inválidas)`);
