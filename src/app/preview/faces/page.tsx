"use client";

import { useCallback, useEffect, useState } from "react";
import { StickerFace } from "@/components/StickerCard";
import { CATALOG, PAGES, TEAMS } from "@/lib/catalog";
import FACES from "@/lib/faces-manifest.json";

// Grilla de revisión de caras (scripts/fetch-faces.ts):
// ← → navega equipos · click marca una figurita para rehacer · el modal
// lista las marcadas y copia sus números en CSV para iterar.

const STORAGE_KEY = "faces-review-selected";

const btnStyle: React.CSSProperties = {
  background: "#1a1a2e",
  color: "#fff",
  border: "1px solid var(--gold)",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 14,
  fontFamily: "var(--condensed)",
  cursor: "pointer",
};

export default function FacesPreviewPage() {
  const teamCodes = Object.keys(TEAMS).filter((t) => t !== "fwc" && t !== "ita");
  const [team, setTeam] = useState("cuw");
  const [selected, setSelected] = useState<number[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Persistir selección entre recargas
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSelected(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
    } catch {}
  }, [selected]);

  const teamIdx = teamCodes.indexOf(team);
  const prevTeam = useCallback(
    () => setTeam(teamCodes[(teamIdx - 1 + teamCodes.length) % teamCodes.length]),
    [teamIdx, teamCodes]
  );
  const nextTeam = useCallback(
    () => setTeam(teamCodes[(teamIdx + 1) % teamCodes.length]),
    [teamIdx, teamCodes]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showModal) return;
      if (e.key === "ArrowLeft") prevTeam();
      if (e.key === "ArrowRight") nextTeam();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevTeam, nextTeam, showModal]);

  const toggle = (num: number) =>
    setSelected((sel) =>
      sel.includes(num) ? sel.filter((n) => n !== num) : [...sel, num].sort((a, b) => a - b)
    );

  const csv = selected.join(",");
  const copyCsv = async () => {
    try {
      await navigator.clipboard.writeText(csv);
    } catch {
      // clipboard API no disponible (sin foco/permiso): fallback con textarea
      const ta = document.createElement("textarea");
      ta.value = csv;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const numbers = PAGES.find((p) => p.id === team)?.numbers ?? [];
  const facePositions = (FACES as Record<string, number[]>)[team] ?? [];
  const withFace = numbers.filter((n) => facePositions.includes(((n - 21) % 20) + 1));

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      padding: "32px 24px",
      fontFamily: "var(--condensed)",
    }}>
      <h1 style={{
        color: "var(--gold)",
        fontFamily: "var(--display)",
        fontSize: 28,
        marginBottom: 8,
        textAlign: "center",
      }}>
        ★ CARAS POR EQUIPO ★
      </h1>
      <p style={{ color: "var(--muted)", textAlign: "center", marginBottom: 16, fontSize: 13 }}>
        {withFace.length}/{numbers.length} con imagen · click en una figurita para marcarla para rehacer
      </p>

      {/* ── Barra: navegación + selector + modal ── */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 10,
        marginBottom: 32,
        flexWrap: "wrap",
      }}>
        <button onClick={prevTeam} style={btnStyle} aria-label="Equipo anterior">←</button>
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          style={{ ...btnStyle, minWidth: 220 }}
        >
          {teamCodes.map((code) => {
            const count = ((FACES as Record<string, number[]>)[code] ?? []).length;
            return (
              <option key={code} value={code}>
                Grupo {`ABCDEFGHIJKL`[Math.floor(teamCodes.indexOf(code) / 4)]} · {TEAMS[code].name} ({count}/19)
              </option>
            );
          })}
        </select>
        <button onClick={nextTeam} style={btnStyle} aria-label="Equipo siguiente">→</button>
        <button
          onClick={() => setShowModal(true)}
          style={{
            ...btnStyle,
            background: selected.length ? "#7f1d1d" : "#1a1a2e",
            borderColor: selected.length ? "#f87171" : "var(--gold)",
            fontWeight: 900,
          }}
        >
          🔁 Para rehacer ({selected.length})
        </button>
      </div>

      {/* ── Grilla del equipo ── */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        justifyContent: "center",
        maxWidth: 980,
        margin: "0 auto",
      }}>
        {numbers.map((num) => {
          const pos = ((num - 21) % 20) + 1;
          const trackable = pos !== 1; // pos 13 (foto del equipo) también se trackea
          const face = trackable && facePositions.includes(pos);
          const isSel = selected.includes(num);
          return (
            <div key={num} style={{ width: 110 }}>
              <div
                onClick={() => toggle(num)}
                style={{
                  width: 110,
                  height: 148,
                  cursor: "pointer",
                  position: "relative",
                  outline: isSel ? "3px solid #f87171" : "none",
                  outlineOffset: 2,
                  borderRadius: 4,
                }}
              >
                <StickerFace num={num} />
                {isSel && (
                  <div style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    background: "#f87171",
                    color: "#000",
                    borderRadius: "50%",
                    width: 22,
                    height: 22,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 900,
                    zIndex: 5,
                  }}>
                    ✗
                  </div>
                )}
              </div>
              <div style={{
                marginTop: 4,
                fontSize: 10,
                textAlign: "center",
                color: "var(--muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {num} · {CATALOG[num].name}
              </div>
              {trackable && (
                <div style={{
                  marginTop: 2,
                  fontSize: 9,
                  fontWeight: 900,
                  textAlign: "center",
                  letterSpacing: 0.5,
                  color: isSel ? "#f87171" : face ? "#4ade80" : "#f87171",
                }}>
                  {isSel ? "REHACER" : face ? "FACE" : "FALLBACK"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Modal de seleccionadas ── */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#10101e",
              border: "1px solid var(--gold)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 760,
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ color: "var(--gold)", fontFamily: "var(--display)", fontSize: 20, margin: 0 }}>
                Para rehacer ({selected.length})
              </h2>
              <button onClick={() => setShowModal(false)} style={btnStyle}>✕ Cerrar</button>
            </div>

            {selected.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 14 }}>
                No hay figuritas marcadas. Click en una figurita de la grilla para marcarla.
              </p>
            ) : (
              <>
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 20,
                }}>
                  {selected.map((num) => (
                    <div key={num} style={{ width: 90 }}>
                      <div
                        onClick={() => toggle(num)}
                        title="Quitar de la lista"
                        style={{ width: 90, height: 121, cursor: "pointer" }}
                      >
                        <StickerFace num={num} compact />
                      </div>
                      <div style={{
                        marginTop: 3,
                        fontSize: 9,
                        textAlign: "center",
                        color: "var(--muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {num} · {CATALOG[num]?.name} ({TEAMS[CATALOG[num]?.team]?.name})
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{
                  background: "#000",
                  border: "1px solid #333",
                  borderRadius: 6,
                  padding: "10px 12px",
                  fontFamily: "monospace",
                  fontSize: 13,
                  color: "#4ade80",
                  marginBottom: 14,
                  wordBreak: "break-all",
                  userSelect: "all",
                }}>
                  {csv}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={copyCsv}
                    style={{ ...btnStyle, background: "#14532d", borderColor: "#4ade80", fontWeight: 900 }}
                  >
                    {copied ? "✓ Copiado!" : "📋 Copiar números"}
                  </button>
                  <button
                    onClick={() => setSelected([])}
                    style={{ ...btnStyle, background: "#7f1d1d", borderColor: "#f87171" }}
                  >
                    🗑 Vaciar lista
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
