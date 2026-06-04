"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventTemplate } from "nostr-tools";
import { useIdentity } from "@/hooks/useIdentity";
import { useGameState } from "@/hooks/useGameState";
import { Connect } from "@/components/Connect";
import { Album } from "@/components/Album";
import { Packs, PackReveal } from "@/components/Packs";
import { Market } from "@/components/Market";
import { MyStickers } from "@/components/MyStickers";
import { Fixture } from "@/components/Fixture";
import { PenaltyGame } from "@/components/PenaltyGame";
import { Leaderboard } from "@/components/Leaderboard";
import { PenaltyMatchLobby, PenaltyMatchView } from "@/components/PenaltyMatch";
import type { PenaltyMatch } from "@/lib/penalty";
import { ALL_NUMBERS, rollSticker } from "@/lib/catalog";
import { ISSUER_PUBKEY, KIND, ALBUM_ID, addr } from "@/lib/constants";
import { zap } from "@/lib/zap";
import { subscribeOne } from "@/lib/pool";
import { signEvent } from "@/lib/identity";
import { getPool, getRelays } from "@/lib/pool";
import { getNwcString, nwcPay } from "@/lib/nwc";
import { InvoiceModal } from "@/components/InvoiceModal";
import { SettingsModal } from "@/components/SettingsModal";
import { LangProvider, useLang } from "@/contexts/LangContext";
import type { Listing, Page } from "@/lib/types";

// Lightning Address del issuer (para zaps de apertura de sobre y premios).
// En producción viene de la config; acá la dejamos visible para la demo.
const ISSUER_LN_ADDRESS =
  process.env.NEXT_PUBLIC_ISSUER_LN_ADDRESS || "issuer@getalby.com";

type Tab = "album" | "packs" | "market" | "fixture" | "game";

export default function Home() {
  return <LangProvider><HomeInner /></LangProvider>;
}

