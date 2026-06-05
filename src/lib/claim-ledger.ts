// Server-only claim ledger — persists paid rewards to a local JSON file.
// Prevents double-payment regardless of relay state.
import fs from "fs";
import path from "path";

const LEDGER_DIR  = path.join(process.cwd(), "data");
const LEDGER_PATH = path.join(LEDGER_DIR, "claims.json");

type Ledger = Record<string, { ts: number; amountSats: number }>;

function read(): Ledger {
  try {
    if (!fs.existsSync(LEDGER_PATH)) return {};
    return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf-8")) as Ledger;
  } catch {
    return {};
  }
}

function write(ledger: Ledger): void {
  if (!fs.existsSync(LEDGER_DIR)) fs.mkdirSync(LEDGER_DIR, { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

export function hasClaimed(pubkey: string, claimKey: string): boolean {
  return Boolean(read()[`${pubkey}:${claimKey}`]);
}

export function markClaimed(pubkey: string, claimKey: string, amountSats: number): void {
  const ledger = read();
  ledger[`${pubkey}:${claimKey}`] = { ts: Date.now(), amountSats };
  write(ledger);
}
