"use client";

import { StickerFace } from "@/components/StickerCard";
import { CATALOG } from "@/lib/catalog";

// Shows all 20 FWC special stickers without requiring ownership
export default function PreviewPage() {
  const fwcNums = Object.keys(CATALOG)
    .map(Number)
    .filter((n) => n <= 20)
    .sort((a, b) => a - b);

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
        ★ FIGURAS ESPECIALES FWC ★
      </h1>
      <p style={{ color: "var(--muted)", textAlign: "center", marginBottom: 32, fontSize: 13 }}>
        Figuritas 1–20 · página de preview
      </p>

      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        justifyContent: "center",
        maxWidth: 900,
        margin: "0 auto",
      }}>
        {fwcNums.map((num) => (
          <div key={num} style={{ width: 110, height: 148 }}>
            <StickerFace num={num} />
          </div>
        ))}
      </div>
    </div>
  );
}
