import { verifyEvent } from "nostr-tools/pure";
import type { Event } from "nostr-tools";
import { ISSUER_PUBKEY } from "./constants";

// Verifica que un evento tenga firma válida Y haya sido emitido por el issuer.
// Defensa contra relays maliciosos que inyectan OWNERSHIP/GRANT/SETTLEMENT con
// pubkey falsificado: el filtro `authors:[ISSUER_PUBKEY]` lo aplica el relay, pero
// un relay deshonesto puede ignorarlo. Acá lo validamos del lado del cliente.
export function isFromIssuer(ev: Event): boolean {
  if (!ISSUER_PUBKEY) return false;
  if (ev.pubkey !== ISSUER_PUBKEY) return false;
  try {
    return verifyEvent(ev);
  } catch {
    return false;
  }
}

// Filtra una lista de eventos, dejando solo los firmados legítimamente por el issuer.
export function onlyFromIssuer(events: Event[]): Event[] {
  return events.filter(isFromIssuer);
}

// Verifica que un evento esté firmado por su autor declarado (firma válida).
// Útil para eventos de usuario (listings, requests) donde no hay un autor fijo.
export function isSelfSigned(ev: Event): boolean {
  try {
    return verifyEvent(ev);
  } catch {
    return false;
  }
}
