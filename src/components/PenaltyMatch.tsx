"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { nip19, nip05 } from "nostr-tools";
import type { Identity } from "@/lib/identity";
import { ZONE_POS, KEEPER_LEFT, ARROWS } from "@/lib/penalty";
import type { MatchState, Round } from "@/lib/penalty";
import type { PenaltyMatch as PenaltyMatchType } from "@/lib/penalty";
import { usePenaltyMatch, useOpenMatches, createMatch, cancelMatch } from "@/hooks/usePenaltyMatch";

async function resolveInputToPubkey(input: string): Promise<string> {
  const s = input.trim();
  if (s.startsWith("npub1")) {
    try {
      const decoded = nip19.decode(s);
      if (decoded.type === "npub") return decoded.data as string;
    } catch {}
    throw new Error("npub inválido");
  }
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase();
  if (s.includes("@") || (!s.includes(" ") && s.includes("."))) {
    const pointer = await nip05.queryProfile(s);
    if (pointer?.pubkey) return pointer.pubkey;
    throw new Error("NIP-05 no encontrado — revisá que esté bien escrito");
  }
  throw new Error("Formato inválido · usá npub1…, pubkey hex o usuario@dominio");
}

// ─── Shared visual: goal net + keeper + ball ──────────────────────────────────

function GoalNet({
  keeperCol,
  ballZone,
  phase,
  isGoal,
}: {
  keeperCol: number;
  ballZone: number | null;
  phase: "idle" | "aiming" | "result";
  isGoal: boolean | null;
}) {
  const [bx, by] = ballZone !== null ? ZONE_POS[ballZone] : [50, 50];

  return (
    <div style={{
      position: "relative", height: 110,
      background: "rgba(255,255,255,.06)",
      border: "2.5px solid rgba(255,255,255,.75)",
      borderBottom: "none",
      borderRadius: "8px 8px 0 0",
      overflow: "hidden",
    }}>
      {/* Net lines */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.14, pointerEvents: "none" }}>
        {[10,20,30,40,50,60,70,80,90].map(x => (
          <line key={`v${x}`} x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%" stroke="white" strokeWidth="0.8" />
        ))}
        {[25, 50, 75].map(y => (
          <line key={`h${y}`} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="white" strokeWidth="0.8" />
        ))}
      </svg>

      {/* Keeper */}
      <div style={{
        position: "absolute", bottom: 2,
        left: `${KEEPER_LEFT[keeperCol]}%`,
        transform: "translateX(-50%)",
        transition: "left 0.45s cubic-bezier(.25,.46,.45,.94)",
        fontSize: 36, lineHeight: 1,
        filter: "drop-shadow(0 2px 6px rgba(0,0,0,.8))",
        zIndex: 2,
      }}>🧤</div>

      {/* Ball */}
      {phase === "result" && ballZone !== null && (
        <div style={{
          position: "absolute",
          left: `${bx}%`, top: `${by}%`,
          transform: "translate(-50%, -50%)",
          fontSize: 24, zIndex: 3,
          animation: "pop .35s cubic-bezier(.34,1.56,.64,1) both",
          filter: isGoal ? "drop-shadow(0 0 14px rgba(255,255,200,.9))" : undefined,
        }}>⚽</div>
      )}
    </div>
  );
}

// ─── Aim grid: el pateador elige zona ─────────────────────────────────────────

function AimGrid({ onKick, disabled }: { onKick: (zone: number) => void; disabled: boolean }) {
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div>
      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,.45)", textAlign: "center", marginBottom: 6, letterSpacing: 1.5, fontWeight: 700 }}>
        ELEGÍ DÓNDE PATEAR
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
        {ARROWS.map((arrow, i) => (
          <button
            key={i}
            disabled={disabled}
            onClick={() => onKick(i)}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              background: hover === i ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.07)",
              border: `1px solid ${hover === i ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.15)"}`,
              borderRadius: 6, height: 40,
              cursor: disabled ? "not-allowed" : "pointer",
              color: "rgba(255,255,255,.55)", fontSize: 16,
              transition: "background .1s, border-color .1s",
              opacity: disabled ? 0.4 : 1,
            }}
          >{arrow}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Keeper grid: el arquero elige columna ─────────────────────────────────────

