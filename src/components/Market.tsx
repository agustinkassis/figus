"use client";

import { useState } from "react";
import { CATALOG, RARITY_META, TEAMS, suggestedPrice } from "@/lib/catalog";
import type { Listing, Ownership, Settlement } from "@/lib/types";
import { useLang } from "@/contexts/LangContext";
import { Traders } from "./Traders";
import { StickerFace } from "./StickerCard";

export function Market({
  listings,
  settlements,
  myDupes,
  myOwnership,
  myPubkey,
  onList,
  onBuy,
}: {
  listings: Listing[];
  settlements: Settlement[];
  myDupes: number[];
  myOwnership: Ownership;
  myPubkey: string | null;
  onList: (num: number, price: number) => void;
  onBuy: (listing: Listing) => void;
}) {
  const { t } = useLang();
  const [view, setView] = useState<"listings" | "traders">("listings");
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
          {myDupes.length > 0 && (
            <div
              style={{
                background: "var(--panel)",
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 14,
                marginBottom: 18,
              }}
            >
              <strong style={{ fontSize: 13 }}>{t.market_your_dupes}</strong>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {myDupes.map((n) => (
                  <button
                    key={n}
                    onClick={() => onList(n, suggestedPrice(n))}
                    style={{
                      background: "#0d1117",
                      border: "1px solid var(--gold)",
                      color: "var(--gold)",
                      padding: "6px 10px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    #{n} {CATALOG[n].name} · {t.market_sell}
                  </button>
                ))}
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
