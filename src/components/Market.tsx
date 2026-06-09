"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CATALOG, RARITY_META, TEAMS } from "@/lib/catalog";
import type { Listing, Ownership, Settlement } from "@/lib/types";
import { useLang } from "@/contexts/LangContext";
import { Flag } from "./Flag";
import { Traders } from "./Traders";
import { StickerFace } from "./StickerCard";
import { NostrAvatar } from "./NostrAvatar";

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
  const [zoomed, setZoomed] = useState<Listing | null>(null);
  const mine  = listings.filter((l) => l.seller === myPubkey);
  const others = listings.filter((l) => l.seller !== myPubkey);

  useEffect(() => {
    if (!zoomed) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setZoomed(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoomed]);

  return (
    <div className="fade-in">
      <h2 style={{ fontFamily: "var(--display)", fontSize: 20, margin: 0 }}>
        {t.market_title}
      </h2>
      <p style={{ opacity: 0.65, fontSize: 13, marginTop: 4, marginBottom: 14 }}>
        {t.market_subtitle}
      </p>

      {/* ── INTERCAMBIOS ── */}
      <div style={{ marginBottom: 28, borderBottom: "1px solid var(--line)", paddingBottom: 24 }}>
        <Traders myOwnership={myOwnership} myPubkey={myPubkey} />
      </div>

      {/* ── COMPRAR/VENDER ── */}
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
              const alreadyOwn = (myOwnership[l.stickerNum] ?? 0) > 0;
              return (
                <div
                  key={l.id}
                  onClick={() => setZoomed(l)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "var(--panel)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    padding: 12,
                    cursor: "pointer",
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
                    <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
                      <NostrAvatar pubkey={l.seller} size={18} fontSize={11} nameColor="var(--muted)" />
                      {alreadyOwn && (
                        <span style={{
                          fontSize: 9, fontFamily: "var(--condensed)", fontWeight: 900,
                          letterSpacing: 0.5, color: "rgb(34,197,94)",
                          background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)",
                          borderRadius: 99, padding: "2px 7px",
                        }}>
                          {t.market_i_have_it}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onBuy(l); }}
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
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 0",
                    borderBottom: "1px solid var(--line)",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--gold)" }}>✅ #{s.stickerNum}</span>
                  <NostrAvatar pubkey={s.from} size={18} fontSize={10} nameColor="var(--muted)" />
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>→</span>
                  <NostrAvatar pubkey={s.to} size={18} fontSize={10} nameColor="var(--muted)" />
                  <span style={{ fontSize: 10, color: "var(--gold)", fontFamily: "var(--condensed)", fontWeight: 700, marginLeft: "auto" }}>
                    ⚡ {s.price} sats
                  </span>
                </div>
              ))}
            </div>
          )}
        </>

      {/* ── ZOOM OVERLAY ── */}
      {zoomed && typeof document !== "undefined" && createPortal(
        <ListingZoom listing={zoomed} onClose={() => setZoomed(null)} onBuy={onBuy} />,
        document.body
      )}
    </div>
  );
}

function ListingZoom({
  listing,
  onClose,
  onBuy,
}: {
  listing: Listing;
  onClose: () => void;
  onBuy: (l: Listing) => void;
}) {
  const s = CATALOG[listing.stickerNum];
  const r = RARITY_META[s.rarity];
  const team = TEAMS[s.team];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(3,11,24,.88)",
        backdropFilter: "blur(10px)",
        display: "grid", placeItems: "center",
        zIndex: 60, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 16,
          maxWidth: 340, width: "100%",
        }}
      >
        {/* Figurita grande */}
        <div style={{
          width: 240, height: 320, borderRadius: 14,
          border: `3px solid ${r.ring}`, overflow: "hidden",
          boxShadow: `0 0 40px ${r.glow}, 0 24px 60px rgba(0,0,0,.7)`,
          animation: "pop .22s cubic-bezier(.34,1.56,.64,1) both",
        }}>
          <StickerFace num={listing.stickerNum} />
        </div>

        {/* Info + comprar */}
        <div style={{
          background: "var(--panel)", border: "1px solid var(--line)",
          borderRadius: 14, padding: "14px 18px",
          width: "100%", textAlign: "center",
          animation: "popIn .22s cubic-bezier(.34,1.56,.64,1) both",
        }}>
          <div style={{
            fontFamily: "var(--condensed)", fontWeight: 900,
            fontSize: 18, color: "var(--ink)", lineHeight: 1.1, marginBottom: 4,
          }}>
            <Flag team={s.team} height={22} style={{ borderRadius: 3, marginRight: 6 }} />
            {s.name}
          </div>

          <div style={{
            fontSize: 12, color: "var(--muted)", fontFamily: "var(--condensed)",
            fontWeight: 700, marginBottom: 10,
          }}>
            {team.name.toUpperCase()} · #{listing.stickerNum}
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 14 }}>
            <span style={{
              background: r.ring, color: "#000",
              fontSize: 10, fontWeight: 900,
              padding: "3px 10px", borderRadius: 99,
              fontFamily: "var(--condensed)", letterSpacing: 0.5,
            }}>
              {r.label.toUpperCase()}
            </span>
            <span style={{
              background: "var(--panel2)",
              padding: "4px 10px", borderRadius: 99,
            }}>
              <NostrAvatar pubkey={listing.seller} size={18} fontSize={10} nameColor="var(--muted)" />
            </span>
          </div>

          <button
            onClick={() => { onBuy(listing); onClose(); }}
            style={{
              width: "100%",
              background: "linear-gradient(135deg,var(--grass),var(--pitch))",
              color: "#fff", border: 0,
              padding: "12px 0", borderRadius: 10,
              fontWeight: 900, fontSize: 15,
              fontFamily: "var(--condensed)", letterSpacing: 0.5,
              cursor: "pointer", marginBottom: 8,
            }}
          >
            ⚡ COMPRAR · {listing.price} sats
          </button>

          <button
            onClick={onClose}
            style={{
              width: "100%", background: "var(--panel2)",
              border: "1px solid var(--line)", color: "var(--muted)",
              padding: "8px 0", borderRadius: 8,
              fontSize: 11, fontWeight: 700, fontFamily: "var(--condensed)",
              cursor: "pointer", letterSpacing: 0.5,
            }}
          >
            CERRAR
          </button>
        </div>
      </div>
    </div>
  );
}