function KeeperGrid({ onBlock, disabled }: { onBlock: (col: number) => void; disabled: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const labels = ["⬅ IZQUIERDA", "↑ CENTRO", "➡ DERECHA"];

  return (
    <div>
      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,.45)", textAlign: "center", marginBottom: 6, letterSpacing: 1.5, fontWeight: 700 }}>
        ¿A QUÉ LADO TE TIRÁS?
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
        {labels.map((label, col) => (
          <button
            key={col}
            disabled={disabled}
            onClick={() => onBlock(col)}
            onMouseEnter={() => setHover(col)}
            onMouseLeave={() => setHover(null)}
            style={{
              background: hover === col ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.07)",
              border: `1px solid ${hover === col ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.15)"}`,
              borderRadius: 6, height: 44,
              cursor: disabled ? "not-allowed" : "pointer",
              color: "rgba(255,255,255,.7)", fontSize: 10,
              fontFamily: "var(--condensed)", fontWeight: 900,
              letterSpacing: 0.3,
              transition: "background .1s, border-color .1s",
              opacity: disabled ? 0.4 : 1,
            }}
          >{label}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Marcador ─────────────────────────────────────────────────────────────────

function Scoreboard({
  state,
  myPubkey,
  shortName,
}: {
  state: MatchState;
  myPubkey: string;
  shortName: (pk: string) => string;
}) {
  const { match, score, rounds, currentRound } = state;
  const isChallenger = myPubkey === match.challenger;

  return (
    <div style={{
      background: "rgba(0,0,0,.35)", borderRadius: 10,
      padding: "10px 14px", marginBottom: 10,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    }}>
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.45)", fontFamily: "var(--condensed)", marginBottom: 2 }}>
          {shortName(match.challenger)} {isChallenger ? "(vos)" : ""}
        </div>
        <div style={{ fontSize: 32, fontWeight: 900, color: "var(--gold)", lineHeight: 1 }}>{score.challenger}</div>
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", fontFamily: "var(--condensed)", letterSpacing: 1 }}>
          RONDA {Math.min(currentRound, match.rounds)}/{match.rounds}
        </div>
        {rounds.map(r => (
          <span key={r.number} style={{
            display: "inline-block", width: 10, height: 10,
            borderRadius: "50%", margin: "2px 2px 0",
            background: r.result === "goal" ? "var(--gold)"
              : r.result === "saved" ? "rgba(255,255,255,.2)"
              : r.result === "cheat" ? "#cc2244"
              : "rgba(255,255,255,.1)",
            border: "1px solid rgba(255,255,255,.2)",
          }} />
        ))}
      </div>

      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.45)", fontFamily: "var(--condensed)", marginBottom: 2 }}>
          {shortName(match.challenged)} {!isChallenger ? "(vos)" : ""}
        </div>
        <div style={{ fontSize: 32, fontWeight: 900, color: "var(--gold)", lineHeight: 1 }}>{score.challenged}</div>
      </div>
    </div>
  );
}

// ─── Vista de una ronda resuelta ──────────────────────────────────────────────

function RoundResult({ round }: { round: Round }) {
  if (!round.reveal || !round.block) return null;
  const isGoal = round.result === "goal";
  const isCheat = round.result === "cheat";
  const [bx, by] = ZONE_POS[round.reveal.zone];

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        background: "linear-gradient(175deg, #1b5e20 0%, #2e7d32 45%, #388e3c 100%)",
        borderRadius: 14, padding: "12px 14px 10px",
        border: "2px solid rgba(255,255,255,0.12)",
        boxShadow: "inset 0 -4px 0 rgba(0,0,0,.35)",
      }}>
        <GoalNet
          keeperCol={round.block.col}
          ballZone={round.reveal.zone}
          phase="result"
          isGoal={isGoal}
        />
        <div style={{ position: "relative", height: 16, marginBottom: 6 }}>
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.25, pointerEvents: "none" }}>
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="white" strokeWidth="1" />
          </svg>
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,.5)" }} />
        </div>
        <div style={{ textAlign: "center", paddingTop: 4 }}>
          {isCheat ? (
            <div style={{ fontSize: 14, fontWeight: 900, color: "#cc2244", fontFamily: "var(--condensed)" }}>
              ⚠️ TRAMPA DETECTADA — reveal no matchea commit
            </div>
          ) : isGoal ? (
            <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", textShadow: "0 0 20px rgba(255,255,200,.8)", fontFamily: "var(--condensed)" }}>
              ⚽ GOOOL!
            </div>
          ) : (
            <div style={{ fontSize: 18, fontWeight: 900, color: "#ff8a80", fontFamily: "var(--condensed)" }}>
              🧤 ¡Atajado!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Vista activa de una ronda ────────────────────────────────────────────────

function ActiveRound({
  state,
  myPubkey,
  publishing,
  onKick,
  onBlock,
  onReveal,
  pendingZone,
  setPendingZone,
}: {
  state: MatchState;
  myPubkey: string;
  publishing: boolean;
  onKick: (zone: number) => void;
  onBlock: (col: number) => void;
  onReveal: () => void;
  pendingZone: number | null;
  setPendingZone: (z: number) => void;
}) {
  const { phase, currentRound, rounds } = state;
  const round = rounds[currentRound - 1];
  if (!round) return null;

  const iAmKicker     = myPubkey === round.kicker;
  const iAmGoalkeeper = myPubkey === round.goalkeeper;

  // Keeper col a mostrar en el arco mientras se juega
  const keeperCol = round.block?.col ?? 1;
  const ballZone  = phase === "waiting_reveal" && pendingZone !== null ? pendingZone : null;

  return (
    <div style={{
      background: "linear-gradient(175deg, #1b5e20 0%, #2e7d32 45%, #388e3c 100%)",
      borderRadius: 14, padding: "16px 14px 14px",
      border: "2px solid rgba(255,255,255,0.12)",
      boxShadow: "inset 0 -4px 0 rgba(0,0,0,.35), 0 8px 28px rgba(0,0,0,.55)",
    }}>
      <GoalNet keeperCol={keeperCol} ballZone={ballZone} phase="idle" isGoal={null} />

      {/* Penalty spot line */}
      <div style={{ position: "relative", height: 20, marginBottom: 8 }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,.5)" }} />
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.25, pointerEvents: "none" }}>
          <line x1="0" y1="50%" x2="100%" y2="50%" stroke="white" strokeWidth="1" />
        </svg>
      </div>

      {/* Status + acciones */}
      {phase === "waiting_commit" && iAmKicker && (
        <AimGrid onKick={(z) => { setPendingZone(z); onKick(z); }} disabled={publishing} />
      )}
      {phase === "waiting_commit" && !iAmKicker && (
        <div style={{ textAlign: "center", color: "rgba(255,255,255,.5)", fontSize: 12, padding: "10px 0", fontFamily: "var(--condensed)", fontWeight: 700 }}>
          Esperando que el pateador elija zona…
        </div>
      )}

      {phase === "waiting_block" && iAmGoalkeeper && (
        <KeeperGrid onBlock={(col) => onBlock(col)} disabled={publishing} />
      )}
      {phase === "waiting_block" && !iAmGoalkeeper && (
        <div style={{ textAlign: "center", color: "rgba(255,255,255,.5)", fontSize: 12, padding: "10px 0", fontFamily: "var(--condensed)", fontWeight: 700 }}>
          El arquero está eligiendo hacia dónde tirarse… 🧤
        </div>
      )}

      {phase === "waiting_reveal" && iAmKicker && (
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginBottom: 8, fontFamily: "var(--condensed)" }}>
            El arquero ya eligió. ¡Revelá tu zona!
          </div>
          <button
            onClick={onReveal}
            disabled={publishing}
            style={{
              background: "var(--gold)", color: "#030b18",
              border: "none", padding: "10px 24px", borderRadius: 8,
              fontWeight: 900, fontSize: 13, fontFamily: "var(--condensed)",
              cursor: publishing ? "not-allowed" : "pointer",
              opacity: publishing ? 0.6 : 1,
            }}
          >
            {publishing ? "Publicando…" : "⚡ REVELAR ZONA"}
          </button>
        </div>
      )}
      {phase === "waiting_reveal" && !iAmKicker && (
        <div style={{ textAlign: "center", color: "rgba(255,255,255,.5)", fontSize: 12, padding: "10px 0", fontFamily: "var(--condensed)", fontWeight: 700 }}>
          Esperando que el pateador revele la zona… ⏳
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PenaltyMatchView({
  match,
  identity,
  onBack,
}: {
  match: PenaltyMatchType;
  identity: Identity;
  onBack: () => void;
}) {
  const myPubkey = identity.pubkey;
  const { state, publishing, publishCommit, publishBlock, publishReveal } = usePenaltyMatch(match, identity);
  const [pendingZone, setPendingZone] = useState<number | null>(null);

  const shortName = useCallback((pk: string) => pk.slice(0, 8) + "…", []);

  const handleKick = useCallback(async (zone: number) => {
    setPendingZone(zone);
    await publishCommit(zone);
  }, [publishCommit]);

  const handleBlock = useCallback(async (col: number) => {
    const commitId = state?.rounds[state.currentRound - 1]?.commit?.id;
    if (!commitId) return;
    await publishBlock(col, commitId);
  }, [state, publishBlock]);

  const handleReveal = useCallback(async () => {
    const round = state?.rounds[state.currentRound - 1];
    if (!round?.commit) return;
    if (pendingZone === null) return;
    await publishReveal(pendingZone, round.commit.id);
  }, [state, pendingZone, publishReveal]);

  if (!state) {
    return (
      <div style={{ textAlign: "center", color: "var(--muted)", padding: 32, fontFamily: "var(--condensed)" }}>
        Cargando partida…
      </div>
    );
  }

  const { phase, rounds } = state;
  const completedRounds = rounds.filter(r => r.result !== null);
  const lastCompleted   = completedRounds[completedRounds.length - 1] ?? null;

  return (
    <div style={{ fontFamily: "var(--condensed)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button
          onClick={onBack}
          style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--muted)", padding: "5px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer" }}
        >
          ← VOLVER
        </button>
        <div style={{ fontSize: 16, fontWeight: 900, color: "var(--ink)", flex: 1 }}>
          TANDA PvP · {match.rounds} rondas
        </div>
      </div>

      {/* Marcador */}
      <Scoreboard state={state} myPubkey={myPubkey} shortName={shortName} />

      {/* Última ronda resuelta */}
      {lastCompleted && <RoundResult round={lastCompleted} />}

      {/* Ronda activa */}
      {phase !== "finished" && (
        <ActiveRound
          state={state}
          myPubkey={myPubkey}
          publishing={publishing}
          onKick={handleKick}
          onBlock={handleBlock}
          onReveal={handleReveal}
          pendingZone={pendingZone}
          setPendingZone={setPendingZone}
        />
      )}

      {/* Resultado final */}
      {phase === "finished" && (
        <div style={{
          textAlign: "center", padding: "20px 0",
          animation: "pop .35s cubic-bezier(.34,1.56,.64,1) both",
        }}>
          {state.winner === null ? (
            <div style={{ fontSize: 24, fontWeight: 900, color: "var(--muted)" }}>🤝 EMPATE</div>
          ) : state.winner === myPubkey ? (
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--gold)", textShadow: "0 0 24px rgba(232,185,35,.5)" }}>
              🏆 ¡GANASTE!
            </div>
          ) : (
            <div style={{ fontSize: 24, fontWeight: 900, color: "rgba(255,100,100,.8)" }}>
              😔 Perdiste esta vez
            </div>
          )}
          <button
            onClick={onBack}
            style={{
              marginTop: 16, background: "var(--panel2)", border: "1px solid var(--line)",
              color: "var(--muted)", padding: "9px 20px", borderRadius: 8,
              fontSize: 12, fontFamily: "var(--condensed)", fontWeight: 700, cursor: "pointer",
            }}
          >
            VOLVER AL LOBBY
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Lobby: desafíos pendientes + crear desafío ───────────────────────────────

export function PenaltyMatchLobby({
  identity,
  onEnterMatch,
}: {
  identity: Identity | null;
  onEnterMatch: (match: PenaltyMatchType) => void;
}) {
  const myPubkey = identity?.pubkey ?? null;
  const { incoming, outgoing, loading } = useOpenMatches(myPubkey);
  const [challenging, setChallenging]   = useState(false);
  const [inputPk, setInputPk]           = useState("");
  const [inputRounds, setInputRounds]   = useState("3");
  const [publishing, setPublishing]     = useState(false);
  const [resolving, setResolving]       = useState(false);
  const [error, setError]               = useState<string | null>(null);

  async function handleCreate() {
    if (!identity || !inputPk.trim()) return;
    setError(null);
    let resolvedPk: string;
    try {
      setResolving(true);
      resolvedPk = await resolveInputToPubkey(inputPk);
    } catch (e: any) {
      setError(e.message || "Identidad inválida");
      return;
    } finally {
      setResolving(false);
    }
    setPublishing(true);
    try {
      await createMatch(identity, resolvedPk, Number(inputRounds) || 3);
      setInputPk("");
      setChallenging(false);
    } catch {
      setError("No se pudo publicar el desafío");
    } finally {
      setPublishing(false);
    }
  }

  async function handleCancel(match: PenaltyMatchType) {
    if (!identity) return;
    await cancelMatch(identity, match);
  }

  if (!identity) {
    return (
      <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, padding: "14px 0", fontFamily: "var(--condensed)", fontWeight: 700 }}>
        Conectá tu identidad Nostr para jugar PvP
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "var(--condensed)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "var(--ink)", lineHeight: 1 }}>⚽ PENAL PvP</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>Tanda por turnos sobre Nostr · commit-reveal</div>
        </div>
        <button
          onClick={() => setChallenging(true)}
          style={{
            background: "var(--fifa-blue)", color: "#fff", border: "none",
            padding: "8px 14px", borderRadius: 8,
            fontWeight: 900, fontSize: 11, fontFamily: "var(--condensed)",
            letterSpacing: 0.5, cursor: "pointer",
          }}
        >
          + DESAFIAR
        </button>
      </div>

      {/* Form de desafío */}
      {challenging && (
        <div style={{
          background: "var(--panel)", border: "1px solid var(--line)",
          borderRadius: 12, padding: "14px 16px", marginBottom: 14,
        }}>
          <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 0.5, marginBottom: 6 }}>
            NPUB, HEX O NIP-05 DEL RIVAL
          </div>
          <textarea
            autoFocus
            value={inputPk}
            onChange={e => { setInputPk(e.target.value); setError(null); }}
            placeholder="npub1… · hex · usuario@dominio.com"
            rows={2}
            style={{
              width: "100%", background: "var(--panel2)",
              border: `1px solid ${error ? "#cc2244" : "var(--line)"}`,
              borderRadius: 8, padding: "8px 10px",
              color: "var(--ink)", fontSize: 11, fontFamily: "monospace",
              resize: "none", boxSizing: "border-box", marginBottom: 8, outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>RONDAS</div>
            {[1, 3, 5].map(n => (
              <button
                key={n}
                onClick={() => setInputRounds(String(n))}
                style={{
                  background: inputRounds === String(n) ? "var(--gold)" : "var(--panel2)",
                  color: inputRounds === String(n) ? "#030b18" : "var(--muted)",
                  border: `1px solid ${inputRounds === String(n) ? "var(--gold)" : "var(--line)"}`,
                  padding: "4px 12px", borderRadius: 6,
                  fontWeight: 900, fontSize: 11, cursor: "pointer",
                }}
              >{n}</button>
            ))}
          </div>
          {error && <div style={{ fontSize: 11, color: "#cc2244", marginBottom: 8 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleCreate}
              disabled={!inputPk.trim() || publishing || resolving}
              style={{
                flex: 1, background: "var(--fifa-blue)", color: "#fff", border: "none",
                padding: "9px 0", borderRadius: 8, fontWeight: 900, fontSize: 12,
                cursor: inputPk.trim() && !publishing && !resolving ? "pointer" : "not-allowed",
                opacity: inputPk.trim() && !publishing && !resolving ? 1 : 0.5,
              }}
            >
              {resolving ? "Buscando…" : publishing ? "Publicando…" : "DESAFIAR"}
            </button>
            <button
              onClick={() => { setChallenging(false); setInputPk(""); setError(null); }}
              style={{
                background: "transparent", border: "1px solid var(--line)",
                color: "var(--muted)", padding: "9px 14px", borderRadius: 8,
                fontSize: 12, cursor: "pointer",
              }}
            >CANCELAR</button>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, padding: 16 }}>Leyendo relays…</div>
      )}

      {/* Desafíos recibidos */}
      {incoming.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "var(--gold)", letterSpacing: 1.5, fontWeight: 900, marginBottom: 8 }}>
            DESAFÍOS RECIBIDOS
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {incoming.map(m => (
              <div
                key={m.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "rgba(232,185,35,.06)", border: "1px solid rgba(232,185,35,.25)",
                  borderRadius: 10, padding: "10px 12px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
                    {m.challenger.slice(0, 12)}…
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                    {m.rounds} rondas · te desafía
                  </div>
                </div>
                <button
                  onClick={() => onEnterMatch(m)}
                  style={{
                    background: "var(--gold)", color: "#030b18", border: "none",
                    padding: "7px 14px", borderRadius: 7,
                    fontWeight: 900, fontSize: 11, cursor: "pointer",
                  }}
                >JUGAR</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Desafíos enviados */}
      {outgoing.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1.5, fontWeight: 900, marginBottom: 8 }}>
            DESAFÍOS ENVIADOS
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {outgoing.map(m => (
              <div
                key={m.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "var(--panel)", border: "1px solid var(--line)",
                  borderRadius: 10, padding: "10px 12px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
                    → {m.challenged.slice(0, 12)}…
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                    {m.rounds} rondas · esperando respuesta
                  </div>
                </div>
                <button
                  onClick={() => onEnterMatch(m)}
                  style={{
                    background: "var(--panel2)", color: "var(--muted)",
                    border: "1px solid var(--line)",
                    padding: "6px 12px", borderRadius: 7,
                    fontWeight: 900, fontSize: 11, cursor: "pointer",
                  }}
                >VER</button>
                <button
                  onClick={() => handleCancel(m)}
                  style={{
                    background: "transparent", color: "rgba(255,100,100,.8)",
                    border: "1px solid rgba(255,100,100,.3)",
                    padding: "6px 10px", borderRadius: 7,
                    fontWeight: 900, fontSize: 10, cursor: "pointer",
                  }}
                >✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && incoming.length === 0 && outgoing.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, padding: "12px 0", fontFamily: "var(--condensed)" }}>
          No hay partidas activas · desafiá a alguien con su npub
        </div>
      )}
    </div>
  );
}
