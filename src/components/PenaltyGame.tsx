"use client";

import { useState, useEffect } from "react";

type Phase = "aim" | "diving" | "result";

// Zones each keeper column covers (3 cols × 3 rows)
const COLUMN_ZONES: Record<number, number[]> = {
  0: [0, 3, 6],
  1: [1, 4, 7],
  2: [2, 5, 8],
};

// % position (left, top) of each zone inside the goal net
const ZONE_POS: [number, number][] = [
  [16, 28], [50, 28], [84, 28],
  [16, 58], [50, 58], [84, 58],
  [16, 84], [50, 84], [84, 84],
];

// Keeper horizontal center per column
const KEEPER_LEFT = [14, 50, 86];

const ARROWS = ["↖", "↑", "↗", "←", "·", "→", "↙", "↓", "↘"];

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function PenaltyGame({
  pubkey,
  onGoal,
  onPublish,
}: {
  pubkey: string | null;
  onGoal: () => void;
  onPublish: (result: "goal" | "save", zone: number, keeper: number, totalGoals: number) => void;
}) {
  const [phase, setPhase]       = useState<Phase>("aim");
  const [zone, setZone]         = useState<number | null>(null);
  const [keeperCol, setKeeperCol] = useState(1); // starts center
  const [isGoal, setIsGoal]     = useState(false);
  const [usedToday, setUsedToday] = useState(false);
  const [totalGoals, setTotalGoals] = useState(0);

  useEffect(() => {
    setUsedToday(localStorage.getItem(`pk_${todayKey()}`) === "1");
    setTotalGoals(Number(localStorage.getItem("pk_goals") || 0));
  }, []);

  function kick(z: number) {
    if (phase !== "aim" || usedToday || !pubkey) return;

    const col  = Math.floor(Math.random() * 3);
    const goal = !COLUMN_ZONES[col].includes(z);

    setZone(z);
    setKeeperCol(col);
    setIsGoal(goal);
    setPhase("diving");

    setTimeout(() => {
      setPhase("result");
      localStorage.setItem(`pk_${todayKey()}`, "1");
      setUsedToday(true);

      const newGoals = goal ? totalGoals + 1 : totalGoals;
      if (goal) {
        setTotalGoals(newGoals);
        localStorage.setItem("pk_goals", String(newGoals));
        onGoal();
      }
      onPublish(goal ? "goal" : "save", z, col, newGoals);
    }, 850);
  }

  const [bx, by] = zone !== null ? ZONE_POS[zone] : [50, 50];

  return (
    <div style={{ fontFamily: "var(--condensed)" }}>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "var(--ink)", lineHeight: 1 }}>
            ⚽ PENAL DIARIO
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
            1 tiro gratis por día · si convertís ganás un sobre
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: "var(--gold)", lineHeight: 1 }}>{totalGoals}</div>
          <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 1 }}>GOLES TOTALES</div>
        </div>
      </div>

      {/* Field card */}
      <div style={{
        background: "linear-gradient(175deg, #1b5e20 0%, #2e7d32 45%, #388e3c 100%)",
        borderRadius: 14,
        padding: "16px 14px 14px",
        border: "2px solid rgba(255,255,255,0.12)",
        boxShadow: "inset 0 -4px 0 rgba(0,0,0,.35), 0 8px 28px rgba(0,0,0,.55)",
      }}>

        {/* Goal net */}
        <div style={{
          position: "relative",
          height: 100,
          background: "rgba(255,255,255,.06)",
          border: "2.5px solid rgba(255,255,255,.75)",
          borderBottom: "none",
          borderRadius: "8px 8px 0 0",
          marginBottom: 6,
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
            position: "absolute",
            bottom: 2,
            left: `${KEEPER_LEFT[keeperCol]}%`,
            transform: "translateX(-50%)",
            transition: phase === "diving" ? "left 0.45s cubic-bezier(.25,.46,.45,.94)" : "none",
            fontSize: 34,
            lineHeight: 1,
            filter: "drop-shadow(0 2px 6px rgba(0,0,0,.8))",
            zIndex: 2,
          }}>
            🧤
          </div>

          {/* Ball — appears on result */}
          {(phase === "result") && zone !== null && (
            <div style={{
              position: "absolute",
              left: `${bx}%`,
              top: `${by}%`,
              transform: "translate(-50%, -50%)",
              fontSize: 22,
              zIndex: 3,
              animation: "pop .35s cubic-bezier(.34,1.56,.64,1) both",
              filter: isGoal ? "drop-shadow(0 0 14px rgba(255,255,200,.9))" : undefined,
            }}>
              ⚽
            </div>
          )}

          {/* Zone highlight while aiming */}
          {phase === "aim" && zone !== null && (
            <div style={{
              position: "absolute",
              left: `${bx}%`,
              top: `${by}%`,
              transform: "translate(-50%, -50%)",
              width: 28, height: 28,
              borderRadius: "50%",
              background: "rgba(255,255,255,.25)",
              border: "2px solid rgba(255,255,255,.6)",
              pointerEvents: "none",
              zIndex: 1,
            }} />
          )}
        </div>

        {/* Penalty spot + field markings */}
        <div style={{ position: "relative", height: 20, marginBottom: 8 }}>
          <div style={{
            position: "absolute", left: "50%", top: "50%",
            transform: "translate(-50%, -50%)",
            width: 6, height: 6, borderRadius: "50%",
            background: "rgba(255,255,255,.5)",
          }} />
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.25, pointerEvents: "none" }}>
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="white" strokeWidth="1" />
          </svg>
        </div>

        {/* Aim grid */}
        {phase === "aim" && !usedToday && pubkey && (
          <div>
            <div style={{
              fontSize: 9.5, color: "rgba(255,255,255,.45)", textAlign: "center",
              marginBottom: 6, letterSpacing: 1.5, fontWeight: 700,
            }}>
              ELEGÍ DÓNDE PATEAR
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {ARROWS.map((arrow, i) => (
                <button
                  key={i}
                  onClick={() => kick(i)}
                  onMouseEnter={e => {
                    setZone(i);
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,.22)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,.6)";
                  }}
                  onMouseLeave={e => {
                    setZone(null);
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,.07)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,.15)";
                  }}
                  style={{
                    background: "rgba(255,255,255,.07)",
                    border: "1px solid rgba(255,255,255,.15)",
                    borderRadius: 6,
                    height: 38,
                    cursor: "pointer",
                    color: "rgba(255,255,255,.55)",
                    fontSize: 16,
                    transition: "background .1s, border-color .1s",
                  }}
                >
                  {arrow}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Diving animation */}
        {phase === "diving" && (
          <div style={{ textAlign: "center", padding: "6px 0 2px", fontSize: 26, animation: "pop .2s both" }}>
            ⚽
          </div>
        )}

        {/* Result */}
        {phase === "result" && (
          <div style={{ textAlign: "center", padding: "6px 0 2px" }}>
            {isGoal ? (
              <div style={{ animation: "pop .35s cubic-bezier(.34,1.56,.64,1) both" }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", textShadow: "0 0 24px rgba(255,255,200,.7)", lineHeight: 1 }}>
                  GOOOOOL! ⚽
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.65)", marginTop: 5 }}>
                  ¡Sobre gratis acreditado!
                </div>
              </div>
            ) : (
              <div style={{ animation: "pop .3s both" }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#ff8a80", lineHeight: 1 }}>
                  🧤 ¡Atajado!
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 5 }}>
                  Volvé mañana para otro tiro
                </div>
              </div>
            )}
          </div>
        )}

        {/* Already used today */}
        {usedToday && phase === "aim" && (
          <div style={{
            textAlign: "center", color: "rgba(255,255,255,.4)",
            fontSize: 12, padding: "14px 0", fontWeight: 700,
          }}>
            Ya pateaste hoy · volvé mañana 🌙
          </div>
        )}

        {/* Not connected */}
        {!pubkey && phase === "aim" && (
          <div style={{
            textAlign: "center", color: "rgba(255,255,255,.4)",
            fontSize: 12, padding: "14px 0", fontWeight: 700,
          }}>
            Conectá tu wallet para patear
          </div>
        )}
      </div>
    </div>
  );
}
