// ─── Penalty game — pure logic (no React) ────────────────────────────────────
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** Zonas cubiertas por cada columna del arquero — 3 zonas simétricas */
export const COLUMN_ZONES: Record<number, number[]> = {
  0: [0],
  1: [1],
  2: [2],
};

/** Posición visual (left%, top%) de cada zona dentro del arco */
export const ZONE_POS: [number, number][] = [
  [16, 55], [50, 55], [84, 55],
];

/** Centro horizontal del arquero por columna */
export const KEEPER_LEFT = [14, 50, 86];

/** Etiquetas de dirección para los 3 sectores */
export const ARROWS = ["⬅", "⬆", "➡"];

/**
 * Resuelve un penal.
 * @param zone  Zona elegida por el pateador (0-8)
 * @param col   Columna a la que se lanzó el arquero (0-2)
 * @returns     true = gol, false = atajado
 */
export function resolveKick(zone: number, col: number): boolean {
  return !COLUMN_ZONES[col].includes(zone);
}

/** Clave de localStorage para el tiro diario (formato YYYY-MM-DD local) */
export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ─── Commit-reveal helpers ────────────────────────────────────────────────────

/** Genera un nonce aleatorio de 32 bytes (64 hex chars) */
export function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/** sha256("zone:nonce") → hex — el commit que publica el pateador */
export function commitZone(zone: number, nonce: string): string {
  const input = new TextEncoder().encode(`${zone}:${nonce}`);
  return bytesToHex(sha256(input));
}

/** Verifica que un reveal corresponde al commit publicado */
export function verifyCommit(zone: number, nonce: string, commit: string): boolean {
  try {
    return commitZone(zone, nonce) === commit;
  } catch {
    return false;
  }
}

// ─── Tipos de dominio PvP ─────────────────────────────────────────────────────

export type MatchStatus = "open" | "active" | "finished" | "cancelled" | "expired";

export interface PenaltyMatch {
  id: string;       // event id
  d: string;        // tag d
  challenger: string;
  challenged: string;
  rounds: number;
  status: MatchStatus;
  createdAt: number;
}

export interface PenaltyCommit {
  id: string;
  matchCoord: string; // "30301:challenger:d"
  kicker: string;
  round: number;
  commit: string;     // sha256 hex
  createdAt: number;
}

export interface PenaltyBlock {
  id: string;
  matchCoord: string;
  goalkeeper: string;
  commitId: string;
  round: number;
  col: number;        // 0 | 1 | 2
  createdAt: number;
}

export interface PenaltyReveal {
  id: string;
  matchCoord: string;
  kicker: string;
  commitId: string;
  round: number;
  zone: number;       // 0-8
  nonce: string;
  createdAt: number;
}

export type RoundResult = "goal" | "saved" | "cheat"; // cheat = reveal no matchea commit

export interface Round {
  number: number;       // 1-based
  kicker: string;       // pubkey
  goalkeeper: string;
  commit: PenaltyCommit | null;
  block: PenaltyBlock | null;
  reveal: PenaltyReveal | null;
  result: RoundResult | null;
}

export interface MatchState {
  match: PenaltyMatch;
  rounds: Round[];
  score: { challenger: number; challenged: number };
  currentRound: number;   // 1-based, qué ronda se está jugando
  phase: "waiting_commit" | "waiting_block" | "waiting_reveal" | "finished";
  winner: string | null;  // pubkey del ganador, null si empate o no terminó
  suddenDeath: boolean;   // true cuando se van a penales extra por empate
}

// ─── Parsers de eventos Nostr → tipos de dominio ──────────────────────────────

import type { Event } from "nostr-tools";

