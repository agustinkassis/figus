"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Herramientas de desarrollo. Solo se montan cuando NODE_ENV === "development".
// Todo es 100% local: no firma ni publica ningún evento en Nostr.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

const PRESETS = [1, 5, 10, 50];

/** Barra de herramientas dev embebida en el navbar. */
export function DevTools({
  onAddRandom,
}: {
  /** Agrega `count` figuritas random al álbum (solo local). */
  onAddRandom: (count: number) => void;
}) {
  const [count, setCount] = useState(5);

  const clamp = (n: number) => Math.max(1, Math.min(500, Math.floor(n) || 1));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: 8,
        padding: "8px 20px 10px",
        borderBottom: "1px dashed rgba(245,158,11,.3)",
        background: "rgba(245,158,11,.04)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--condensed)",
          fontWeight: 900,
          fontSize: 10,
          letterSpacing: 1,
          color: "#f59e0b",
        }}
      >
        🛠 DEV · FIGUS RANDOM
      </span>

      <input
        type="number"
        min={1}
        max={500}
        value={count}
        onChange={(e) => setCount(clamp(Number(e.target.value)))}
        aria-label="Cantidad de figuritas"
        style={{
          width: 64,
          background: "var(--panel2)",
          border: "1px solid var(--line)",
          color: "var(--ink)",
          borderRadius: 7,
          padding: "5px 8px",
          fontSize: 12,
          fontFamily: "var(--condensed)",
          fontWeight: 700,
          textAlign: "center",
        }}
      />

      <div style={{ display: "flex", gap: 4 }}>
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setCount(p)}
            style={{
              background: count === p ? "rgba(245,158,11,.18)" : "transparent",
              border: "1px solid rgba(245,158,11,.35)",
              color: "#f59e0b",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 11,
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {p}
          </button>
        ))}
      </div>

      <button
        onClick={() => onAddRandom(clamp(count))}
        style={{
          background: "linear-gradient(135deg, #f59e0b, #d4920a)",
          border: "none",
          color: "#030b18",
          borderRadius: 7,
          padding: "6px 14px",
          fontSize: 11,
          fontFamily: "var(--condensed)",
          fontWeight: 900,
          letterSpacing: 0.5,
          cursor: "pointer",
        }}
      >
        + AGREGAR {clamp(count)} RANDOM
      </button>
    </div>
  );
}

/** Banner fijo full-width que indica que la app corre en modo desarrollo. */
export function DevModeFooter() {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        textAlign: "center",
        padding: "6px 12px",
        background: "repeating-linear-gradient(45deg, rgba(245,158,11,.16) 0 12px, rgba(245,158,11,.08) 12px 24px)",
        borderTop: "1px solid rgba(245,158,11,.5)",
        color: "#f59e0b",
        fontFamily: "var(--condensed)",
        fontWeight: 900,
        fontSize: 11,
        letterSpacing: 2,
        zIndex: 70,
        pointerEvents: "none",
        backdropFilter: "blur(6px)",
      }}
    >
      DEVELOPER MODE
    </div>
  );
}
