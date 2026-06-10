"use client";

// ─────────────────────────────────────────────────────────────────────────────
// StickerPlacementFX — revelado espectacular de una figurita nueva.
//
// Secuencia por figurita NUEVA:
//   1. REVEAL : la carta aparece en el centro de la pantalla con perspectiva 3D,
//               girando, flotando, con rayos dorados, destellos y brillo según
//               su rareza. Mientras tanto navega el álbum (tab + página) detrás.
//   2. FLY    : la carta vuela desde el centro hasta su casillero exacto en el
//               álbum (FLIP sobre [data-figu-slot]) achicándose hasta calzar.
//   3. BURST  : al aterrizar se "pega" (commit de ownership), con anillo de
//               energía, partículas y flash sobre el casillero.
//
// Si la figurita está REPETIDA: animación corta y anticlimática — carta gris
// con sello "REPETIDA" y cuántas copias ya tenés. No navega ni pega en el
// álbum (va directo al mazo de repetidas).
//
// Todo es local — no emite ningún evento. Click = acelerar la carta actual.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, RARITY_META, TEAMS } from "@/lib/catalog";
import { StickerFace } from "./StickerCard";

const CARD_W = 240;                 // ancho de la carta durante el reveal
const CARD_H = CARD_W * (4 / 3);    // misma proporción 3/4 que los casilleros
const REVEAL_MS = 2600;
const FLY_MS = 950;
const BURST_MS = 750;
const DUPE_MS = 1500;               // repetida: mucho más corto, sin fanfarria

// Carta repetida: más chica y apagada
const DUPE_W = 170;
const DUPE_H = DUPE_W * (4 / 3);

type Phase = "reveal" | "fly" | "burst" | "dupe";

/** Resultado de cada figurita de la tirada, para el modal resumen. */
export interface RevealResult {
  num: number;
  isNew: boolean;
}

