"use client";

import { useEffect, useState } from "react";
import { CATALOG, RARITY_META, TEAMS, suggestedPrice, teamName } from "@/lib/catalog";
import { Flag } from "./Flag";
import { useLang } from "@/contexts/LangContext";
import { StickerFace } from "./StickerCard";
import type { Listing, Ownership } from "@/lib/types";

export function StickerZoom({
  num,
  ownership,
  onClose,
  onSell,
  myListings = [],
}: {
  num: number;
  ownership: Ownership;
  onClose: () => void;
  onSell?: (num: number, price: number) => void;
  myListings?: Listing[];
}) {
  const { t, lang } = useLang();
  const s        = CATALOG[num];
  const r        = RARITY_META[s.rarity];
  const team     = TEAMS[s.team];
  const count    = ownership[num] ?? 0;
  const extras   = count - 1;
  const isListed = myListings.some(l => l.stickerNum === num);
  const listedAt = myListings.find(l => l.stickerNum === num)?.price;
  const [sellPrice, setSellPrice] = useState(String(suggestedPrice(num)));
  const [selling,   setSelling]   = useState(false);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(3,11,24,.88)",
        backdropFilter: "blur(10px)",
        display: "grid",
        placeItems: "center",
        zIndex: 60,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          maxWidth: 340,
          width: "100%",
        }}
      >
        {/* Sticker card grande */}
        <div style={{
          width: 240,
          height: 320,
          borderRadius: 14,
          border: `3px solid ${r.ring}`,
          overflow: "hidden",
          boxShadow: [
            `0 0 40px ${r.glow}`,
            "0 24px 60px rgba(0,0,0,.7)",
          ].join(", "),
          animation: "pop .22s cubic-bezier(.34,1.56,.64,1) both",
        }}>
          <StickerFace num={num} />
        </div>

        {/* Info panel */}
        <div style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: "14px 18px",
          width: "100%",
          textAlign: "center",
          animation: "popIn .22s cubic-bezier(.34,1.56,.64,1) both",
        }}>
          {/* Nombre */}
          <div style={{
            fontFamily: "var(--condensed)",
            fontWeight: 900,
            fontSize: 18,
            color: "var(--ink)",
            lineHeight: 1.1,
            marginBottom: 4,
          }}>
            <Flag team={s.team} height={22} style={{ borderRadius: 3, marginRight: 6 }} /> {s.name}
          </div>

          {/* Equipo */}
          <div style={{
            fontSize: 12,
            color: "var(--muted)",
            fontFamily: "var(--condensed)",
            fontWeight: 700,
            marginBottom: 10,
          }}>
            {teamName(s.team, lang).toUpperCase()} · #{num}
          </div>

          {/* Rareza + colección */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 12 }}>
            <span style={{
              background: r.ring,
              color: "#000",
              fontSize: 10,
              fontWeight: 900,
              padding: "3px 10px",
              borderRadius: 99,
              fontFamily: "var(--condensed)",
              letterSpacing: 0.5,
            }}>
              {r.label.toUpperCase()}
            </span>
            {count > 0 && (
              <span style={{
                background: count > 1 ? "var(--gold)" : "var(--panel2)",
                color: count > 1 ? "#030b18" : "var(--muted)",
                fontSize: 10,
                fontWeight: 900,
                padding: "3px 10px",
                borderRadius: 99,
                fontFamily: "var(--condensed)",
                letterSpacing: 0.3,
              }}>
                {count > 1 ? `×${count} ${t.zoom_copies}` : t.zoom_in_album}
              </span>
            )}
          </div>

          {/* Vender repetida */}
          {extras > 0 && onSell && (
            isListed ? (
              <div style={{
                width: "100%",
                background: "rgba(34,197,94,.1)",
                border: "1px solid rgba(34,197,94,.4)",
                color: "rgb(34,197,94)",
                padding: "9px 0",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 900,
                fontFamily: "var(--condensed)",
                letterSpacing: 0.5,
                textAlign: "center",
                marginBottom: 8,
              }}>
                {t.zoom_listed}{listedAt ? ` · ⚡ ${listedAt} sats` : ""}
              </div>
            ) : selling ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{
                  fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)",
                  fontWeight: 700, letterSpacing: 0.5, marginBottom: 5, textAlign: "left",
                }}>
                  {t.zoom_price_label}
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input
                    autoFocus
                    type="number"
                    min={1}
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid var(--gold)",
                      borderRadius: 8,
                      color: "var(--gold)",
                      fontSize: 15,
                      fontFamily: "var(--condensed)",
                      fontWeight: 700,
                      outline: "none",
                      textAlign: "center",
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onSell(num, Number(sellPrice) || suggestedPrice(num));
                        onClose();
                      }
                      if (e.key === "Escape") setSelling(false);
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => { onSell(num, Number(sellPrice) || suggestedPrice(num)); onClose(); }}
                    style={{
                      flex: 1,
                      background: "var(--gold)",
                      border: "none",
                      color: "#030b18",
                      padding: "9px 0",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 900,
                      fontFamily: "var(--condensed)",
                      letterSpacing: 0.5,
                      cursor: "pointer",
                    }}
                  >
                    {t.zoom_publish}
                  </button>
                  <button
                    onClick={() => setSelling(false)}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--line)",
                      color: "var(--muted)",
                      padding: "9px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setSelling(true)}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "1px solid var(--gold)",
                  color: "var(--gold)",
                  padding: "9px 0",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 900,
                  fontFamily: "var(--condensed)",
                  letterSpacing: 0.5,
                  cursor: "pointer",
                  marginBottom: 8,
                }}
              >
                {t.zoom_sell} · {suggestedPrice(num)} {t.zoom_suggested}
              </button>
            )
          )}

          {/* Cerrar */}
          <button
            onClick={onClose}
            style={{
              width: "100%",
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              color: "var(--muted)",
              padding: "8px 0",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "var(--condensed)",
              cursor: "pointer",
              letterSpacing: 0.5,
            }}
          >
            {t.zoom_close}
          </button>
        </div>
      </div>
    </div>
  );
}
