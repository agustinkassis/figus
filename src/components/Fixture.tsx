"use client";

import { useState } from "react";
import { TEAMS, TEAM_GROUPS, PAGES, teamName } from "@/lib/catalog";
import { Flag } from "./Flag";
import { useLang } from "@/contexts/LangContext";

// ─── Build group → ordered team codes ────────────────────────────────────────
const GROUPS_ORDER = ["A","B","C","D","E","F","G","H","I","J","K","L"];

const GROUP_TEAMS: Record<string, string[]> = {};
PAGES.forEach((p) => {
  if (p.id === "fwc") return;
  const g = TEAM_GROUPS[p.id];
  if (g) {
    if (!GROUP_TEAMS[g]) GROUP_TEAMS[g] = [];
    GROUP_TEAMS[g].push(p.id);
  }
});

// Standard round-robin pairs (T1=idx 0 … T4=idx 3)
const MD_PAIRS = [
  [[0,1],[2,3]],
  [[0,2],[1,3]],
  [[0,3],[1,2]],
] as const;

// ─── Group stage matchday dates (labels come from i18n) ──────────────────────
const MATCHDAYS = [
  { dates: "11 – 17 jun 2026" },
  { dates: "19 – 25 jun 2026" },
  { dates: "27 jun – 1 jul 2026" },
];

// ─── Sede mapping (approx, ordered by host) ──────────────────────────────────
const VENUES: Record<string, string> = {
  A: "Estadio Azteca · CDMX / Estadio BBVA · Monterrey",
  B: "BC Place · Vancouver / AT&T Stadium · Dallas",
  C: "Levi's Stadium · San José / MetLife Stadium · NJ",
  D: "SoFi Stadium · Los Ángeles / Arrowhead · Kansas City",
  E: "Estadio Akron · Guadalajara / Gillette Stadium · Boston",
  F: "Lincoln Financial · Filadelfia / BMO Field · Toronto",
  G: "Rose Bowl · Los Ángeles / Mercedes-Benz · Atlanta",
  H: "Estadio Azteca · CDMX / Lumen Field · Seattle",
  I: "MetLife Stadium · NJ / AT&T Stadium · Dallas",
  J: "Estadio BBVA · Monterrey / SoFi Stadium · Los Ángeles",
  K: "BC Place · Vancouver / Levi's Stadium · San José",
  L: "Estadio Akron · Guadalajara / Lincoln Financial · Filadelfia",
};

// ─── Component ────────────────────────────────────────────────────────────────
export function Fixture() {
  const { t, lang } = useLang();
  const [view,         setView]         = useState<"grupos" | "eliminatorias">("grupos");
  const [activeGroup,  setActiveGroup]  = useState("A");

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontFamily: "var(--condensed)", fontWeight: 900,
          fontSize: 11, letterSpacing: 3, color: "var(--gold)", marginBottom: 4,
        }}>
          FIFA WORLD CUP 2026™
        </div>
        <div style={{ fontFamily: "var(--display)", fontSize: 22, color: "var(--ink)", lineHeight: 1.1, marginBottom: 6 }}>
          {t.fixture_title}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--condensed)" }}>
          {t.fixture_subtitle}
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["grupos", "eliminatorias"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              background: view === v ? "var(--gold)" : "var(--panel)",
              color: view === v ? "#030b18" : "var(--muted)",
              border: `1px solid ${view === v ? "var(--gold)" : "var(--line)"}`,
              padding: "7px 16px",
              borderRadius: 8,
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              fontSize: 11,
              letterSpacing: 1,
              cursor: "pointer",
            }}
          >
            {v === "grupos" ? t.fixture_groups : t.fixture_knockout}
          </button>
        ))}
      </div>

      {/* ── FASE DE GRUPOS ── */}
      {view === "grupos" && (
        <>
          {/* Group tabs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
            {GROUPS_ORDER.map((g) => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                style={{
                  background: activeGroup === g ? "var(--gold)" : "var(--panel)",
                  color: activeGroup === g ? "#030b18" : "var(--muted)",
                  border: `1px solid ${activeGroup === g ? "var(--gold)" : "var(--line)"}`,
                  padding: "5px 11px",
                  borderRadius: 6,
                  fontFamily: "var(--condensed)",
                  fontWeight: 900,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {t.fixture_group_tab} {g}
              </button>
            ))}
          </div>

          <GroupView group={activeGroup} t={t} lang={lang} />
        </>
      )}

      {/* ── ELIMINATORIAS ── */}
      {view === "eliminatorias" && <KnockoutView t={t} />}
    </div>
  );
}