function HomeInner() {
  const { t, lang, toggle: toggleLang } = useLang();
  const { identity, nip07Available, connectNip07, connectLocal, connectNip46QR, connectNip46Bunker, logout, importNsec } =
    useIdentity();
  const pubkey = identity?.pubkey ?? null;
  const { ownership, listings, settlements, owned, dupes, loading, refresh, hasClaimedFreePack, claimPack } =
    useGameState(pubkey);

  const [tab, setTab] = useState<Tab>("album");
  const [toast, setToast] = useState<string | null>(null);
  const [packResult, setPackResult] = useState<number[] | null>(null);
  const [penaltyPackPending, setPenaltyPackPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeMatch, setActiveMatch] = useState<PenaltyMatch | null>(null);

  useEffect(() => {
    if (packResult) setPenaltyPackPending(false);
  }, [packResult]);

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  const configured = Boolean(ISSUER_PUBKEY);

  // --- sobre de regalo: publica prueba en Nostr y espera GRANT del issuer ---
  function openFreePack() {
    if (!identity) return notify("Conectate primero");
    setBusy(true);

    const since = Math.floor(Date.now() / 1000);
    let grantReceived = false;
    let unsubGrant: (() => void) | null = null;
    let pollIv: ReturnType<typeof setInterval> | null = null;
    let freeTimeout: ReturnType<typeof setTimeout> | null = null;

    function handleGrant(ev: { created_at: number; tags: string[][] }) {
      if (grantReceived) return;
      if (ev.created_at < since - 5) return;
      const nums = ev.tags
        .filter((t) => t[0] === "sticker")
        .map((t) => Number(t[1].split(":")[1]))
        .filter((n) => n > 0);
      if (!nums.length) return;
      grantReceived = true;
      claimPack(nums);
      setPackResult(nums);
      refresh();
      unsubGrant?.();
      if (pollIv) clearInterval(pollIv);
      if (freeTimeout) clearTimeout(freeTimeout);
      setBusy(false);
    }

    // 1. Suscripción en vivo esperando el GRANT del issuer (se setea antes del await
    //    para que el fallback funcione aunque el signing de Amber no responda)
    unsubGrant = subscribeOne(
      { kinds: [KIND.GRANT], authors: [ISSUER_PUBKEY], "#p": [identity.pubkey], since },
      handleGrant
    );

    const pubkeyLocal = identity.pubkey;
    pollIv = setInterval(async () => {
      if (grantReceived) return;
      const { list: listEvs } = await import("@/lib/pool");
      const evs = await listEvs([{
        kinds: [KIND.GRANT], authors: [ISSUER_PUBKEY],
        "#p": [pubkeyLocal], since: since - 5, limit: 1,
      }]);
      if (evs.length) handleGrant(evs[0]);
    }, 5000);

    // 2. Fallback: si el issuer no responde en 15s, dar figus localmente
    freeTimeout = setTimeout(() => {
      if (!grantReceived) {
        unsubGrant?.();
        if (pollIv) clearInterval(pollIv);
        const nums = Array.from({ length: 7 }, () => rollSticker());
        claimPack(nums);
        setPackResult(nums);
        setBusy(false);
        notify("🎁 Sobre de regalo abierto · el issuer confirmará las figuritas pronto");
      }
    }, 15000);

    // 3. Publicar prueba de claim (fire-and-forget: no bloqueamos el flujo
    //    porque signEvent con Amber puede necesitar interacción del usuario)
    const claimTemplate: EventTemplate = {
      kind: KIND.FREE_PACK_CLAIM,
      created_at: since,
      content: "",
      tags: [
        ["d", `free-pack:${ALBUM_ID}`],
        ["a", addr(KIND.ALBUM, ISSUER_PUBKEY, ALBUM_ID)],
        ["figus-action", "free-pack-claim"],
      ],
    };
    signEvent(claimTemplate, identity.mode)
      .then(claimEv => Promise.any(getPool().publish(getRelays(), claimEv)))
      .catch(() => {});
  }

  // --- abrir sobre demo: genera figus localmente sin Lightning (para testear) ---
  function openPackDemo() {
    const nums = Array.from({ length: 7 }, () => rollSticker());
    setPackResult(nums);
  }

  // --- abrir sobre: zap al issuer ---
  async function openPack() {
    if (!identity) return notify("Conectate primero");
    setBusy(true);

    const since = Math.floor(Date.now() / 1000);
    let grantReceived = false;
    let unsubGrant: (() => void) | null = null;
    let pollIv: ReturnType<typeof setInterval> | null = null;
    let grantTimeout: ReturnType<typeof setTimeout> | null = null;

    function handleGrant(ev: { created_at: number; tags: string[][] }) {
      if (grantReceived) return;
      // Ignorar grants anteriores al momento en que se clickeó
      if (ev.created_at < since - 5) return;
      const nums = ev.tags
        .filter((t) => t[0] === "sticker")
        .map((t) => Number(t[1].split(":")[1]))
        .filter((n) => n > 0);
      if (!nums.length) return;
      grantReceived = true;
      setInvoice(null);
      setPackResult(nums);
      refresh();
      unsubGrant?.();
      if (pollIv) clearInterval(pollIv);
      if (grantTimeout) clearTimeout(grantTimeout);
    }

    // Suscripción en vivo (real-time)
    unsubGrant = subscribeOne(
      { kinds: [KIND.GRANT], authors: [ISSUER_PUBKEY], "#p": [identity.pubkey], since },
      handleGrant
    );

    // Polling fallback cada 5s — por si el relay no entregó el evento en vivo
    const pubkey = identity.pubkey;
    pollIv = setInterval(async () => {
      if (grantReceived) return;
      const { list } = await import("@/lib/pool");
      const evs = await list([{
        kinds: [KIND.GRANT],
        authors: [ISSUER_PUBKEY],
        "#p": [pubkey],
        since: since - 5,
        limit: 5,
      }]);
      const latest = evs.sort((a, b) => b.created_at - a.created_at)[0];
      if (latest) handleGrant(latest);
    }, 5000);

    grantTimeout = setTimeout(() => {
      if (!grantReceived) {
        unsubGrant?.();
        if (pollIv) clearInterval(pollIv);
        notify("⚠️ No llegaron las figus en 90s. Verificá que el issuer esté corriendo.");
      }
    }, 90000);

    try {
      const res = await zap(
        {
          amountSats: 21,
          target: { pubkey: ISSUER_PUBKEY, lnurlOrAddress: ISSUER_LN_ADDRESS },
          extraTags: [
            ["a", addr(KIND.PACK, ISSUER_PUBKEY, "pack-basico")],
            ["figus-action", "open-pack"],
          ],
          comment: "Abriendo sobre clásico",
          signerMode: identity.mode,
        },
        () => {
          setInvoice(null);
          notify("⚡ Pago confirmado — esperando figus del issuer…");
        }
      );
      if (!res.paid) {
        const nwcStr = getNwcString();
        if (nwcStr) {
          // Intentar NWC con timeout de 12s — si cuelga, mostrar factura
          const nwcTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("NWC timeout")), 12000)
          );
          try {
            await Promise.race([nwcPay(res.invoice, nwcStr), nwcTimeout]);
            notify("⚡ Solicitud enviada a tu wallet NWC — esperando figus…");
          } catch {
            setInvoice(res.invoice);
          }
        } else {
          setInvoice(res.invoice);
        }
      }
    } catch (e: any) {
      grantReceived = true;
      if (grantTimeout) clearTimeout(grantTimeout);
      if (pollIv) clearInterval(pollIv);
      unsubGrant?.();
      notify("⚠️ " + (e.message || "Error al abrir el sobre"));
    } finally {
      setBusy(false);
    }
  }

  // --- publicar resultado de penal en Nostr ---
  async function publishPenalty(result: "goal" | "save", zone: number, keeper: number, totalGoals: number) {
    if (!identity) return;
    const today = new Date().toISOString().slice(0, 10);
    const template: EventTemplate = {
      kind: KIND.PENALTY_PLAY,
      created_at: Math.floor(Date.now() / 1000),
      content: result === "goal" ? `⚽ Convertí un penal en Figus Mundial 2026` : `🧤 Me atajaron el penal en Figus Mundial 2026`,
      tags: [
        ["d", `penalty:${today}`],
        ["result", result],
        ["zone", String(zone)],
        ["keeper", String(keeper)],
        ["goals", String(totalGoals)],
        ["a", addr(KIND.ALBUM, ISSUER_PUBKEY, ALBUM_ID)],
      ],
    };
    try {
      const ev = await signEvent(template, identity.mode);
      await Promise.any(getPool().publish(getRelays(), ev));
    } catch {}
  }

  // --- vender repetida: publicar listing 30200 (firmado por el usuario) ---
  async function listForSale(num: number, price: number) {
    if (!identity) return;
    const d = `sell:${num}:${Date.now()}`;
    const template: EventTemplate = {
      kind: KIND.LISTING,
      created_at: Math.floor(Date.now() / 1000),
      content: `Vendo #${num} repetida, ${price} sats`,
      tags: [
        ["d", d],
        ["sticker", `${ALBUM_ID}:${num}`],
        ["a", addr(KIND.STICKER, ISSUER_PUBKEY, `${ALBUM_ID}:${num}`)],
        ["price", String(price)],
        ["status", "open"],
        ["p", ISSUER_PUBKEY],
      ],
    };
    try {
      const ev = await signEvent(template, identity.mode);
      await Promise.any(getPool().publish(getRelays(), ev));
      notify(`🏷️ Publicaste la #${num} por ${price} sats`);
    } catch (e: any) {
      notify("⚠️ No se pudo publicar la oferta");
    }
  }

  // --- cancelar venta: republica el listing con status "closed" ---
  async function cancelListing(listing: Listing) {
    if (!identity) return;
    const template: EventTemplate = {
      kind: KIND.LISTING,
      created_at: Math.floor(Date.now() / 1000),
      content: "",
      tags: [
        ["d", listing.d],
        ["sticker", `${ALBUM_ID}:${listing.stickerNum}`],
        ["price", String(listing.price)],
        ["status", "closed"],
        ["p", ISSUER_PUBKEY],
      ],
    };
    try {
      const ev = await signEvent(template, identity.mode);
      await Promise.any(getPool().publish(getRelays(), ev));
      notify(`✅ Oferta cancelada`);
      setTimeout(refresh, 800);
    } catch {
      notify("⚠️ No se pudo cancelar la oferta");
    }
  }

  // --- comprar: zap directo al vendedor ---
  async function buyListing(listing: Listing) {
    if (!identity) return notify("Conectate primero");
    setBusy(true);
    try {
      // necesitamos la LN address del vendedor; en demo usamos su metadata kind:0.
      // Para simplificar, asumimos que el vendedor publicó "lud16" en su perfil.
      const sellerLn = await resolveSellerLnAddress(listing.seller);
      const res = await zap(
        {
          amountSats: listing.price,
          target: { pubkey: listing.seller, lnurlOrAddress: sellerLn },
          extraTags: [
            ["a", addr(KIND.LISTING, listing.seller, listing.d)],
            ["figus-action", "buy-sticker"],
          ],
          comment: `Compro #${listing.stickerNum}`,
          signerMode: identity.mode,
        },
        () => {
          notify("⚡ Pago al vendedor confirmado — el issuer transferirá la figu…");
          setTimeout(refresh, 1500);
        }
      );
      if (!res.paid) {
        setInvoice(res.invoice);
        notify("Escaneá el invoice para completar la compra");
      }
    } catch (e: any) {
      notify("⚠️ " + (e.message || "Error en la compra"));
    } finally {
      setBusy(false);
    }
  }

  // --- reclamar premio: lo emite el issuer; el cliente solo lo dispara ---
  async function claimPage(page: Page) {
    notify(
      `🏆 Página ${page.name} completa. El issuer emitirá el premio con zap split 70/20/10.`
    );
    // En la arquitectura real, el cliente notifica al issuer (endpoint o evento)
    // y el issuer publica el claim 1575. Ver issuer/index.ts.
  }

  const dupesList = useMemo(() => dupes, [dupes]);

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* HEADER */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          borderBottom: "1px solid var(--line)",
          position: "sticky",
          top: 0,
          background: "rgba(3,11,24,.92)",
          backdropFilter: "blur(12px)",
          zIndex: 5,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Logo */}
          <img src="/logomundial.png" alt="Figus Mundial 2026" width={40} height={40} style={{ objectFit: "contain" }} />
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: "var(--display)", fontSize: 20, lineHeight: 1, color: "var(--gold)" }}>
                FIGUS
              </span>
              <span style={{ fontFamily: "var(--condensed)", fontSize: 10, color: "var(--muted)", letterSpacing: 1, fontWeight: 700 }}>
                MUNDIAL 2026™
              </span>
            </div>
            <div style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--condensed)", fontWeight: 700, letterSpacing: 0.5 }}>
              {t.header_subtitle}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Language toggle */}
          <button
            onClick={toggleLang}
            title={t.settings}
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              color: "var(--gold)",
              width: 34,
              height: 34,
              borderRadius: 8,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              fontSize: 11,
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              letterSpacing: 0.5,
              transition: "border-color .2s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--gold)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--line)"; }}
          >
            {lang === "es" ? "EN" : "ES"}
          </button>

          <button
            onClick={() => setShowSettings(true)}
            title={t.settings}
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              color: "var(--muted)",
              width: 34,
              height: 34,
              borderRadius: 8,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              fontSize: 16,
              transition: "border-color .2s, color .2s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--gold)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--gold)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--line)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)"; }}
          >
            ⚙
          </button>
          <Connect
            identity={identity}
            nip07Available={nip07Available}
            onNip07={connectNip07}
            onLocal={connectLocal}
            onLogout={logout}
            onNip46QR={connectNip46QR}
            onNip46Bunker={connectNip46Bunker}
          />
        </div>
      </header>

      {!configured && (
        <div
          style={{
            maxWidth: 720,
            margin: "20px auto 0",
            padding: 16,
            background: "var(--panel)",
            border: "1px solid var(--gold)",
            borderRadius: 12,
            fontSize: 14,
          }}
        >
          <strong style={{ color: "var(--gold)" }}>Falta configurar el issuer.</strong>{" "}
          Corré <code>npm run seed</code> para generar las claves y publicar el
          catálogo, copiá la pubkey impresa en <code>.env</code> como{" "}
          <code>NEXT_PUBLIC_ISSUER_PUBKEY</code>, y reiniciá el dev server.
        </div>
      )}

      {/* TABS */}
      <nav
        style={{
          display: "flex",
          gap: 4,
          padding: "12px 20px 0",
          justifyContent: "center",
          borderBottom: "1px solid var(--line)",
        }}
      >
        {(
          [
            ["album",   t.tab_album],
            ["packs",   t.tab_packs],
            ["market",  t.tab_market],
            ["fixture", t.tab_fixture],
            ["game",    t.tab_game],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: tab === k ? "2px solid var(--gold)" : "2px solid transparent",
              color: tab === k ? "var(--gold)" : "var(--muted)",
              padding: "8px 18px 10px",
              fontSize: 12,
              fontWeight: 900,
              fontFamily: "var(--condensed)",
              letterSpacing: 1,
              transition: "color .2s",
            }}
          >
            {l}
          </button>
        ))}
      </nav>

      {/* progress */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 20px 0",
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            flex: 1,
            height: 6,
            background: "var(--panel2)",
            borderRadius: 99,
            overflow: "hidden",
            border: "1px solid var(--line)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${(owned / ALL_NUMBERS.length) * 100}%`,
              background: "linear-gradient(90deg, var(--gold), #d4920a)",
              transition: "width .5s ease",
            }}
          />
        </div>
        <span
          style={{
            fontSize: 11,
            color: "var(--gold)",
            whiteSpace: "nowrap",
            fontFamily: "var(--condensed)",
            fontWeight: 900,
          }}
        >
          {owned}/{ALL_NUMBERS.length}
        </span>
        <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)" }}>
          {t.collected}
        </span>
      </div>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "18px 20px" }}>
        {loading && configured && (
          <p style={{ opacity: 0.5, textAlign: "center" }}>{t.loading}</p>
        )}
        {tab === "album" && (
          <Album ownership={ownership} onClaim={claimPage} onSell={listForSale} />
        )}
        {tab === "packs" && (
          <>
            <Packs
              onOpen={openPack}
              onDemo={openPackDemo}
              onCancel={() => setBusy(false)}
              busy={busy}
              freePack={{
                available: !!pubkey && !hasClaimedFreePack,
                onOpen: openFreePack,
              }}
            />
            <MyStickers ownership={ownership} onSell={listForSale} />
          </>
        )}
        {tab === "fixture" && <Fixture />}
        {tab === "game" && (
          <div style={{ display: "grid", gap: 28 }}>
            {activeMatch && identity ? (
              <PenaltyMatchView
                match={activeMatch}
                identity={identity}
                onBack={() => setActiveMatch(null)}
              />
            ) : (
              <>
                <PenaltyGame
                  pubkey={pubkey}
                  onGoal={() => { setPenaltyPackPending(true); openFreePack(); }}
                  onPublish={publishPenalty}
                  packPending={penaltyPackPending}
                />
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 24 }}>
                  <PenaltyMatchLobby
                    identity={identity}
                    onEnterMatch={setActiveMatch}
                  />
                </div>
                <Leaderboard myPubkey={pubkey} />
              </>
            )}
          </div>
        )}
        {tab === "market" && (
          <Market
            listings={listings}
            settlements={settlements}
            myOwnership={ownership}
            myPubkey={pubkey}
            onBuy={buyListing}
            onCancel={cancelListing}
          />
        )}
      </main>

      {packResult && (
        <PackReveal figus={packResult} onClose={() => setPackResult(null)} />
      )}

      {invoice && (
        <InvoiceModal
          invoice={invoice}
          onClose={() => setInvoice(null)}
          onNwcPaid={() => setInvoice(null)}
          notify={notify}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          identity={identity}
          onImportNsec={(raw) => { importNsec(raw); setShowSettings(false); }}
        />
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--panel)",
            border: "1px solid var(--gold)",
            color: "var(--ink)",
            padding: "12px 20px",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            zIndex: 60,
            boxShadow: "0 8px 24px rgba(0,0,0,.5)",
            maxWidth: "90vw",
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}

      <footer
        style={{
          textAlign: "center",
          fontSize: 11,
          color: "var(--muted)",
          padding: "24px 20px 0",
          maxWidth: 600,
          margin: "0 auto",
        }}
      >
        © 2026 Figus · Nostr + Lightning · Open source
      </footer>
    </div>
  );
}

// Resuelve la Lightning Address (lud16) del perfil kind:0 del vendedor
async function resolveSellerLnAddress(pubkey: string): Promise<string> {
  const { list } = await import("@/lib/pool");
  const metas = await list([{ kinds: [0], authors: [pubkey] }]);
  if (metas.length === 0) throw new Error("El vendedor no tiene perfil con Lightning Address");
  const meta = metas.sort((a, b) => b.created_at - a.created_at)[0];
  try {
    const profile = JSON.parse(meta.content);
    const ln = profile.lud16 || profile.lightning_address;
    if (!ln) throw new Error("El vendedor no publicó lud16 en su perfil");
    return ln;
  } catch {
    throw new Error("No se pudo leer el perfil del vendedor");
  }
}
