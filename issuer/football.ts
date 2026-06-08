import "dotenv/config";

const BASE = "https://api.football-data.org/v4";
const API_KEY = process.env.FOOTBALL_API_KEY ?? "";

// Excepciones al toLowerCase estándar
const TLA_EXCEPTIONS: Record<string, string> = {
  URY: "uru",
  CUR: "cuw",
};

export function tlaToCode(tla: string): string {
  return TLA_EXCEPTIONS[tla] ?? tla.toLowerCase();
}

export interface ApiMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group: string | null;
  homeTeam: { tla: string; name: string };
  awayTeam: { tla: string; name: string };
  score: {
    fullTime: { home: number | null; away: number | null };
  };
}

async function fetchMatches(status: string): Promise<ApiMatch[]> {
  const res = await fetch(`${BASE}/competitions/WC/matches?status=${status}`, {
    headers: { "X-Auth-Token": API_KEY },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Football API ${res.status}: ${body.slice(0, 120)}`);
  }
  const data = (await res.json()) as { matches?: ApiMatch[] };
  return data.matches ?? [];
}

export async function fetchFinishedMatches(): Promise<ApiMatch[]> {
  return fetchMatches("FINISHED");
}

// Arranca un polling loop que llama onFinished para cada partido que termina.
// No llama onFinished dos veces para el mismo match.id.
// Si onFinished lanza, el match se reintenta en el próximo ciclo.
export function startFootballPoller(
  onFinished: (match: ApiMatch) => Promise<void>,
  intervalMs = 5 * 60 * 1000,
): void {
  const processed = new Set<number>();

  async function poll() {
    try {
      const matches = await fetchFinishedMatches();
      for (const m of matches) {
        if (processed.has(m.id)) continue;
        if (m.score.fullTime.home === null || m.score.fullTime.away === null) continue;
        processed.add(m.id);
        try {
          await onFinished(m);
        } catch (e) {
          console.error(`Error liquidando match ${m.id}:`, e);
          processed.delete(m.id); // reintentar en el próximo ciclo
        }
      }
    } catch (e) {
      console.error("⚠️ Football API poll error:", e);
    }
  }

  poll();
  setInterval(poll, intervalMs);
  console.log(`⚽ Football poller activo (cada ${intervalMs / 60000} min)`);
}