export function StickerPlacementFX({
  queue,
  ownership,
  onNavigate,
  onPlace,
  onPlaceMany,
  onFinish,
}: {
  /** Números de figurita pendientes de revelar (puede crecer mientras corre). */
  queue: number[];
  /** Ownership actual — para detectar repetidas (se actualiza con cada commit). */
  ownership: Record<number, number>;
  /** Navega la app al álbum y a la página que contiene la figurita. */
  onNavigate: (num: number) => void;
  /** Pega UNA figurita en el álbum (commit local) — se llama al aterrizar. */
  onPlace: (num: number) => void;
  /** Pega varias de una (para "saltar todo"). */
  onPlaceMany: (nums: number[]) => void;
  /** La cola terminó — recibe el resultado de cada figurita (nueva/repetida). */
  onFinish: (results: RevealResult[]) => void;
}) {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>("reveal");
  const [slotRect, setSlotRect] = useState<DOMRect | null>(null);
  // Copias que ya tenía cuando salió repetida (para mostrar "ya tenés ×N")
  const [dupeHad, setDupeHad] = useState(0);

  const queueRef = useRef(queue);
  queueRef.current = queue;
  const ownershipRef = useRef(ownership);
  ownershipRef.current = ownership;
  const committed = useRef<Set<number>>(new Set()); // índices ya pegados
  const skipReveal = useRef<(() => void) | null>(null);
  const flyEl = useRef<HTMLDivElement | null>(null);
  const finished = useRef(false);

  const num = i < queue.length ? queue[i] : null;
  const meta = num !== null ? CATALOG[num] : null;
  const rar = meta ? RARITY_META[meta.rarity] : null;
  const team = meta ? TEAMS[meta.team] : null;

  // Resultado por índice de la cola (nueva/repetida), para el modal resumen.
  const results = useRef<Map<number, RevealResult>>(new Map());

  function commitIndex(j: number, isNew: boolean) {
    if (committed.current.has(j)) return;
    committed.current.add(j);
    results.current.set(j, { num: queueRef.current[j], isNew });
    onPlace(queueRef.current[j]);
  }

  function finish() {
    if (finished.current) return;
    finished.current = true;
    const out = Array.from(results.current.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, r]) => r);
    onFinish(out);
  }

  function skipAll() {
    const q = queueRef.current;
    const rest: number[] = [];
    // Simular los commits restantes sobre el ownership vivo para decidir
    // nueva/repetida de las que no llegaron a animarse.
    const counts: Record<number, number> = { ...ownershipRef.current };
    for (let j = i; j < q.length; j++) {
      if (committed.current.has(j)) continue;
      const n = q[j];
      const isNew = (counts[n] ?? 0) === 0;
      counts[n] = (counts[n] ?? 0) + 1;
      committed.current.add(j);
      results.current.set(j, { num: n, isNew });
      rest.push(n);
    }
    if (rest.length) onPlaceMany(rest);
    finish();
  }

  // ── Secuencia por carta ──────────────────────────────────────────────────
  useEffect(() => {
    if (i >= queueRef.current.length) { finish(); return; }
    let cancelled = false;
    const n = queueRef.current[i];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sleep = (ms: number) =>
      new Promise<void>((r) => { timers.push(setTimeout(r, ms)); });

    // ¿Repetida? — leída del ownership vivo (los commits previos de esta
    // misma cola ya cuentan, así la segunda copia en una tirada sale "repe").
    const had = ownershipRef.current[n] ?? 0;
    const isDupe = had > 0;

    setSlotRect(null);
    setDupeHad(had);
    setPhase(isDupe ? "dupe" : "reveal");
    if (!isDupe) onNavigate(n); // el álbum se prepara detrás del overlay

    (async () => {
      if (isDupe) {
        // REPETIDA — beat corto y anticlimático, sin navegación ni pegada.
        await Promise.race([
          sleep(DUPE_MS),
          new Promise<void>((r) => { skipReveal.current = r; }),
        ]);
        skipReveal.current = null;
        if (cancelled) return;
        commitIndex(i, false); // va al mazo de repetidas igual
        setI((x) => x + 1);
        return;
      }

      // 1. REVEAL — espera fija o hasta que el usuario haga click
      await Promise.race([
        sleep(REVEAL_MS),
        new Promise<void>((r) => { skipReveal.current = r; }),
      ]);
      skipReveal.current = null;
      if (cancelled) return;

      // 2. Buscar el casillero destino (el álbum puede estar montándose)
      let el: HTMLElement | null = null;
      for (let tries = 0; tries < 30 && !cancelled; tries++) {
        el = document.querySelector<HTMLElement>(`[data-figu-slot="${n}"]`);
        if (el && el.getBoundingClientRect().width > 0) break;
        await sleep(60);
      }
      if (cancelled) return;

      let rect: DOMRect | null = null;
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "auto" });
        await sleep(80);
        rect = el.getBoundingClientRect();
      }

      if (!rect || rect.width === 0) {
        // No se encontró el casillero — pegar igual, sin vuelo.
        commitIndex(i, true);
        if (!cancelled) setI((x) => x + 1);
        return;
      }

      // 3. FLY — FLIP desde el centro hasta el casillero
      setSlotRect(rect);
      setPhase("fly");
      await sleep(FLY_MS);
      if (cancelled) return;

      // 4. BURST — pegar y explotar
      commitIndex(i, true);
      setPhase("burst");
      await sleep(BURST_MS);
      if (cancelled) return;
      setI((x) => x + 1);
    })();

    return () => { cancelled = true; timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // ── Animación de vuelo: posicionar en destino y soltar el transform ──────
  useEffect(() => {
    if (phase !== "fly" || !slotRect || !flyEl.current) return;
    const el = flyEl.current;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const rcx = slotRect.left + slotRect.width / 2;
    const rcy = slotRect.top + slotRect.height / 2;
    const s = CARD_W / slotRect.width;
    el.style.transition = "none";
    el.style.transform = `translate(${cx - rcx}px, ${cy - rcy}px) scale(${s}) rotate(5deg)`;
    // doble rAF para que el transform inicial se pinte antes de transicionar
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = `transform ${FLY_MS - 60}ms cubic-bezier(.55,.06,.18,1), box-shadow ${FLY_MS - 60}ms ease`;
      el.style.transform = "translate(0px, 0px) scale(1) rotate(0deg)";
      el.style.boxShadow = `0 0 14px ${rar?.glow ?? "rgba(232,185,35,.6)"}`;
    }));
  }, [phase, slotRect, rar]);

  // Destellos del reveal — posiciones aleatorias fijas por carta
  const sparkles = useMemo(
    () =>
      Array.from({ length: 18 }, () => ({
        angle: Math.random() * Math.PI * 2,
        dist: 130 + Math.random() * 140,
        size: 8 + Math.random() * 14,
        delay: Math.random() * 1.4,
        dur: 1.1 + Math.random() * 0.9,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i]
  );

  // Partículas del aterrizaje
  const burstBits = useMemo(
    () =>
      Array.from({ length: 14 }, (_, k) => {
        const a = (k / 14) * Math.PI * 2 + Math.random() * 0.5;
        const d = 36 + Math.random() * 64;
        return {
          dx: Math.cos(a) * d,
          dy: Math.sin(a) * d,
          size: 3 + Math.random() * 5,
          gold: k % 3 !== 0,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i, phase === "burst"]
  );

  if (num === null || meta === null || rar === null) return null;

  const glow = rar.glow;
  const ring = rar.ring;
  const total = queue.length;
  const backdrop =
    phase === "reveal" ? "rgba(2,8,20,.88)"
    : phase === "dupe" ? "rgba(2,8,20,.82)"
    : phase === "fly" ? "rgba(2,8,20,.3)"
    : "rgba(2,8,20,.12)";

  const slotCx = slotRect ? slotRect.left + slotRect.width / 2 : 0;
  const slotCy = slotRect ? slotRect.top + slotRect.height / 2 : 0;

  return (
    <div
      onClick={() => skipReveal.current?.()}
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        overflow: "hidden",
        cursor: phase === "reveal" || phase === "dupe" ? "pointer" : "default",
      }}
    >
      <style>{`
        @keyframes fxSpinIn {
          0%   { transform: rotateY(900deg) scale(.04); opacity: 0; }
          35%  { opacity: 1; }
          72%  { transform: rotateY(360deg) scale(1.14); }
          100% { transform: rotateY(360deg) scale(1); }
        }
        @keyframes fxFloat {
          0%, 100% { transform: translateY(-7px) rotateX(5deg) rotateY(-8deg); }
          50%      { transform: translateY(7px)  rotateX(-5deg) rotateY(8deg); }
        }
        @keyframes fxGlowPulse {
          0%, 100% { box-shadow: 0 0 30px var(--fxglow), 0 0 80px var(--fxglow), 0 0 150px var(--fxglow2); }
          50%      { box-shadow: 0 0 55px var(--fxglow), 0 0 130px var(--fxglow), 0 0 200px var(--fxglow2); }
        }
        @keyframes fxShine {
          0%       { transform: translateX(-220%) skewX(-18deg); }
          55%,100% { transform: translateX(320%)  skewX(-18deg); }
        }
        @keyframes fxRays { to { transform: rotate(360deg); } }
        @keyframes fxHalo {
          0%, 100% { opacity: .55; transform: scale(1); }
          50%      { opacity: .9;  transform: scale(1.12); }
        }
        @keyframes fxTwinkle {
          0%, 100% { opacity: 0; transform: scale(.2) rotate(0deg); }
          50%      { opacity: 1; transform: scale(1.2) rotate(180deg); }
        }
        @keyframes fxTitleIn {
          0%   { opacity: 0; transform: translateY(18px) scale(.85); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fxRing {
          0%   { transform: translate(-50%,-50%) scale(.3); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(2.1); opacity: 0; }
        }
        @keyframes fxRing2 {
          0%   { transform: translate(-50%,-50%) scale(.2); opacity: .9; }
          100% { transform: translate(-50%,-50%) scale(1.4); opacity: 0; }
        }
        @keyframes fxFlash {
          0%   { opacity: .95; transform: translate(-50%,-50%) scale(.5); }
          100% { opacity: 0;   transform: translate(-50%,-50%) scale(1.6); }
        }
        @keyframes fxBit {
          0%   { transform: translate(-50%,-50%) scale(1); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(.15); opacity: 0; }
        }
        @keyframes fxDupeDrop {
          0%   { transform: translateY(-46px) rotate(-1deg) scale(.92); opacity: 0; }
          60%  { transform: translateY(6px)  rotate(-3deg) scale(1); opacity: 1; }
          100% { transform: translateY(0)    rotate(-3deg) scale(1); }
        }
        @keyframes fxStamp {
          0%   { transform: rotate(-14deg) scale(2.4); opacity: 0; }
          65%  { transform: rotate(-14deg) scale(.94); opacity: 1; }
          100% { transform: rotate(-14deg) scale(1); opacity: 1; }
        }
        @keyframes fxDupeText {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Backdrop */}
      <div style={{
        position: "absolute", inset: 0,
        background: backdrop,
        transition: "background .45s ease",
        backdropFilter: phase === "reveal" ? "blur(3px)" : "none",
      }} />

      {/* ════ FASE 1 · REVEAL ════ */}
      {phase === "reveal" && (
        <>
          {/* Rayos giratorios */}
          <div style={{
            position: "absolute", left: "50%", top: "50%",
            width: 1100, height: 1100,
            marginLeft: -550, marginTop: -550,
            background: `repeating-conic-gradient(from 0deg, ${glow} 0deg 8deg, transparent 8deg 26deg)`,
            borderRadius: "50%",
            animation: "fxRays 14s linear infinite",
            WebkitMaskImage: "radial-gradient(circle, black 0%, transparent 62%)",
            maskImage: "radial-gradient(circle, black 0%, transparent 62%)",
            opacity: 0.5,
          }} />

          {/* Halo central */}
          <div style={{
            position: "absolute", left: "50%", top: "50%",
            width: 520, height: 520,
            marginLeft: -260, marginTop: -260,
            background: `radial-gradient(circle, ${glow} 0%, transparent 65%)`,
            borderRadius: "50%",
            animation: "fxHalo 2.2s ease-in-out infinite",
            filter: "blur(6px)",
          }} />

          {/* Destellos */}
          {sparkles.map((sp, k) => (
            <div key={k} style={{
              position: "absolute",
              left: `calc(50% + ${Math.cos(sp.angle) * sp.dist}px)`,
              top: `calc(50% + ${Math.sin(sp.angle) * sp.dist}px)`,
              width: sp.size, height: sp.size,
              animation: `fxTwinkle ${sp.dur}s ease-in-out ${sp.delay}s infinite`,
              color: ring,
              fontSize: sp.size,
              lineHeight: 1,
              textShadow: `0 0 8px ${glow}, 0 0 16px ${glow}`,
            }}>✦</div>
          ))}

          {/* Título */}
          <div style={{
            position: "absolute", left: 0, right: 0,
            top: `calc(50% - ${CARD_H / 2 + 86}px)`,
            textAlign: "center",
            animation: "fxTitleIn .5s cubic-bezier(.2,1.4,.4,1) .25s both",
            pointerEvents: "none",
          }}>
            <div style={{
              fontFamily: "var(--display)", fontSize: 30, lineHeight: 1,
              color: "var(--gold)",
              textShadow: "0 0 20px rgba(232,185,35,.7), 0 2px 0 rgba(0,0,0,.5)",
              letterSpacing: 2,
            }}>
              ✨ ¡NUEVA FIGU! ✨
            </div>
            <div style={{
              marginTop: 8,
              display: "inline-block",
              fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 11,
              letterSpacing: 2, color: "#030b18",
              background: ring,
              borderRadius: 99, padding: "4px 14px",
              boxShadow: `0 0 18px ${glow}`,
              textTransform: "uppercase",
            }}>
              {rar.label}
            </div>
          </div>

          {/* Carta 3D */}
          <div style={{
            position: "absolute", left: "50%", top: "50%",
            width: CARD_W, height: CARD_H,
            marginLeft: -CARD_W / 2, marginTop: -CARD_H / 2,
            perspective: 1300,
            pointerEvents: "none",
          }}>
            <div style={{
              width: "100%", height: "100%",
              transformStyle: "preserve-3d",
              animation: "fxSpinIn 1.5s cubic-bezier(.25,.9,.3,1) both",
            }}>
              <div style={{
                width: "100%", height: "100%",
                transformStyle: "preserve-3d",
                animation: "fxFloat 3.2s ease-in-out 1.5s infinite",
              }}>
                <div style={{
                  width: "100%", height: "100%",
                  borderRadius: 14,
                  border: `3px solid ${ring}`,
                  overflow: "hidden",
                  position: "relative",
                  animation: "fxGlowPulse 1.8s ease-in-out infinite",
                  ["--fxglow" as string]: glow,
                  ["--fxglow2" as string]: "rgba(232,185,35,.25)",
                  background: "#0a1228",
                }}>
                  <StickerFace num={num} />
                  {/* Barrido de brillo */}
                  <div style={{
                    position: "absolute", top: -20, bottom: -20, width: "38%",
                    background: "linear-gradient(105deg, transparent 0%, rgba(255,255,255,.6) 50%, transparent 100%)",
                    animation: "fxShine 1.7s ease-in-out .6s infinite",
                    pointerEvents: "none",
                  }} />
                </div>
              </div>
            </div>
          </div>

          {/* Nombre */}
          <div style={{
            position: "absolute", left: 0, right: 0,
            top: `calc(50% + ${CARD_H / 2 + 26}px)`,
            textAlign: "center",
            animation: "fxTitleIn .5s cubic-bezier(.2,1.4,.4,1) .45s both",
            pointerEvents: "none",
          }}>
            <div style={{
              fontFamily: "var(--condensed)", fontWeight: 900,
              fontSize: 20, color: "#fff", letterSpacing: 1,
              textShadow: "0 2px 12px rgba(0,0,0,.8)",
            }}>
              #{num} · {meta.name.toUpperCase()}
            </div>
            {team && (
              <div style={{
                fontSize: 12, color: "var(--muted)",
                fontFamily: "var(--condensed)", fontWeight: 700,
                letterSpacing: 1.5, marginTop: 3,
              }}>
                {team.name.toUpperCase()}
              </div>
            )}
            <div style={{
              marginTop: 12, fontSize: 10, color: "rgba(255,255,255,.45)",
              fontFamily: "var(--condensed)", letterSpacing: 1,
            }}>
              CLICK PARA PEGARLA EN EL ÁLBUM →
            </div>
          </div>
        </>
      )}

      {/* ════ REPETIDA · corto y sin gloria ════ */}
      {phase === "dupe" && (
        <>
          {/* Carta apagada, caída seca, sin brillos */}
          <div style={{
            position: "absolute", left: "50%", top: "50%",
            width: DUPE_W, height: DUPE_H,
            marginLeft: -DUPE_W / 2, marginTop: -DUPE_H / 2 - 14,
            animation: "fxDupeDrop .42s cubic-bezier(.3,1.2,.5,1) both",
            pointerEvents: "none",
          }}>
            <div style={{
              width: "100%", height: "100%",
              borderRadius: 10,
              border: "2px solid #6b7280",
              overflow: "hidden",
              position: "relative",
              background: "#0a1228",
              filter: "grayscale(.85) brightness(.78)",
              boxShadow: "0 8px 24px rgba(0,0,0,.5)",
            }}>
              <StickerFace num={num} compact />
            </div>
            {/* Sello REPETIDA — chico, abajo de la carta */}
            <div style={{
              position: "absolute", left: "50%", top: "78%",
              marginLeft: -57, marginTop: -12,
              width: 114, textAlign: "center",
              border: "2px solid #ef4444",
              borderRadius: 5,
              color: "#ef4444",
              background: "rgba(20,6,8,.55)",
              fontFamily: "var(--condensed)", fontWeight: 900,
              fontSize: 13, letterSpacing: 2.5, padding: "3px 0",
              textShadow: "0 1px 0 rgba(0,0,0,.6)",
              animation: "fxStamp .3s ease-out .28s both",
            }}>
              REPETIDA
            </div>
          </div>

          {/* Cuántas copias ya tenés */}
          <div style={{
            position: "absolute", left: 0, right: 0,
            top: `calc(50% + ${DUPE_H / 2 + 18}px)`,
            textAlign: "center",
            animation: "fxDupeText .3s ease-out .4s both",
            pointerEvents: "none",
          }}>
            <div style={{
              display: "inline-block",
              fontFamily: "var(--condensed)", fontWeight: 900,
              fontSize: 13, letterSpacing: 1.5,
              color: "#cbd5e1",
              background: "rgba(107,114,128,.22)",
              border: "1px solid rgba(148,163,184,.4)",
              borderRadius: 99, padding: "6px 16px",
            }}>
              #{num} · YA LA TENÉS ×{dupeHad}
            </div>
            <div style={{
              marginTop: 8, fontSize: 11, color: "var(--muted)",
              fontFamily: "var(--condensed)", fontWeight: 700, letterSpacing: 1,
            }}>
              AHORA ×{dupeHad + 1} · VENDELA EN EL MERCADITO
            </div>
          </div>
        </>
      )}

      {/* ════ FASE 2 · FLY ════ */}
      {phase === "fly" && slotRect && (
        <div
          ref={flyEl}
          style={{
            position: "fixed",
            left: slotRect.left, top: slotRect.top,
            width: slotRect.width, height: slotRect.height,
            borderRadius: 8,
            border: `2px solid ${ring}`,
            overflow: "hidden",
            zIndex: 81,
            boxShadow: `0 0 45px ${glow}, 0 0 110px ${glow}`,
            background: "#0a1228",
            willChange: "transform",
          }}
        >
          <StickerFace num={num} compact />
        </div>
      )}

      {/* ════ FASE 3 · BURST ════ */}
      {phase === "burst" && slotRect && (
        <>
          {/* Flash */}
          <div style={{
            position: "fixed", left: slotCx, top: slotCy,
            width: slotRect.width * 1.4, height: slotRect.height * 1.4,
            background: `radial-gradient(circle, rgba(255,255,255,.95) 0%, ${glow} 45%, transparent 70%)`,
            borderRadius: "50%",
            animation: "fxFlash .4s ease-out both",
            pointerEvents: "none",
          }} />
          {/* Anillos de energía */}
          <div style={{
            position: "fixed", left: slotCx, top: slotCy,
            width: slotRect.width * 1.6, height: slotRect.width * 1.6,
            border: `3px solid ${ring}`,
            borderRadius: "50%",
            animation: "fxRing .65s cubic-bezier(.2,.7,.3,1) both",
            boxShadow: `0 0 24px ${glow}`,
            pointerEvents: "none",
          }} />
          <div style={{
            position: "fixed", left: slotCx, top: slotCy,
            width: slotRect.width * 1.6, height: slotRect.width * 1.6,
            border: `2px solid rgba(255,255,255,.9)`,
            borderRadius: "50%",
            animation: "fxRing2 .55s ease-out .08s both",
            pointerEvents: "none",
          }} />
          {/* Partículas */}
          {burstBits.map((b, k) => (
            <div key={k} style={{
              position: "fixed", left: slotCx, top: slotCy,
              width: b.size, height: b.size,
              borderRadius: "50%",
              background: b.gold ? ring : "#fff",
              boxShadow: `0 0 8px ${glow}`,
              ["--dx" as string]: `${b.dx}px`,
              ["--dy" as string]: `${b.dy}px`,
              animation: `fxBit ${0.5 + (k % 4) * 0.08}s ease-out both`,
              pointerEvents: "none",
            }} />
          ))}
        </>
      )}

      {/* ── HUD: progreso + saltar ── */}
      {total > 1 && (
        <div style={{
          position: "fixed", top: 14, left: 0, right: 0,
          display: "flex", justifyContent: "center", gap: 10,
          pointerEvents: "none",
        }}>
          <div style={{
            background: "rgba(3,11,24,.85)",
            border: "1px solid var(--line)",
            borderRadius: 99, padding: "6px 16px",
            fontFamily: "var(--condensed)", fontWeight: 900,
            fontSize: 11, letterSpacing: 1.5, color: "var(--gold)",
          }}>
            FIGU {Math.min(i + 1, total)} / {total}
          </div>
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); skipAll(); }}
        style={{
          position: "fixed", bottom: 46, left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(3,11,24,.85)",
          border: "1px solid var(--line)",
          color: "var(--muted)",
          borderRadius: 99, padding: "8px 20px",
          fontFamily: "var(--condensed)", fontWeight: 900,
          fontSize: 11, letterSpacing: 1, cursor: "pointer",
        }}
      >
        {total > 1 ? "SALTAR TODO ⏭" : "SALTAR ⏭"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RevealSummaryModal — resumen del lote al terminar la cola de revelados.
// Muestra todas las figuritas incluidas, con las NUEVAS destacadas primero
// (a todo color, borde de rareza) y las repetidas apagadas en gris.
// ─────────────────────────────────────────────────────────────────────────────

export function RevealSummaryModal({
  results,
  ownership,
  onClose,
  onBuyMore,
}: {
  results: RevealResult[];
  /** Ownership final (post-commits) — para mostrar ×N en las repetidas. */
  ownership: Record<number, number>;
  onClose: () => void;
  /** CTA principal: cierra y lleva a la pestaña de sobres. */
  onBuyMore?: () => void;
}) {
  const news = results.filter((r) => r.isNew);
  const repes = results.filter((r) => !r.isNew);
  const sorted = [...news, ...repes];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 85,
        background: "rgba(2,8,20,.82)",
        backdropFilter: "blur(4px)",
        display: "grid", placeItems: "center",
        padding: 20,
      }}
    >
      <style>{`
        @keyframes sumCardIn {
          0%   { opacity: 0; transform: translateY(16px) scale(.6) rotate(-5deg); }
          70%  { transform: translateY(-2px) scale(1.06) rotate(1deg); }
          100% { opacity: 1; transform: translateY(0) scale(1) rotate(0); }
        }
      `}</style>
      <div
        className="pop-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--gold)",
          borderRadius: 16,
          padding: "20px 18px",
          width: "min(460px, 94vw)",
          maxHeight: "84vh",
          display: "flex", flexDirection: "column", gap: 14,
          boxShadow: "0 18px 60px rgba(0,0,0,.6)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontFamily: "var(--display)", fontSize: 22,
            color: "var(--gold)", letterSpacing: 1, lineHeight: 1,
          }}>
            🎴 RESUMEN DEL LOTE
          </div>
          <div style={{
            marginTop: 8, display: "flex", justifyContent: "center", gap: 8,
            fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 11,
            letterSpacing: 1,
          }}>
            <span style={{
              color: "#030b18", background: "var(--gold)",
              borderRadius: 99, padding: "3px 12px",
            }}>
              ✨ {news.length} NUEVA{news.length === 1 ? "" : "S"}
            </span>
            {repes.length > 0 && (
              <span style={{
                color: "#cbd5e1", background: "rgba(107,114,128,.25)",
                border: "1px solid rgba(148,163,184,.35)",
                borderRadius: 99, padding: "3px 12px",
              }}>
                😅 {repes.length} REPETIDA{repes.length === 1 ? "" : "S"}
              </span>
            )}
          </div>
        </div>

        {/* Grid de figuritas */}
        <div style={{
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(86px, 1fr))",
          gap: 8,
          padding: 2,
        }}>
          {sorted.map((r, k) => {
            const rar = RARITY_META[CATALOG[r.num].rarity];
            const copies = ownership[r.num] ?? 0;
            return (
              <div
                key={k}
                style={{
                  position: "relative",
                  // Entrada en cascada — nuevas y repetidas animan por igual
                  animation: "sumCardIn .38s cubic-bezier(.2,1.4,.4,1) both",
                  animationDelay: `${Math.min(k * 70, 1400)}ms`,
                }}
              >
                <div style={{
                  aspectRatio: "3/4",
                  borderRadius: 7,
                  overflow: "hidden",
                  border: r.isNew ? `2px solid ${rar.ring}` : "2px solid #4b5563",
                  boxShadow: r.isNew ? `0 3px 14px ${rar.glow}` : "none",
                  filter: r.isNew ? "none" : "grayscale(.85) brightness(.7)",
                  background: "#0a1228",
                }}>
                  <StickerFace num={r.num} compact />
                </div>
                {/* Badge nueva/repetida (con total de copias) */}
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  textAlign: "center",
                  fontFamily: "var(--condensed)", fontWeight: 900,
                  fontSize: 8, letterSpacing: 1, padding: "2.5px 0",
                  borderRadius: "0 0 5px 5px",
                  background: r.isNew ? "var(--gold)" : "rgba(75,85,99,.92)",
                  color: r.isNew ? "#030b18" : "#cbd5e1",
                }}>
                  {r.isNew ? "✨ NUEVA" : `REPETIDA ×${copies}`}
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA: comprar más sobres */}
        <button
          onClick={onBuyMore ?? onClose}
          style={{
            background: "linear-gradient(135deg, var(--gold), #c8890a)",
            color: "#030b18", border: "none",
            padding: "11px 0", borderRadius: 10,
            fontSize: 13, fontWeight: 900,
            fontFamily: "var(--condensed)", letterSpacing: 1,
            cursor: "pointer",
          }}
        >
          ⚡ COMPRAR MÁS SOBRES
        </button>
      </div>
    </div>
  );
}
