"use client";

import { useEffect, useState } from "react";
import { TEAMS, TEAM_GROUPS, PAGES, teamName } from "@/lib/catalog";
import { Flag } from "./Flag";
import { useLang } from "@/contexts/LangContext";
import { usePronosticos } from "@/hooks/usePronosticos";
import type { Identity } from "@/lib/identity";

// ─── Groups order ─────────────────────────────────────────────────────────────
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

// ─── Schedule ─────────────────────────────────────────────────────────────────
// MD1 dates per group index (0=A … 11=L)
const MD1_DATES = [
  "11 jun","12 jun","13 jun","13 jun",
  "14 jun","14 jun","15 jun","15 jun",
  "16 jun","16 jun","17 jun","17 jun",
];
// MD2 dates per group index
const MD2_DATES = [
  "19 jun","20 jun","21 jun","21 jun",
  "22 jun","22 jun","23 jun","23 jun",
  "24 jun","24 jun","25 jun","25 jun",
];
// MD3 dates per group index (simultaneous within group)
const MD3_DATES = [
  "28 jun","28 jun","28 jun",
  "29 jun","29 jun","29 jun",
  "30 jun","30 jun","30 jun",
  "1 jul","1 jul","1 jul",
];
// MD3 UTC hour staggered by position within the day (groups 0,3,6,9 → 16h; 1,4,7,10 → 19h; 2,5,8,11 → 22h)
const MD3_UTC_HOURS = [16, 19, 22];

type ScheduleInfo = { date: string; utc: string; art: string; simultaneous: boolean };

function getSchedule(group: string, mdIdx: number, matchIdx: number): ScheduleInfo {
  const gIdx = GROUPS_ORDER.indexOf(group);
  if (gIdx < 0) return { date: "—", utc: "—", art: "—", simultaneous: false };

  let date: string;
  let utcH: number;
  let simultaneous = false;

  if (mdIdx === 0) {
    date = MD1_DATES[gIdx];
    utcH = matchIdx === 0 ? 16 : 20;
  } else if (mdIdx === 1) {
    date = MD2_DATES[gIdx];
    utcH = matchIdx === 0 ? 16 : 20;
  } else {
    date = MD3_DATES[gIdx];
    utcH = MD3_UTC_HOURS[gIdx % 3];
    simultaneous = true;
  }

  const artH = utcH - 3; // min 16-3=13, always positive
  const utc = `${String(utcH).padStart(2, "0")}:00`;
  const art = `${String(artH).padStart(2, "0")}:00`;
  return { date, utc, art, simultaneous };
}

// ─── Sedes ────────────────────────────────────────────────────────────────────
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
export function Fixture({ identity }: { identity?: Identity }) {
  const { t, lang } = useLang();
  const [view,        setView]        = useState<"grupos" | "eliminatorias">("grupos");
  const [activeGroup, setActiveGroup] = useState("A");
  const pubkey = identity?.pubkey ?? null;

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 11, letterSpacing: 3, color: "var(--gold)", marginBottom: 4 }}>
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
          <GroupView group={activeGroup} t={t} lang={lang} myPubkey={pubkey} identity={identity} />
        </>
      )}

      {/* ── ELIMINATORIAS ── */}
      {view === "eliminatorias" && <KnockoutView t={t} />}
    </div>
  );
}

