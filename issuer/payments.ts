// Abstracción de pagos del issuer (Fix #1 — Opción A).
// El issuer GENERA las facturas (controla monto y payment_hash) y CONFIRMA el pago
// con su propia wallet antes de conceder figuritas. Dos implementaciones:
//   - "nwc":  wallet real vía NWC (Alby Hub, etc.). Requiere make_invoice/lookup_invoice.
//   - "mock": para testear con issuer propio SIN sats reales (auto-confirma el pago).
import { randomBytes } from "crypto";
import { nwcMakeInvoice, nwcLookupInvoice } from "../src/lib/nwc-server";

export interface Payments {
  readonly mode: "nwc" | "mock";
  makeInvoice(amountSats: number, description: string): Promise<{ invoice: string; paymentHash: string }>;
  lookupInvoice(paymentHash: string): Promise<{ settled: boolean; amountSats: number }>;
}

function nwcPayments(nwc: string): Payments {
  return {
    mode: "nwc",
    makeInvoice: (amountSats, description) => nwcMakeInvoice(amountSats, description, nwc),
    lookupInvoice: (paymentHash) => nwcLookupInvoice(paymentHash, nwc),
  };
}

// MODO TEST: cada factura se considera pagada en cuanto se la consulta.
// NUNCA usar en producción — concede figuritas sin cobro real.
function mockPayments(): Payments {
  const amounts = new Map<string, number>();
  return {
    mode: "mock",
    async makeInvoice(amountSats) {
      const paymentHash = randomBytes(32).toString("hex");
      amounts.set(paymentHash, amountSats);
      return { invoice: `lnbcmock1${paymentHash.slice(0, 24)}`, paymentHash };
    },
    async lookupInvoice(paymentHash) {
      return { settled: true, amountSats: amounts.get(paymentHash) ?? 0 };
    },
  };
}

export function getPayments(): Payments {
  const mode = (process.env.ISSUER_PAYMENTS || "").toLowerCase();
  if (mode === "mock") {
    console.warn("⚠️  PAGOS EN MODO MOCK — las facturas se autoconfirman. Solo para tests.");
    return mockPayments();
  }
  const nwc = process.env.ISSUER_NWC || process.env.REWARD_NWC;
  if (!nwc) {
    throw new Error(
      "Falta ISSUER_NWC (o REWARD_NWC) para cobrar sobres. " +
      "Para testear sin sats reales, usá ISSUER_PAYMENTS=mock"
    );
  }
  return nwcPayments(nwc);
}