export function parseMatch(ev: Event): PenaltyMatch | null {
  try {
    const d          = ev.tags.find(t => t[0] === "d")?.[1] ?? "";
    const challenged = ev.tags.find(t => t[0] === "p")?.[1] ?? "";
    const rounds     = Number(ev.tags.find(t => t[0] === "rounds")?.[1] ?? "3");
    const status     = (ev.tags.find(t => t[0] === "status")?.[1] ?? "open") as MatchStatus;
    if (!d || !challenged) return null;
    return { id: ev.id, d, challenger: ev.pubkey, challenged, rounds, status, createdAt: ev.created_at };
  } catch { return null; }
}

export function parseCommit(ev: Event): PenaltyCommit | null {
  try {
    const matchCoord = ev.tags.find(t => t[0] === "a")?.[1] ?? "";
    const round      = Number(ev.tags.find(t => t[0] === "round")?.[1] ?? "0");
    const commit     = ev.tags.find(t => t[0] === "commit")?.[1] ?? "";
    if (!matchCoord || !round || !commit) return null;
    return { id: ev.id, matchCoord, kicker: ev.pubkey, round, commit, createdAt: ev.created_at };
  } catch { return null; }
}

export function parseBlock(ev: Event): PenaltyBlock | null {
  try {
    const matchCoord = ev.tags.find(t => t[0] === "a")?.[1] ?? "";
    const commitId   = ev.tags.find(t => t[0] === "e")?.[1] ?? "";
    const round      = Number(ev.tags.find(t => t[0] === "round")?.[1] ?? "0");
    const col        = Number(ev.tags.find(t => t[0] === "col")?.[1] ?? "-1");
    if (!matchCoord || !commitId || !round || col < 0) return null;
    return { id: ev.id, matchCoord, goalkeeper: ev.pubkey, commitId, round, col, createdAt: ev.created_at };
  } catch { return null; }
}

export function parseReveal(ev: Event): PenaltyReveal | null {
  try {
    const matchCoord = ev.tags.find(t => t[0] === "a")?.[1] ?? "";
    const commitId   = ev.tags.find(t => t[0] === "e")?.[1] ?? "";
    const round      = Number(ev.tags.find(t => t[0] === "round")?.[1] ?? "0");
    const zone       = Number(ev.tags.find(t => t[0] === "zone")?.[1] ?? "-1");
    const nonce      = ev.tags.find(t => t[0] === "nonce")?.[1] ?? "";
    if (!matchCoord || !commitId || !round || zone < 0 || !nonce) return null;
    return { id: ev.id, matchCoord, kicker: ev.pubkey, commitId, round, zone, nonce, createdAt: ev.created_at };
  } catch { return null; }
}

// ─── Derivar MatchState desde eventos crudos ──────────────────────────────────