// ─── Group detail view ────────────────────────────────────────────────────────
function GroupView({ group, t, lang }: { group: string; t: import("@/lib/i18n").Translations; lang: string }) {
  const teams = GROUP_TEAMS[group] ?? [];

  return (
    <div>
      {/* Team list */}
      <div style={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 14,
      }}>
        <div style={{
          padding: "8px 14px",
          background: "var(--panel2)",
          borderBottom: "1px solid var(--line)",
          fontFamily: "var(--condensed)",
          fontWeight: 900,
          fontSize: 10,
          letterSpacing: 2,
          color: "var(--gold)",
        }}>
          {t.fixture_group_label} {group} — {t.fixture_teams_label}
        </div>
        {teams.map((code, i) => {
          const team = TEAMS[code];
          return (
            <div
              key={code}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderBottom: i < teams.length - 1 ? "1px solid var(--line)" : "none",
              }}
            >
              <span style={{
                fontFamily: "var(--condensed)",
                fontWeight: 900,
                fontSize: 11,
                color: "var(--muted)",
                width: 16,
              }}>
                {i + 1}
              </span>
              <Flag team={code} height={18} />
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: team.color,
                  flexShrink: 0,
                }}
              />
              <span style={{
                fontFamily: "var(--condensed)",
                fontWeight: 700,
                fontSize: 13,
                color: "var(--ink)",
              }}>
                {teamName(code, lang)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Matches by matchday */}
      {MATCHDAYS.map((md, mdIdx) => (
        <div key={mdIdx} style={{ marginBottom: 14 }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 8,
          }}>
            <span style={{
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              fontSize: 11,
              color: "var(--ink)",
              letterSpacing: 0.5,
            }}>
              {[t.matchday_1, t.matchday_2, t.matchday_3][mdIdx]}
            </span>
            <span style={{
              fontFamily: "var(--condensed)",
              fontSize: 10,
              color: "var(--muted)",
            }}>
              {md.dates}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {MD_PAIRS[mdIdx].map(([iA, iB], matchIdx) => {
              const teamA = teams[iA];
              const teamB = teams[iB];
              if (!teamA || !teamB) return null;
              return (
                <MatchRow key={matchIdx} teamA={teamA} teamB={teamB} nameA={teamName(teamA, lang)} nameB={teamName(teamB, lang)} />
              );
            })}
          </div>
        </div>
      ))}

      {/* Venue */}
      {VENUES[group] && (
        <div style={{
          fontSize: 10,
          color: "var(--muted)",
          fontFamily: "var(--condensed)",
          textAlign: "center",
          marginTop: 4,
          padding: "6px 12px",
          background: "var(--panel)",
          borderRadius: 8,
          border: "1px solid var(--line)",
        }}>
          📍 {VENUES[group]}
        </div>
      )}
    </div>
  );
}

