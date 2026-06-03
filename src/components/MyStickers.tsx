"use client";

import { useState } from "react";
import { CATALOG, RARITY_META, ALL_NUMBERS, suggestedPrice } from "@/lib/catalog";
import { StickerFace } from "./StickerCard";
import { StickerZoom } from "./StickerZoom";
import { useLang } from "@/contexts/LangContext";
import type { Ownership } from "@/lib/types";

export function MyStickers({
  ownership,
  onSell,
}: {
  ownership: Ownership;
  onSell: (num: number, price: number) => void;
}) {
  const { t } = useLang();
  const [filter,     setFilter]     = useState<"dupes" | "all">("dupes");
  const [zoomedNum,  setZoomedNum]  = useState<number | null>(null);

  const ownedNums = ALL_NUMBERS.filter((n) => (ownership[n] ?? 0) > 0);
  const dupeNums  = ALL_NUMBERS.filter((n) => (ownership[n] ?? 0) > 1);

  if (ownedNums.length === 0) return null;

  const shown = filter === "all" ? ownedNums : dupeNums;

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 24, marginTop: 4 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 14, letterSpacing: 1, color: "var(--ink)" }}>
            {t.my_title}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--condensed)", marginTop: 2 }}>
            {ownedNums.length} {t.my_unique} · {dupeNums.length} {t.my_dupes}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["dupes", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? "var(--gold)" : "transparent",
                color: filter === f ? "#030b18" : "var(--muted)",
                border: filter === f ? "none" : "1px solid var(--line)",
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 900,
                fontFamily: "var(--condensed)",
                letterSpacing: 0.5,
                cursor: "pointer",
              }}
            >
              {f === "dupes" ? t.my_tab_dupes : t.my_tab_all}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {shown.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: "28px 0",
          color: "var(--muted)",
          fontSize: 12,
          fontFamily: "var(--condensed)",
          fontWeight: 700,
        }}>
          {filter === "dupes" ? t.my_empty_dupes : t.my_empty_all}
        </div>
      )}

      {/* Grid */}
      {shown.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(82px, 1fr))",
          gap: 10,
        }}>
          {shown.map((n) => {
            const count  = ownership[n] ?? 0;
            const extras = count - 1;
            const r      = RARITY_META[CATALOG[n].rarity];

            return (
              <div key={n} style={{ position: "relative" }}>
                {/* Card */}
                <div
                  onClick={() => setZoomedNum(n)}
                  style={{
                    height: 112,
                    border: `2px solid ${r.ring}`,
                    borderRadius: 10,
                    overflow: "hidden",
                    boxShadow: extras > 0 ? `0 0 10px ${r.glow}44` : "none",
                    opacity: extras === 0 && filter === "all" ? 0.55 : 1,
                    cursor: "pointer",
                  }}
                >
                  <StickerFace num={n} compact />
                </div>

                {/* Quantity badge (shows when > 1 copy) */}
                {count > 1 && (
                  <div style={{
                    position: "absolute",
                    top: -7,
                    right: -7,
                    background: "var(--gold)",
                    color: "#030b18",
                    fontSize: 9,
                    fontWeight: 900,
                    fontFamily: "var(--condensed)",
                    borderRadius: 99,
                    minWidth: 20,
                    height: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 4px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
                    zIndex: 2,
                  }}>
                    ×{count}
                  </div>
                )}

                {/* Sell button for duplicates */}
                {extras > 0 && (
                  <button
                    onClick={() => onSell(n, suggestedPrice(n))}
                    style={{
                      width: "100%",
                      marginTop: 5,
                      background: "transparent",
                      border: "1px solid var(--gold)",
                      color: "var(--gold)",
                      padding: "4px 0",
                      borderRadius: 6,
                      fontSize: 9,
                      fontWeight: 900,
                      fontFamily: "var(--condensed)",
                      letterSpacing: 0.3,
                      cursor: "pointer",
                    }}
                  >
                    {t.my_sell}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {zoomedNum !== null && (
        <StickerZoom
          num={zoomedNum}
          ownership={ownership}
          onClose={() => setZoomedNum(null)}
          onSell={onSell}
        />
      )}
    </div>
  );
}