export function deriveMatchState(
  match: PenaltyMatch,
  commits: PenaltyCommit[],
  blocks: PenaltyBlock[],
  reveals: PenaltyReveal[],
): MatchState {
  const { challenger, challenged, rounds: totalRounds } = match;

  // Quién patea en cada ronda (1-based): impar = challenger, par = challenged
  function kickerOf(r: number) { return r % 2 === 1 ? challenger : challenged; }
  function goalkeeperOf(r: number) { return r % 2 === 1 ? challenged : challenger; }

  const roundStates: Round[] = [];
  let score = { challenger: 0, challenged: 0 };

  for (let r = 1; r <= totalRounds; r++) {
    const kicker     = kickerOf(r);
    const goalkeeper = goalkeeperOf(r);

    const commit = commits
      .filter(c => c.round === r && c.kicker === kicker)
      .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;

    const block = commit
      ? blocks
          .filter(b => b.round === r && b.commitId === commit.id && b.goalkeeper === goalkeeper)
          .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null
      : null;

    const reveal = (commit && block)
      ? reveals
          .filter(rv => rv.round === r && rv.commitId === commit.id && rv.kicker === kicker)
          .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null
      : null;

    let result: RoundResult | null = null;
    if (reveal && block && commit) {
      if (!verifyCommit(reveal.zone, reveal.nonce, commit.commit)) {
        result = "cheat";
      } else {
        result = resolveKick(reveal.zone, block.col) ? "goal" : "saved";
      }
      if (result === "goal") {
        if (kicker === challenger) score.challenger++;
        else score.challenged++;
      }
    }

    roundStates.push({ number: r, kicker, goalkeeper, commit, block, reveal, result });
  }

  // Fase actual después de las rondas iniciales
  const lastCompleted = roundStates.filter(r => r.result !== null).length;
  let phase: MatchState["phase"] = "finished";
  let currentRound = totalRounds;
  let winner: string | null = null;
  let suddenDeath = false;

  if (lastCompleted < totalRounds || match.status === "finished") {
    const next = roundStates[lastCompleted];
    if (!next) {
      phase = "finished";
    } else if (!next.commit) {
      phase = "waiting_commit";
      currentRound = next.number;
    } else if (!next.block) {
      phase = "waiting_block";
      currentRound = next.number;
    } else if (!next.reveal) {
      phase = "waiting_reveal";
      currentRound = next.number;
    }
  }

  if (phase === "finished" || lastCompleted === totalRounds) {
    if (score.challenger > score.challenged) {
      phase = "finished";
      winner = challenger;
    } else if (score.challenged > score.challenger) {
      phase = "finished";
      winner = challenged;
    } else if (match.status === "finished") {
      phase = "finished";
    } else {
      // Empate → muerte súbita en pares (challenger patea primero, luego challenged)
      // Termina cuando al final de un par los marcadores difieren
      suddenDeath = true;
      let sdR = totalRounds + 1;

      outer:
      while (true) {
        for (let i = 0; i < 2; i++) {
          const curR       = sdR + i;
          const kicker     = kickerOf(curR);
          const goalkeeper = goalkeeperOf(curR);

          const commit = commits
            .filter(c => c.round === curR && c.kicker === kicker)
            .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
          const block = commit
            ? blocks
                .filter(b => b.round === curR && b.commitId === commit.id && b.goalkeeper === goalkeeper)
                .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null
            : null;
          const reveal = (commit && block)
            ? reveals
                .filter(rv => rv.round === curR && rv.commitId === commit.id && rv.kicker === kicker)
                .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null
            : null;

          if (!reveal) {
            if (!commit) {
              phase = "waiting_commit"; currentRound = curR;
              roundStates.push({ number: curR, kicker, goalkeeper, commit: null, block: null, reveal: null, result: null });
            } else if (!block) {
              phase = "waiting_block"; currentRound = curR;
              roundStates.push({ number: curR, kicker, goalkeeper, commit, block: null, reveal: null, result: null });
            } else {
              phase = "waiting_reveal"; currentRound = curR;
              roundStates.push({ number: curR, kicker, goalkeeper, commit, block, reveal: null, result: null });
            }
            break outer;
          }

          let result: RoundResult | null;
          if (!verifyCommit(reveal.zone, reveal.nonce, commit!.commit)) {
            result = "cheat";
            roundStates.push({ number: curR, kicker, goalkeeper, commit: commit!, block: block!, reveal, result });
            winner = goalkeeper;
            phase = "finished";
            break outer;
          }
          result = resolveKick(reveal.zone, block!.col) ? "goal" : "saved";
          roundStates.push({ number: curR, kicker, goalkeeper, commit: commit!, block: block!, reveal, result });
          if (result === "goal") {
            if (kicker === challenger) score.challenger++;
            else score.challenged++;
          }
        }

        // Par completo: ¿alguno adelante?
        if (score.challenger > score.challenged) { winner = challenger; phase = "finished"; break; }
        if (score.challenged > score.challenger) { winner = challenged; phase = "finished"; break; }
        // Siguen empatados → siguiente par
        sdR += 2;
      }
    }
  }

  return { match, rounds: roundStates, score, currentRound, phase, winner, suddenDeath };
}