// ─── Single match row ─────────────────────────────────────────────────────────
function MatchRow({
  teamA,
  teamB,
  nameA,
  nameB,
}: {
  teamA: string;
  teamB: string;
  nameA: string;
  nameB: string;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: "var(--panel)",
      border: "1px solid var(--line)",
      borderRadius: 10,
      padding: "10px 12px",
    }}>
      {/* Team A */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" }}>
        <span style={{
          fontFamily: "var(--condensed)",
          fontWeight: 700,
          fontSize: 12,
          color: "var(--ink)",
          textAlign: "right",
        }}>
          {nameA}
        </span>
        <Flag team={teamA} height={16} />
      </div>

      {/* VS */}
      <div style={{
        fontFamily: "var(--condensed)",
        fontWeight: 900,
        fontSize: 11,
        color: "var(--muted)",
        padding: "4px 10px",
        background: "var(--panel2)",
        borderRadius: 6,
        border: "1px solid var(--line)",
        letterSpacing: 1,
        flexShrink: 0,
      }}>
        VS
      </div>

      {/* Team B */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-start" }}>
        <Flag team={teamB} height={16} />
        <span style={{
          fontFamily: "var(--condensed)",
          fontWeight: 700,
          fontSize: 12,
          color: "var(--ink)",
        }}>
          {nameB}
        </span>
      </div>
    </div>
  );
}

// ─── Knockout view ────────────────────────────────────────────────────────────
function KnockoutView({ t }: { t: import("@/lib/i18n").Translations }) {
  const rounds = [
    { label: t.ko_round32, dates: "3 – 6 jul",   detail: t.ko_detail_32, info: t.ko_info_32 },
    { label: t.ko_round16, dates: "8 – 10 jul",  detail: t.ko_detail_16, info: "" },
    { label: t.ko_quarter, dates: "12 – 13 jul", detail: t.ko_detail_8,  info: "" },
    { label: t.ko_semi,    dates: "15 – 16 jul", detail: t.ko_detail_4,  info: "" },
    { label: t.ko_third,   dates: "18 jul",       detail: t.ko_detail_3rd, info: "" },
    { label: t.ko_final,   dates: "19 jul",       detail: t.ko_final_venue, info: t.ko_final_info, isFinal: true },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{
        fontSize: 11,
        color: "var(--muted)",
        fontFamily: "var(--condensed)",
        margin: "0 0 6px",
      }}>
        {t.fixture_qualify}
      </p>

      {rounds.map((round, i) => (
        <div
          key={i}
          style={{
            background: round.isFinal
              ? "linear-gradient(135deg, rgba(232,185,35,.15), rgba(232,185,35,.05))"
              : "var(--panel)",
            border: `1px solid ${round.isFinal ? "var(--gold)" : "var(--line)"}`,
            borderRadius: 12,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          {/* Round number circle */}
          <div style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: round.isFinal
              ? "linear-gradient(135deg,var(--gold),#d4920a)"
              : "var(--panel2)",
            border: `1px solid ${round.isFinal ? "var(--gold)" : "var(--line)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontFamily: "var(--condensed)",
            fontWeight: 900,
            fontSize: 12,
            color: round.isFinal ? "#030b18" : "var(--muted)",
          }}>
            {round.isFinal ? "🏆" : i + 1}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              fontSize: 14,
              color: round.isFinal ? "var(--gold)" : "var(--ink)",
              letterSpacing: 0.3,
            }}>
              {round.label}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--condensed)", marginTop: 2 }}>
              {round.detail}
            </div>
            {round.info && (
              <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)", marginTop: 2, opacity: 0.7 }}>
                {round.info}
              </div>
            )}
          </div>

          {/* Date badge */}
          <div style={{
            background: round.isFinal ? "var(--gold)" : "var(--panel2)",
            color: round.isFinal ? "#030b18" : "var(--muted)",
            fontFamily: "var(--condensed)",
            fontWeight: 900,
            fontSize: 10,
            padding: "4px 10px",
            borderRadius: 6,
            border: `1px solid ${round.isFinal ? "var(--gold)" : "var(--line)"}`,
            whiteSpace: "nowrap",
            flexShrink: 0,
            letterSpacing: 0.5,
          }}>
            {round.dates}
          </div>
        </div>
      ))}

      {/* Format note */}
      <div style={{
        marginTop: 6,
        padding: "10px 14px",
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        fontSize: 10,
        color: "var(--muted)",
        fontFamily: "var(--condensed)",
        lineHeight: 1.6,
      }}>
        <strong style={{ color: "var(--ink)" }}>{t.fixture_format_title}</strong> {t.fixture_format}
      </div>
    </div>
  );
}
