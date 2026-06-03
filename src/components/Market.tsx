"use client";

import { useState } from "react";
import { CATALOG, RARITY_META, TEAMS } from "@/lib/catalog";
import type { Listing, Ownership, Settlement } from "@/lib/types";
import { useLang } from "@/contexts/LangContext";
import { Traders } from "./Traders";
import { StickerFace } from "./StickerCard";

export function Market({
  listings,
  settlements,
  myOwnership,
  myPubkey,
  onBuy,
  onCancel,
}: {
  listings: Listing[];
  settlements: Settlement[];
  myOwnership: Ownership;
  myPubkey: string | null;
  onBuy: (listing: Listing) => void;
  onCancel: (listing: Listing) => void;
}) {
  const { t } = useLang();
  const [view, setView] = useState<"listings" | "traders">("listings");
  const mine  = listings.filter((l) => l.seller === myPubkey);
  const others = listings.filter((l) => l.seller !== myPubkey);

  return (
    <div className="fade-in">
      <h2 style={{ fontFamily: "var(--display)", fontSize: 20, margin: 0 }}>
        {t.market_title}
      </h2>
      <p style={{ opacity: 0.65, fontSize: 13, marginTop: 4, marginBottom: 14 }}>
        {t.market_subtitle}
      </p>

      {/* Sub-view toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {(["listings", "traders"] as const).map((v) => (
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
            {v === "listings" ? t.market_view_listings : t.market_view_traders}
          </button>
        ))}
      </div>

      {/* ── COMPRAR/VENDER ── */}
      {view === "listings" && (
        <>
          {/* Mis ventas activas */}
          {mine.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)",
                fontWeight: 900, letterSpacing: 1.5, marginBottom: 10,
              }}>
                MIS VENTAS ACTIVAS
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {mine.map((l) => {
                  const s = CATALOG[l.stickerNum];
                  const r = RARITY_META[s.rarity];
                  return (
                    <div key={l.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "rgba(232,185,35,0.06)",
                      border: "1px solid rgba(232,185,35,0.25)",
                      borderRadius: 12, padding: 10,
                    }}>
                      <div style={{
                        width: 44, height: 58, borderRadius: 7,
                        border: `2px solid ${r.ring}`, overflow: "hidden", flexShrink: 0,
                      }}>
                        <StickerFace num={l.stickerNum} compact />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "var(--gold)", fontFamily: "var(--condensed)", fontWeight: 700 }}>
                          ⚡ {l.price} sats
                        </div>
                      </div>
                      <button
                        onClick={() => onCancel(l)}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(255,80,80,0.4)",
                          color: "rgba(255,120,120,0.9)",
                          padding: "7px 12px", borderRadius: 8,
                          fontSize: 11, fontFamily: "var(--condensed)", fontWeight: 900,
                          cursor: "pointer", flexShrink: 0, letterSpacing: 0.3,
                        }}
                      >
                        CANCELAR
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: 12 }}>
            {others.length === 0 && (
              <p style={{ opacity: 0.5 }}>{t.market_no_offers}</p>
            )}
            {others.map((l) => {
              const s = CATALOG[l.stickerNum];
              const r = RARITY_META[s.rarity];
              const team = TEAMS[s.team];
              return (
                <div
                  key={l.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "var(--panel)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 74,
                      borderRadius: 8,
                      border: `2px solid ${r.ring}`,
                      overflow: "hidden",
                      flexShrink: 0,
                      boxShadow: `0 0 8px ${r.glow}44`,
                    }}
                  >
                    <StickerFace num={l.stickerNum} compact />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>
                      {team.name} · <span style={{ color: r.ring }}>{r.label}</span>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.45 }}>
                      vendedor: {l.seller.slice(0, 12)}…
                    </div>
                  </div>
                  <button
                    onClick={() => onBuy(l)}
                    style={{
                      background: "linear-gradient(135deg,var(--grass),var(--pitch))",
                      color: "#fff",
                      border: 0,
                      padding: "10px 14px",
                      borderRadius: 10,
                      fontWeight: 800,
                      fontSize: 14,
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}
                  >
                    ⚡ {l.price} sats
                  </button>
                </div>
              );
            })}
          </div>

          {settlements.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <h3 style={{ fontSize: 14, opacity: 0.7 }}>{t.market_transfers}</h3>
              {settlements.map((s) => (
                <div
                  key={s.id}
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    padding: "6px 0",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  ✅ #{s.stickerNum} · {s.from.slice(0, 8)}… → {s.to.slice(0, 8)}… ·{" "}
                  {s.price} sats
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── INTERCAMBIAR ── */}
      {view === "traders" && (
        <Traders myOwnership={myOwnership} myPubkey={myPubkey} />
      )}
    </div>
  );
}