// ─── Group detail view ────────────────────────────────────────────────────────
function GroupView({
  group, t, lang, myPubkey, identity,
}: {
  group: string;
  t: import("@/lib/i18n").Translations;
  lang: string;
  myPubkey: string | null;
  identity?: Identity;
}) {
  const teams = GROUP_TEAMS[group] ?? [];

  return (
    <div>
      {/* Team list */}
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ padding: "8px 14px", background: "var(--panel2)", borderBottom: "1px solid var(--line)", fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 10, letterSpacing: 2, color: "var(--gold)" }}>
          {t.fixture_group_label} {group} — {t.fixture_teams_label}
        </div>
        {teams.map((code, i) => {
          const team = TEAMS[code];
          return (
            <div
              key={code}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < teams.length - 1 ? "1px solid var(--line)" : "none" }}
            >
              <span style={{ fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 11, color: "var(--muted)", width: 16 }}>{i + 1}</span>
              <Flag team={code} height={18} />
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: team.color, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--condensed)", fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
                {teamName(code, lang)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Matches by matchday */}
      {([0, 1, 2] as const).map((mdIdx) => (
        <div key={mdIdx} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 11, color: "var(--ink)", letterSpacing: 0.5 }}>
              {[t.matchday_1, t.matchday_2, t.matchday_3][mdIdx]}
            </span>
            {mdIdx === 2 && (
              <span style={{ fontFamily: "var(--condensed)", fontSize: 10, color: "var(--gold)", letterSpacing: 0.5 }}>
                ⚡ {t.prono_simultaneous}
              </span>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {MD_PAIRS[mdIdx].map(([iA, iB], matchIdx) => {
              const teamA = teams[iA];
              const teamB = teams[iB];
              if (!teamA || !teamB) return null;
              const matchId = `${group}:${mdIdx}:${matchIdx}`;
              const schedule = getSchedule(group, mdIdx, matchIdx);
              return (
                <MatchRow
                  key={matchIdx}
                  teamA={teamA}
                  teamB={teamB}
                  nameA={teamName(teamA, lang)}
                  nameB={teamName(teamB, lang)}
                  matchId={matchId}
                  schedule={schedule}
                  myPubkey={myPubkey}
                  identity={identity}
                  t={t}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Venue */}
      {VENUES[group] && (
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)", textAlign: "center", marginTop: 4, padding: "6px 12px", background: "var(--panel)", borderRadius: 8, border: "1px solid var(--line)" }}>
          📍 {VENUES[group]}
        </div>
      )}
    </div>
  );
}

// ─── Single match row ─────────────────────────────────────────────────────────
function MatchRow({
  teamA, teamB, nameA, nameB,
  matchId, schedule, myPubkey, identity, t,
}: {
  teamA: string;
  teamB: string;
  nameA: string;
  nameB: string;
  matchId: string;
  schedule: ScheduleInfo;
  myPubkey: string | null;
  identity?: Identity;
  t: import("@/lib/i18n").Translations;
}) {
  const { pronos, myProno, publishing, publish } = usePronosticos(matchId, myPubkey);
  const [homeVal, setHomeVal] = useState("");
  const [awayVal, setAwayVal] = useState("");

  // Pre-fill inputs when own prono loads
  useEffect(() => {
    if (myProno) {
      setHomeVal(String(myProno.home));
      setAwayVal(String(myProno.away));
    }
  }, [myProno?.home, myProno?.away]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = pronos.size;
  const isDirty =
    myProno === null ||
    homeVal !== String(myProno.home) ||
    awayVal !== String(myProno.away);

  const handleSave = async () => {
    if (!identity) return;
    const h = parseInt(homeVal, 10);
    const a = parseInt(awayVal, 10);
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) return;
    await publish(h, a, identity);
  };

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>

      {/* Schedule bar */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 12px",
        background: "var(--panel2)",
        borderBottom: "1px solid var(--line)",
      }}>
        <span style={{ fontFamily: "var(--condensed)", fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>
          📅 {schedule.date}
        </span>
        <span style={{ fontFamily: "var(--condensed)", fontSize: 10, color: "var(--ink)", letterSpacing: 0.3 }}>
          🕐 {schedule.utc} UTC&nbsp;&nbsp;/&nbsp;&nbsp;{schedule.art} ARG
        </span>
      </div>

      {/* Teams + score inputs */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 8px" }}>

        {/* Team A */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" }}>
          <span style={{ fontFamily: "var(--condensed)", fontWeight: 700, fontSize: 12, color: "var(--ink)", textAlign: "right" }}>
            {nameA}
          </span>
          <Flag team={teamA} height={16} />
        </div>

        {/* Score inputs */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <input
            type="number"
            min={0}
            max={20}
            value={homeVal}
            onChange={(e) => setHomeVal(e.target.value)}
            placeholder="–"
            style={{
              width: 36,
              height: 36,
              textAlign: "center",
              background: "var(--panel2)",
              border: `1px solid ${homeVal !== "" ? "var(--gold)" : "var(--line)"}`,
              borderRadius: 8,
              color: "var(--ink)",
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              fontSize: 16,
              outline: "none",
              MozAppearance: "textfield",
            } as React.CSSProperties}
          />
          <span style={{ fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 14, color: "var(--muted)" }}>–</span>
          <input
            type="number"
            min={0}
            max={20}
            value={awayVal}
            onChange={(e) => setAwayVal(e.target.value)}
            placeholder="–"
            style={{
              width: 36,
              height: 36,
              textAlign: "center",
              background: "var(--panel2)",
              border: `1px solid ${awayVal !== "" ? "var(--gold)" : "var(--line)"}`,
              borderRadius: 8,
              color: "var(--ink)",
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              fontSize: 16,
              outline: "none",
              MozAppearance: "textfield",
            } as React.CSSProperties}
          />
        </div>

        {/* Team B */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-start" }}>
          <Flag team={teamB} height={16} />
          <span style={{ fontFamily: "var(--condensed)", fontWeight: 700, fontSize: 12, color: "var(--ink)" }}>
            {nameB}
          </span>
        </div>
      </div>

      {/* Save button + count */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px 10px", gap: 8 }}>
        {identity ? (
          <button
            onClick={handleSave}
            disabled={!isDirty || homeVal === "" || awayVal === "" || publishing}
            style={{
              background: myProno && !isDirty
                ? "rgba(34,197,94,.15)"
                : "rgba(139,92,246,.15)",
              color: myProno && !isDirty ? "#4ade80" : "#a78bfa",
              border: `1px solid ${myProno && !isDirty ? "rgba(74,222,128,.3)" : "rgba(167,139,250,.3)"}`,
              borderRadius: 8,
              padding: "5px 14px",
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              fontSize: 11,
              letterSpacing: 0.5,
              cursor: isDirty && homeVal !== "" && awayVal !== "" && !publishing ? "pointer" : "default",
              opacity: !isDirty || homeVal === "" || awayVal === "" ? 0.6 : 1,
              transition: "all .15s",
            }}
          >
            {publishing
              ? t.prono_saving
              : myProno && !isDirty
                ? `✓ ${t.prono_saved}`
                : t.prono_save}
          </button>
        ) : (
          <span style={{ fontFamily: "var(--condensed)", fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>
            {t.prono_connect}
          </span>
        )}

        {count > 0 && (
          <span style={{ fontFamily: "var(--condensed)", fontSize: 10, color: "var(--muted)" }}>
            👥 {count} {t.prono_count}
          </span>
        )}
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
      <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--condensed)", margin: "0 0 6px" }}>
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
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: round.isFinal ? "linear-gradient(135deg,var(--gold),#d4920a)" : "var(--panel2)",
            border: `1px solid ${round.isFinal ? "var(--gold)" : "var(--line)"}`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 12,
            color: round.isFinal ? "#030b18" : "var(--muted)",
          }}>
            {round.isFinal ? "🏆" : i + 1}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 14, color: round.isFinal ? "var(--gold)" : "var(--ink)", letterSpacing: 0.3 }}>
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

          <div style={{
            background: round.isFinal ? "var(--gold)" : "var(--panel2)",
            color: round.isFinal ? "#030b18" : "var(--muted)",
            fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 10,
            padding: "4px 10px", borderRadius: 6,
            border: `1px solid ${round.isFinal ? "var(--gold)" : "var(--line)"}`,
            whiteSpace: "nowrap", flexShrink: 0, letterSpacing: 0.5,
          }}>
            {round.dates}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 6, padding: "10px 14px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)", lineHeight: 1.6 }}>
        <strong style={{ color: "var(--ink)" }}>{t.fixture_format_title}</strong> {t.fixture_format}
      </div>
    </div>
  );
}
