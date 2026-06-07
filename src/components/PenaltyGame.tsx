"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { resolveKick, todayKey } from "@/lib/penalty";
import { useLang } from "@/contexts/LangContext";
import { Scene3DErrorBoundary, Scene2DFallback } from "@/components/Scene3DErrorBoundary";

const PenaltyScene3D = dynamic(() => import("@/components/PenaltyScene3D"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 320, background: "#0d1a0d", borderRadius: 14 }} />
  ),
});

type Phase = "aim" | "flying" | "result";

export function PenaltyGame({
  pubkey,
  onGoal,
  onPublish,
  packPending,
}: {
  pubkey: string | null;
  onGoal: () => void;
  onPublish: (result: "goal" | "save", zone: number, keeper: number, totalGoals: number) => void;
  packPending?: boolean;
}) {
  const { t } = useLang();
  const [phase, setPhase]         = useState<Phase>("aim");
  const [zone, setZone]           = useState<number | null>(null);
  const [keeperCol, setKeeperCol] = useState(1);
  const [isGoal, setIsGoal]       = useState(false);
  const [usedToday, setUsedToday] = useState(false);
  const [totalGoals, setTotalGoals] = useState(0);

  useEffect(() => {
    // Reset visual state when account switches so previous account's result
    // doesn't show on screen for the new account.
    setPhase("aim");
    setZone(null);
    setIsGoal(false);
    if (!pubkey) {
      setUsedToday(false);
      setTotalGoals(0);
      return;
    }
    setUsedToday(localStorage.getItem(`pk_${pubkey}_${todayKey()}`) === "1");
    setTotalGoals(Number(localStorage.getItem(`pk_goals_${pubkey}`) || 0));
  }, [pubkey]);

  function kick(z: number) {
    if (phase !== "aim" || usedToday || !pubkey) return;

    const col  = Math.floor(Math.random() * 3);
    const goal = resolveKick(z, col);

    setZone(z);
    setKeeperCol(col);
    setIsGoal(goal);
    setPhase("flying");

    setTimeout(() => {
      setPhase("result");
      localStorage.setItem(`pk_${pubkey}_${todayKey()}`, "1");
      setUsedToday(true);

      const newGoals = goal ? totalGoals + 1 : totalGoals;
      if (goal) {
        setTotalGoals(newGoals);
        localStorage.setItem(`pk_goals_${pubkey}`, String(newGoals));
        onGoal();
      }
      onPublish(goal ? "goal" : "save", z, col, newGoals);
    }, 850);
  }

  return (
    <div style={{ fontFamily: "var(--condensed)" }}>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "var(--ink)", lineHeight: 1 }}>
            {t.pg_title}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
            {t.pg_subtitle}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: "var(--gold)", lineHeight: 1 }}>{totalGoals}</div>
          <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 1 }}>{t.pg_goals_label}</div>
          {process.env.NODE_ENV === "development" && (
            <button
              onClick={() => {
                if (pubkey) localStorage.removeItem(`pk_${pubkey}_${todayKey()}`);
                setUsedToday(false);
                setPhase("aim");
              }}
              style={{ fontSize: 9, color: "var(--muted)", background: "none", border: "1px solid var(--line)", borderRadius: 4, padding: "2px 6px", cursor: "pointer", marginTop: 4 }}
            >
              reset dev
            </button>
          )}
        </div>
      </div>

      {/* 3D scene */}
      <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 8px 28px rgba(0,0,0,.55)" }}>
        <Scene3DErrorBoundary fallback={<Scene2DFallback phase={phase} isGoal={isGoal} />}>
          <PenaltyScene3D phase={phase} zone={zone} keeperCol={keeperCol} isGoal={isGoal} />
        </Scene3DErrorBoundary>
      </div>

      {/* Controls */}
      <div style={{
        background: "linear-gradient(175deg, #1b5e20 0%, #2e7d32 45%, #388e3c 100%)",
        borderRadius: 14,
        padding: "12px 14px",
        marginTop: 8,
        border: "2px solid rgba(255,255,255,0.12)",
        boxShadow: "inset 0 -4px 0 rgba(0,0,0,.35)",
      }}>

        {/* Aim grid */}
        {phase === "aim" && !usedToday && pubkey && (
          <div>
            <div style={{
              fontSize: 9.5, color: "rgba(255,255,255,.45)", textAlign: "center",
              marginBottom: 6, letterSpacing: 1.5, fontWeight: 700,
            }}>
              {t.pm_choose_zone}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {[t.pm_left, t.pm_center, t.pm_right].map((label, i) => (
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
                    height: 44,
                    cursor: "pointer",
                    color: "rgba(255,255,255,.7)",
                    fontSize: 10,
                    fontFamily: "var(--condensed)",
                    fontWeight: 900,
                    letterSpacing: 0.3,
                    transition: "background .1s, border-color .1s",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        {phase === "result" && (
          <div style={{ textAlign: "center", padding: "6px 0 2px" }}>
            {isGoal ? (
              <div style={{ animation: "pop .35s cubic-bezier(.34,1.56,.64,1) both" }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", textShadow: "0 0 24px rgba(255,255,200,.7)", lineHeight: 1 }}>
                  {t.pg_goal}
                </div>
                {packPending ? (
                  <div style={{ fontSize: 11, color: "rgba(255,255,200,.75)", marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                    <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⏳</span>
                    {t.pg_pack_pending}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.65)", marginTop: 5 }}>
                    {t.pg_pack_awarded}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ animation: "pop .3s both" }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#ff8a80", lineHeight: 1 }}>
                  {t.pm_saved}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 5 }}>
                  {t.pg_try_tomorrow}
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
            {t.pg_already_shot}
          </div>
        )}

        {/* Not connected */}
        {!pubkey && phase === "aim" && (
          <div style={{
            textAlign: "center", color: "rgba(255,255,255,.4)",
            fontSize: 12, padding: "14px 0", fontWeight: 700,
          }}>
            {t.pg_connect_wallet}
          </div>
        )}
      </div>
    </div>
  );
}
