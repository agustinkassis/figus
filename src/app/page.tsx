"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const { ownership, listings, settlements, owned, dupes, loading, refresh, hasClaimedFreePack, claimPack, addSticker } =
    useGameState(pubkey);

  const [tab, setTab] = useState<Tab>("album");
  const [toast, setToast] = useState<string | null>(null);
  const [packResult, setPackResult] = useState<number[] | null>(null);
  const [penaltyPackPending, setPenaltyPackPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [invoiceAmount, setInvoiceAmount] = useState<number>(0);
  // Listing associated with the current invoice — used to deliver the sticker
  // immediately when NWC confirms payment (without waiting for ZAP_RECEIPT).
  const invoiceListing = useRef<Listing | null>(null);
  // Guards against addSticker being called twice (once by onNwcPaid, once by ZAP_RECEIPT).
  const buyDelivered = useRef(false);
  // Listing IDs paid locally — hidden from market immediately, before SETTLEMENT arrives.
  const [locallyRemovedListings, setLocallyRemovedListings] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [activeMatch, setActiveMatch] = useState<PenaltyMatch | null>(null);
  const [claimedPages, setClaimedPages] = useState<string[]>([]);

  useEffect(() => {
    if (packResult) setPenaltyPackPending(false);
  }, [packResult]);

  // Load which pages have already been claimed (persisted locally to drive button state)
  useEffect(() => {
    if (!pubkey) { setClaimedPages([]); return; }
    try {
      const raw = localStorage.getItem(`figus_rewards_${pubkey}`);
      setClaimedPages(raw ? JSON.parse(raw) : []);
    } catch { setClaimedPages([]); }
  }, [pubkey]);

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
      // Race contra timeout de 45s: signEvent con Amber puede quedar colgado
      // si el usuario no aprueba la firma en el teléfono.
      const zapPromise = zap(
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
      const res = await Promise.race([
        zapPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Tiempo de firma agotado — si usás Amber, abrilo y aprobá la firma")), 20_000)
        ),
      ]);
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
          setInvoiceAmount(21);
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
    // Reset delivery guards for this new purchase attempt
    invoiceListing.current = listing;
    buyDelivered.current   = false;
    try {
      const sellerLn = await resolveSellerLnAddress(listing.seller);
      const zapPromise = zap(
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
          // ZAP_RECEIPT confirmed — deliver sticker only if not already done via NWC
          if (!buyDelivered.current) {
            buyDelivered.current = true;
            addSticker(listing.stickerNum);
            notify(`✅ ¡Pago confirmado! La #${listing.stickerNum} fue acreditada a tu álbum`);
            setTimeout(refresh, 3000);
          }
          // Always hide the listing locally (SETTLEMENT from ISSUER may be slow/absent)
          setLocallyRemovedListings(prev =>
            prev.includes(listing.id) ? prev : [...prev, listing.id]
          );
          setInvoice(null);
        }
      );
      // Race against 25s timeout — prevents hanging when Amber/NIP-46 doesn't respond
      const res = await Promise.race([
        zapPromise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Tiempo de firma agotado. Si usás Amber, abrilo y aprobá la firma.")),
            25_000
          )
        ),
      ]);
      if (!res.paid) {
        setInvoiceAmount(listing.price);
        setInvoice(res.invoice);
      }
    } catch (e: any) {
      notify("⚠️ " + (e.message || "Error en la compra"));
    } finally {
      setBusy(false);
    }
  }

  // --- reclamar premio de página/álbum completo ---
  async function sendRewardClaim(pageId: string, displayName: string) {
    if (!identity) return notify("Conectate primero");
    if (!pubkey) return;
    setBusy(true);
    try {
      const template: EventTemplate = {
        kind: KIND.REWARD_CLAIM,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["type",  pageId === "album" ? "album" : "page"],
          ["page",  pageId],
          ["a",     addr(KIND.ALBUM, ISSUER_PUBKEY, ALBUM_ID)],
        ],
      };
      const ev = await signEvent(template, identity.mode);
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: ev, pageId }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string };
      if (!res.ok) {
        notify("⚠️ " + (data.error || "Error al reclamar el premio"));
        return;
      }
      // Persist claimed state so the button flips to "RECLAMADO"
      const next = [...claimedPages, pageId];
      setClaimedPages(next);
      try { localStorage.setItem(`figus_rewards_${pubkey}`, JSON.stringify(next)); } catch {}
      notify("🏆 " + (data.message || `Premio de ${displayName} enviado.`));
    } catch (e: any) {
      notify("⚠️ " + (e.message || "Error al reclamar"));
    } finally {
      setBusy(false);
    }
  }

  function claimPage(page: Page) { return sendRewardClaim(page.id, page.name); }
  function claimAlbum()          { return sendRewardClaim("album", "álbum completo"); }

  const dupesList = useMemo(() => dupes, [dupes]);
  // Hide listings the user has already paid for locally, before ISSUER publishes SETTLEMENT.
  const visibleListings = useMemo(
    () => listings.filter(l => !locallyRemovedListings.includes(l.id)),
    [listings, locallyRemovedListings]
  );

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

      {identity ? (
        <>
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
              <Album
                ownership={ownership}
                onClaim={claimPage}
                onClaimAlbum={claimAlbum}
                onSell={listForSale}
                claimedPages={claimedPages}
              />
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
                listings={visibleListings}
                settlements={settlements}
                myOwnership={ownership}
                myPubkey={pubkey}
                onBuy={buyListing}
                onCancel={cancelListing}
              />
            )}
          </main>
        </>
      ) : (
        <LandingPage
          onPackDemo={openPackDemo}
          nip07Available={nip07Available}
          onNip07={connectNip07}
          onLocal={connectLocal}
          onLogout={logout}
          onNip46QR={connectNip46QR}
          onNip46Bunker={connectNip46Bunker}
        />
      )}

      {packResult && (
        <PackReveal figus={packResult} onClose={() => setPackResult(null)} />
      )}

      {invoice && (
        <InvoiceModal
          invoice={invoice}
          amountSats={invoiceAmount}
          onClose={() => setInvoice(null)}
          onNwcPaid={() => {
            // If this invoice belongs to a sticker purchase, deliver optimistically:
            // the NWC wallet confirmed the payment was sent, so we credit the sticker
            // right away rather than waiting for the ZAP_RECEIPT (which may never arrive
            // if the seller's provider publishes the receipt to different relays).
            const listing = invoiceListing.current;
            if (listing && !buyDelivered.current) {
              buyDelivered.current = true;
              addSticker(listing.stickerNum);
              notify(`⚡ Pago enviado · la #${listing.stickerNum} fue acreditada a tu álbum`);
              setTimeout(refresh, 2000);
            }
            if (listing) {
              setLocallyRemovedListings(prev =>
                prev.includes(listing.id) ? prev : [...prev, listing.id]
              );
            }
            setInvoice(null);
          }}
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

// ─────────────────────────────────────────
// LANDING PAGE (pre-login)
// ─────────────────────────────────────────

function LandingPage({
  onPackDemo,
  nip07Available,
  onNip07,
  onLocal,
  onLogout,
  onNip46QR,
  onNip46Bunker,
}: {
  onPackDemo: () => void;
  nip07Available: boolean;
  onNip07: () => void;
  onLocal: () => void;
  onLogout: () => void;
  onNip46QR: (
    onQR: (uri: string, dataUrl: string, expiresAt: number) => void,
    onauth: (url: string) => void,
    signal: AbortSignal
  ) => Promise<void>;
  onNip46Bunker: (url: string, onauth: (url: string) => void) => Promise<void>;
}) {
  const connectProps = { identity: null, nip07Available, onNip07, onLocal, onLogout, onNip46QR, onNip46Bunker };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 80px" }}>

      {/* ── HERO ── */}
      <section className="fade-in" style={{ textAlign: "center", padding: "56px 0 52px" }}>
        <img
          src="/logomundial.png"
          alt="Figus Mundial 2026"
          width={88}
          height={88}
          style={{ objectFit: "contain", marginBottom: 20, filter: "drop-shadow(0 0 24px rgba(232,185,35,.35))" }}
        />
        <h1 style={{
          fontFamily: "var(--display)",
          fontSize: "clamp(40px, 10vw, 64px)",
          color: "var(--gold)",
          margin: "0 0 6px",
          lineHeight: 1,
          letterSpacing: 2,
        }}>
          FIGUS
        </h1>
        <div style={{
          fontFamily: "var(--condensed)",
          fontSize: "clamp(13px, 3vw, 17px)",
          color: "var(--ink)",
          fontWeight: 900,
          letterSpacing: 3,
          marginBottom: 20,
        }}>
          MUNDIAL 2026™
        </div>
        <p style={{
          fontSize: 15,
          color: "var(--muted)",
          maxWidth: 460,
          margin: "0 auto 36px",
          lineHeight: 1.75,
        }}>
          El primer álbum de figuritas del Mundial nativo de{" "}
          <span style={{ color: "var(--ink)", fontWeight: 700 }}>Nostr</span> y{" "}
          <span style={{ color: "var(--ink)", fontWeight: 700 }}>Bitcoin</span>.
          Coleccioná, intercambiá y jugá — todo descentralizado.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Connect {...connectProps} />
        </div>
      </section>

      {/* ── DIVISOR ── */}
      <div style={{ borderTop: "1px solid var(--line)", marginBottom: 52 }} />

      {/* ── CÓMO FUNCIONA ── */}
      <section style={{ marginBottom: 60 }}>
        <div style={{
          fontFamily: "var(--condensed)",
          fontSize: 10,
          letterSpacing: 3,
          color: "var(--muted)",
          textAlign: "center",
          marginBottom: 28,
          fontWeight: 900,
        }}>
          CÓMO FUNCIONA
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          <FeatureCard
            icon="📖"
            color="#e8b923"
            title="EL ÁLBUM"
            desc="672 figuritas del Mundial 2026 organizadas en páginas por grupo y selección. Completá páginas para reclamar premios en sats."
          />
          <FeatureCard
            icon="⚡"
            color="#f5d060"
            title="SOBRES"
            desc="Comprá sobres por 21 sats vía Lightning. Cada sobre trae 7 figuritas aleatorias de distintas rarezas. Tu primero es siempre gratis."
          />
          <FeatureCard
            icon="🏷️"
            color="#52b788"
            title="MERCADO P2P"
            desc="Publicá tus repetidas y comprá las que te faltan directamente con otros coleccionistas. Sin intermediarios — todo en Nostr + Lightning."
          />
          <FeatureCard
            icon="⚽"
            color="#6cc4ee"
            title="PENALES 3D"
            desc="Jugá penales en la cancha 3D con WebGL. Si convertís, ganás un sobre. Competí en el ranking global publicado en Nostr."
          />
        </div>
      </section>

      {/* ── DEMO DE SOBRES ── */}
      <section style={{ marginBottom: 60 }}>
        <div style={{
          background: "linear-gradient(135deg, rgba(232,185,35,.07), rgba(232,185,35,.02))",
          border: "1px solid rgba(232,185,35,.3)",
          borderRadius: 20,
          padding: "44px 28px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 52, marginBottom: 16, lineHeight: 1 }}>🎁</div>
          <div style={{
            fontFamily: "var(--display)",
            fontSize: 22,
            color: "var(--gold)",
            marginBottom: 8,
          }}>
            PROBÁ ABRIR UN SOBRE
          </div>
          <p style={{
            fontSize: 13,
            color: "var(--muted)",
            margin: "0 auto 28px",
            maxWidth: 380,
            lineHeight: 1.7,
          }}>
            Demo gratuita — sin Lightning ni cuenta de Nostr.
            7 figuritas aleatorias directamente en tu pantalla.
          </p>
          <button
            onClick={onPackDemo}
            style={{
              background: "linear-gradient(135deg, var(--gold), #c8890a)",
              color: "#030b18",
              border: "none",
              padding: "14px 40px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 900,
              fontFamily: "var(--condensed)",
              letterSpacing: 1,
              cursor: "pointer",
              transition: "transform .15s, box-shadow .15s",
              boxShadow: "0 4px 20px rgba(232,185,35,.25)",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.04)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 28px rgba(232,185,35,.4)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(232,185,35,.25)";
            }}
          >
            ABRIR SOBRE DEMO
          </button>
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section style={{ marginBottom: 60 }}>
        <div style={{
          fontFamily: "var(--condensed)",
          fontSize: 10,
          letterSpacing: 3,
          color: "var(--muted)",
          textAlign: "center",
          marginBottom: 28,
          fontWeight: 900,
        }}>
          TECNOLOGÍA
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          <TechBadge icon="🟣" label="Nostr" desc="Identidad y mercado descentralizado. NIP-07, NIP-46, NIP-01." />
          <TechBadge icon="⚡" label="Lightning" desc="Micropagos instantáneos. 21 sats por sobre abierto." />
          <TechBadge icon="₿" label="Bitcoin" desc="La base monetaria. Sin custodios ni intermediarios." />
          <TechBadge icon="🎮" label="Three.js" desc="Cancha 3D con WebGL para el juego de penales." />
          <TechBadge icon="▲" label="Next.js 14" desc="Framework React con App Router y Server Components." />
          <TechBadge icon="📂" label="Open Source" desc="Código 100% abierto — auditá, forkeá, contribuí." />
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{
        textAlign: "center",
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 20,
        padding: "44px 28px",
      }}>
        <div style={{
          fontFamily: "var(--display)",
          fontSize: 20,
          color: "var(--ink)",
          marginBottom: 10,
        }}>
          ¿LISTO PARA EMPEZAR?
        </div>
        <p style={{
          fontSize: 13,
          color: "var(--muted)",
          margin: "0 auto 28px",
          maxWidth: 400,
          lineHeight: 1.7,
        }}>
          Conectate con tu cuenta Nostr. Compatible con{" "}
          <strong style={{ color: "var(--ink)" }}>Alby</strong>,{" "}
          <strong style={{ color: "var(--ink)" }}>Amber</strong>,{" "}
          <strong style={{ color: "var(--ink)" }}>nsec.app</strong>{" "}
          y cualquier extensión NIP-07.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Connect {...connectProps} />
        </div>
        <div style={{ marginTop: 16, fontSize: 11, color: "var(--muted)", fontFamily: "var(--condensed)" }}>
          Tu clave privada nunca sale de tu dispositivo
        </div>
      </section>

    </div>
  );
}

function FeatureCard({
  icon,
  color,
  title,
  desc,
}: {
  icon: string;
  color: string;
  title: string;
  desc: string;
}) {
  return (
    <div style={{
      background: "var(--panel)",
      border: "1px solid var(--line)",
      borderRadius: 16,
      padding: "24px 20px",
      borderTop: `2px solid ${color}22`,
    }}>
      <div style={{ fontSize: 30, marginBottom: 12, lineHeight: 1 }}>{icon}</div>
      <div style={{
        fontFamily: "var(--condensed)",
        fontWeight: 900,
        fontSize: 13,
        letterSpacing: 1,
        color,
        marginBottom: 8,
      }}>
        {title}
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.7 }}>
        {desc}
      </p>
    </div>
  );
}

function TechBadge({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div style={{
      background: "var(--panel)",
      border: "1px solid var(--line)",
      borderRadius: 12,
      padding: "14px 16px",
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      width: 200,
    }}>
      <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1, marginTop: 1 }}>{icon}</span>
      <div>
        <div style={{
          fontFamily: "var(--condensed)",
          fontWeight: 900,
          fontSize: 13,
          color: "var(--ink)",
          letterSpacing: 0.4,
          marginBottom: 3,
        }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
          {desc}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────

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
