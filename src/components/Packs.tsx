"use client";

import { useEffect, useRef, useState } from "react";
import { CATALOG, RARITY_META, TEAMS, TEAM_FLAGS } from "@/lib/catalog";
import { StickerFace } from "./StickerCard";
import { useLang } from "@/contexts/LangContext";
import { ShareButton } from "./ShareButton";
import type { Identity } from "@/lib/identity";
import { SITE_URL } from "@/lib/share";

export function Packs({
  onOpen,
  onDemo,
  onCancel,
  busy,
  freePack,
}: {
  onOpen: () => void;
  onDemo: () => void;
  onCancel: () => void;
  busy: boolean;
  freePack?: { available: boolean; onOpen: () => void };
}) {
  const { t } = useLang();
  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0" }}>

      {/* ── SOBRE DE REGALO ── */}
      {freePack?.available && (
        <div style={{
          width: "100%",
          maxWidth: 340,
          marginBottom: 28,
          background: "linear-gradient(135deg, rgba(82,183,136,.12), rgba(82,183,136,.04))",
          border: "1px solid rgba(82,183,136,.5)",
          borderRadius: 16,
          padding: "18px 20px",
          textAlign: "center",
        }}>
          <div style={{
            fontFamily: "var(--condensed)",
            fontWeight: 900,
            fontSize: 10,
            letterSpacing: 2,
            color: "#52b788",
            marginBottom: 6,
          }}>
            {t.pack_free_badge}
          </div>
          <div style={{
            fontFamily: "var(--display)",
            fontSize: 20,
            color: "var(--ink)",
            marginBottom: 4,
          }}>
            {t.pack_free_title}
          </div>
          <div style={{
            fontSize: 11,
            color: "var(--muted)",
            fontFamily: "var(--condensed)",
            marginBottom: 14,
          }}>
            {t.pack_free_subtitle}
          </div>
          <button
            disabled={busy}
            onClick={freePack.onOpen}
            style={{
              background: busy ? "var(--panel2)" : "linear-gradient(135deg, #52b788, #2d6a4f)",
              color: busy ? "var(--muted)" : "#fff",
              border: "none",
              padding: "12px 28px",
              borderRadius: 10,
              fontWeight: 900,
              fontSize: 14,
              fontFamily: "var(--condensed)",
              letterSpacing: 0.5,
              cursor: busy ? "default" : "pointer",
              transition: "all .2s",
            }}
          >
            {busy ? t.pack_processing : t.pack_free_btn}
          </button>
        </div>
      )}
      {/* Pack visual */}
      <div
        style={{
          position: "relative",
          width: 220,
          height: 310,
          marginBottom: 28,
          filter: "drop-shadow(0 12px 40px rgba(0,48,135,0.5))",
        }}
      >
        {/* Pack body */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 16,
            background: "linear-gradient(160deg, #003087 0%, #001a50 40%, #0a0020 80%, #1a0040 100%)",
            border: "2px solid rgba(232,185,35,0.6)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 16px 16px",
          }}
        >
          <div className="shine" style={{ opacity: 0.5 }} />

          {/* Top: FIFA WC 2026 */}
          <div style={{ textAlign: "center", zIndex: 1 }}>
            <div
              style={{
                fontSize: 9,
                letterSpacing: 2,
                color: "rgba(255,255,255,0.7)",
                fontFamily: "var(--condensed)",
                fontWeight: 700,
              }}
            >
              FIFA WORLD CUP 2026™
            </div>
            <div
              style={{
                fontFamily: "var(--display)",
                fontSize: 28,
                color: "var(--gold)",
                lineHeight: 1,
                marginTop: 4,
              }}
            >
              FIGUS
            </div>
          </div>

          {/* Center: Hexagon logo / emblem */}
          <div
            style={{
              width: 90,
              height: 90,
              position: "relative",
              zIndex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Hexagon />
            <span style={{ position: "absolute", fontSize: 32 }}>🏆</span>
          </div>

          {/* Bottom info */}
          <div style={{ textAlign: "center", zIndex: 1 }}>
            <div
              style={{
                fontFamily: "var(--condensed)",
                fontWeight: 900,
                fontSize: 16,
                color: "#fff",
                letterSpacing: 0.5,
              }}
            >
              {t.pack_classic}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2, fontFamily: "var(--condensed)" }}>
              {t.pack_7random}
            </div>
          </div>
        </div>

        {/* Tear notch at top */}
        <div
          style={{
            position: "absolute",
            top: -1,
            left: "50%",
            transform: "translateX(-50%)",
            width: 40,
            height: 8,
            background: "#030b18",
            borderRadius: "0 0 6px 6px",
            border: "1px solid rgba(232,185,35,0.3)",
            borderTop: "none",
          }}
        />
      </div>

      {/* Price + button */}
      <div
        style={{
          fontFamily: "var(--condensed)",
          fontSize: 32,
          fontWeight: 900,
          color: "var(--gold)",
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        21 sats
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>
        {t.pack_lightning}
      </div>

      <button
        disabled={busy}
        onClick={onOpen}
        style={{
          background: busy
            ? "var(--panel2)"
            : "linear-gradient(135deg, var(--gold), #d4920a)",
          color: busy ? "var(--muted)" : "#030b18",
          border: "none",
          padding: "14px 36px",
          borderRadius: 12,
          fontWeight: 900,
          fontSize: 16,
          fontFamily: "var(--condensed)",
          letterSpacing: 0.5,
          opacity: busy ? 0.7 : 1,
          transition: "all .2s",
        }}
      >
        {busy ? t.pack_processing : t.pack_open}
      </button>
      {busy && (
        <button
          onClick={onCancel}
          style={{
            marginTop: 8,
            background: "transparent",
            color: "var(--muted)",
            border: "1px solid var(--line)",
            padding: "6px 18px",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "var(--condensed)",
            fontWeight: 700,
          }}
        >
          {t.pack_cancel}
        </button>
      )}

      {/* Demo button */}
      <button
        onClick={onDemo}
        style={{
          marginTop: 10,
          background: "transparent",
          color: "var(--muted)",
          border: "1px solid var(--line)",
          padding: "8px 22px",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 12,
          fontFamily: "var(--condensed)",
          letterSpacing: 0.5,
        }}
      >
        {t.pack_demo}
      </button>

      {/* Odds table */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
          marginTop: 20,
        }}
      >
        {(["legendary", "shiny", "rare", "common"] as const).map((k) => {
          const v = RARITY_META[k];
          return (
            <div
              key={k}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                background: "var(--panel)",
                border: `1px solid ${v.ring}44`,
                borderRadius: 8,
                padding: "6px 12px",
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 900, color: v.ring, fontFamily: "var(--condensed)", letterSpacing: 0.5 }}>
                {v.label.toUpperCase()}
              </span>
              <span style={{ fontSize: 12, fontWeight: 900, color: "var(--ink)", fontFamily: "var(--condensed)" }}>
                {(v.odds * 100).toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PackReveal({
  figus,
  onClose,
  identity,
}: {
  figus: number[];
  onClose: () => void;
  identity?: Identity;
}) {
  const { t } = useLang();
  const [revealed, setRevealed] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const interval = setInterval(
      () => setRevealed((r) => (r < figus.length ? r + 1 : r)),
      480
    );
    return () => clearInterval(interval);
  }, [figus.length]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(3,11,24,.92)",
        backdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 20,
          padding: "28px 24px",
          textAlign: "center",
          maxWidth: 560,
          width: "100%",
        }}
      >
        <div
          style={{
            fontFamily: "var(--condensed)",
            fontWeight: 900,
            fontSize: 10,
            letterSpacing: 2,
            color: "var(--gold)",
            marginBottom: 4,
          }}
        >
          FIFA WORLD CUP 2026™
        </div>
        <h2
          style={{
            fontFamily: "var(--display)",
            margin: "0 0 4px",
            color: "var(--ink)",
            fontSize: 22,
          }}
        >
          {t.pack_opened}
        </h2>
        <p style={{ opacity: 0.5, margin: "0 0 20px", fontSize: 12, fontFamily: "var(--condensed)" }}>
          {t.pack_tap}
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {(() => {
            // Index of the best special card (legendary > shiny) — used to attach the share ref
            const bestIdx = (() => {
              const li = figus.findIndex(n => CATALOG[n]?.rarity === "legendary");
              if (li >= 0) return li;
              return figus.findIndex(n => CATALOG[n]?.rarity === "shiny");
            })();
            return figus.map((num, i) => {
              const f = CATALOG[num];
              const r = RARITY_META[f.rarity];
              const team = TEAMS[f.team];
              const show = i < revealed;
              return (
                <div
                  key={`${num}-${i}`}
                  ref={i === bestIdx ? cardRef : undefined}
                  className={show ? "card-flip" : ""}
                  style={{
                    width: 100,
                    height: 134,
                    borderRadius: 10,
                    border: `2px solid ${show ? r.ring : "var(--line)"}`,
                    overflow: "hidden",
                    position: "relative",
                    boxShadow: show ? `0 0 28px ${r.glow}` : "none",
                    background: show
                      ? `linear-gradient(150deg, ${team.color}, ${team.accent})`
                      : "var(--panel2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {show ? (
                    <div style={{ width: "100%", height: "100%" }}>
                      <StickerFace num={num} />
                    </div>
                  ) : (
                    <div style={{ fontSize: 36, opacity: 0.3 }}>❔</div>
                  )}
                </div>
              );
            });
          })()}
        </div>

        {(() => {
          const allRevealed = revealed >= figus.length;
          const specials = figus.filter(n => {
            const r = CATALOG[n]?.rarity;
            return r === "legendary" || r === "shiny";
          });
          if (!allRevealed || !identity || specials.length === 0) return null;
          const best = specials.find(n => CATALOG[n].rarity === "legendary") ?? specials[0];
          const s = CATALOG[best];
          const rarityLabel = RARITY_META[s.rarity].label.toUpperCase();
          const content = `🎴 ¡Acabo de sacar una ${rarityLabel} en el álbum del Mundial 2026!\n✨ #${best} ${s.name}\n\nArmá tu álbum en ${SITE_URL} ⚽🏆 #FIFAWorldCup2026 #Figus`;
          return (
            <div style={{ marginTop: 16 }}>
              <ShareButton content={content} identity={identity} style={{ width: "100%" }} cardRef={cardRef} />
            </div>
          );
        })()}

        <button
          onClick={onClose}
          style={{
            marginTop: 12,
            background: "linear-gradient(135deg,var(--gold),#d4920a)",
            color: "#030b18",
            border: 0,
            padding: "13px 32px",
            borderRadius: 12,
            fontWeight: 900,
            fontSize: 15,
            fontFamily: "var(--condensed)",
            letterSpacing: 0.5,
          }}
        >
          {t.pack_paste}
        </button>
      </div>
    </div>
  );
}

function Hexagon() {
  return (
    <svg width="90" height="90" viewBox="0 0 90 90" fill="none">
      <polygon
        points="45,4 82,24 82,66 45,86 8,66 8,24"
        stroke="rgba(232,185,35,0.5)"
        strokeWidth="2"
        fill="rgba(232,185,35,0.08)"
      />
      <polygon
        points="45,12 76,29 76,62 45,79 14,62 14,29"
        stroke="rgba(232,185,35,0.25)"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}
