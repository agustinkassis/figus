"use client";

import { useState, useEffect } from "react";
import type { Identity } from "@/lib/identity";
import { ISSUER_PUBKEY, ISSUER_LN_ADDRESS } from "@/lib/constants";
import {
  useBets,
  createBetAndLock,
  acceptBetAndLock,
  type BetOffer,
  type BetPick,
} from "@/hooks/useBets";
import { InvoiceModal } from "./InvoiceModal";
import type { Translations } from "@/lib/i18n";

interface Props {
  home: string;
  away: string;
  nameHome: string;
  nameAway: string;
  identity?: Identity;
  t: Translations;
}

export function BetPanel({ home, away, nameHome, nameAway, identity, t }: Props) {
  const [open, setOpen] = useState(false);
  const { offers, settles, loading } = useBets(home, away);

  const openBets = offers.filter((o) => {
    const s = settles.get(o.betId);
    return !s || s.action === "bet-locked-a";
  });

  const badge = openBets.length > 0 ? ` (${openBets.length})` : "";

  return (
    <div style={{ borderTop: "1px solid var(--line)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "7px 12px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
        }}
      >
        <span style={{ fontFamily: "var(--condensed)", fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "var(--gold)" }}>
          ⚡ {t.bet_section}{badge}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 12px 12px" }}>
          {loading ? (
            <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)" }}>…</div>
          ) : (
            <>
              {/* Lista de apuestas existentes */}
              {openBets.length === 0 ? (
                <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)", marginBottom: 8 }}>
                  {t.bet_no_bets}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                  {openBets.map((offer) => (
                    <BetRow
                      key={offer.id}
                      offer={offer}
                      settle={settles.get(offer.betId)}
                      identity={identity}
                      nameHome={nameHome}
                      nameAway={nameAway}
                      t={t}
                    />
                  ))}
                </div>
              )}

              {/* Formulario para crear apuesta */}
              {identity ? (
                <CreateBetForm
                  home={home}
                  away={away}
                  nameHome={nameHome}
                  nameAway={nameAway}
                  identity={identity}
                  t={t}
                />
              ) : (
                <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)", fontStyle: "italic" }}>
                  {t.bet_connect}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Fila de apuesta existente ──────────────────────────────────────────────────

function BetRow({
  offer,
  settle,
  identity,
  nameHome,
  nameAway,
  t,
}: {
  offer: BetOffer;
  settle: import("@/hooks/useBets").BetSettle | undefined;
  identity?: Identity;
  nameHome: string;
  nameAway: string;
  t: Translations;
}) {
  const [invoice, setInvoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notify, setNotify] = useState<string | null>(null);

  const pickLabel = (pick: BetPick) =>
    pick === "home" ? nameHome : pick === "away" ? nameAway : t.bet_pick_draw;

  const status = settle?.action;
  const isOwn = identity?.pubkey === offer.author;
  const aLocked = status === "bet-locked-a";
  // Mostrar botón para no-dueños si: bet-locked-a confirmado, o sin estado (issuer pudo perder el receipt)
  const canAccept = !isOwn && identity && (aLocked || !status);

  // Cerrar factura automáticamente cuando el issuer confirma bet-matched
  useEffect(() => {
    if (invoice && status === "bet-matched") {
      setInvoice(null);
      setNotify("✅ ¡Apuesta confirmada!");
    }
  }, [status, invoice]);

  const handleAccept = async () => {
    if (!identity) return;
    setBusy(true);
    setNotify(null);
    try {
      const { invoice: inv, paid } = await acceptBetAndLock(
        identity, offer, ISSUER_LN_ADDRESS, ISSUER_PUBKEY
      );
      if (!paid) setInvoice(inv);
      else setNotify("⚡ Pago enviado — esperando confirmación");
    } catch (e: any) {
      setNotify("⚠️ " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const statusBadge =
    status === "bet-settled" ? t.bet_settled :
    status === "bet-matched" ? t.bet_matched :
    null; // "bet-locked-a" no muestra badge solo — muestra badge + botón aceptar

  return (
    <>
      {invoice && (
        <InvoiceModal
          invoice={invoice}
          amountSats={offer.amount}
          onClose={() => setInvoice(null)}
          onNwcPaid={() => { setInvoice(null); setNotify("⚡ Pago enviado"); }}
          notify={(msg) => setNotify(msg)}
        />
      )}
      <div style={{
        background: "var(--panel2)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "7px 10px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--condensed)", fontSize: 10, fontWeight: 900, color: "var(--ink)" }}>
            {pickLabel(offer.pick)} · {offer.amount} {t.bet_sats}
          </div>
          <div style={{ fontFamily: "var(--condensed)", fontSize: 9, color: "var(--muted)", marginTop: 1 }}>
            {offer.author.slice(0, 8)}… · {t.bet_fee}
          </div>
          {notify && (
            <div style={{ fontSize: 9, color: "var(--gold)", fontFamily: "var(--condensed)", marginTop: 2 }}>{notify}</div>
          )}
        </div>

        {statusBadge && (
          <span style={{ fontFamily: "var(--condensed)", fontSize: 9, fontWeight: 900, color: status === "bet-settled" ? "#4ade80" : "#60a5fa" }}>
            {statusBadge}
          </span>
        )}

        {/* "bet-locked-a": muestra badge + botón de aceptar para sideB */}
        {aLocked && (
          <span style={{ fontFamily: "var(--condensed)", fontSize: 9, fontWeight: 900, color: "var(--gold)" }}>
            {t.bet_locked}
          </span>
        )}
        {canAccept && (
          <button
            onClick={handleAccept}
            disabled={busy}
            style={{
              background: "var(--gold)",
              color: "#030b18",
              border: "none",
              borderRadius: 6,
              padding: "4px 10px",
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              fontSize: 10,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            {busy ? "…" : t.bet_accept}
          </button>
        )}
      </div>
    </>
  );
}

// ── Formulario de creación ─────────────────────────────────────────────────────

function CreateBetForm({
  home, away, nameHome, nameAway, identity, t,
}: {
  home: string; away: string; nameHome: string; nameAway: string;
  identity: Identity; t: Translations;
}) {
  const [pick, setPick] = useState<BetPick>("home");
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [notify, setNotify] = useState<string | null>(null);

  const amtNum = parseInt(amount, 10);
  const canBet = !isNaN(amtNum) && amtNum >= 1 && !busy && ISSUER_LN_ADDRESS;

  const handleCreate = async () => {
    if (!canBet) return;
    setBusy(true);
    setNotify(null);
    try {
      const { invoice: inv, paid } = await createBetAndLock(
        identity, home, away, pick, amtNum, ISSUER_LN_ADDRESS, ISSUER_PUBKEY
      );
      if (!paid) setInvoice(inv);
      else setNotify("⚡ Apuesta creada y locked");
    } catch (e: any) {
      setNotify("⚠️ " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const picks: { value: BetPick; label: string }[] = [
    { value: "home", label: nameHome },
    { value: "draw", label: t.bet_pick_draw },
    { value: "away", label: nameAway },
  ];

  return (
    <>
      {invoice && (
        <InvoiceModal
          invoice={invoice}
          amountSats={amtNum}
          onClose={() => setInvoice(null)}
          onNwcPaid={() => { setInvoice(null); setNotify("⚡ Apuesta locked"); }}
          notify={(msg) => setNotify(msg)}
        />
      )}
      <div style={{
        background: "var(--panel2)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "10px",
      }}>
        <div style={{ fontFamily: "var(--condensed)", fontSize: 9, fontWeight: 900, letterSpacing: 1, color: "var(--muted)", marginBottom: 8 }}>
          NUEVA APUESTA
        </div>

        {/* Pick selector */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {picks.map((p) => (
            <button
              key={p.value}
              onClick={() => setPick(p.value)}
              style={{
                flex: 1,
                background: pick === p.value ? "var(--gold)" : "var(--panel)",
                color: pick === p.value ? "#030b18" : "var(--muted)",
                border: `1px solid ${pick === p.value ? "var(--gold)" : "var(--line)"}`,
                borderRadius: 6,
                padding: "5px 4px",
                fontFamily: "var(--condensed)",
                fontWeight: 900,
                fontSize: 9,
                cursor: "pointer",
                letterSpacing: 0.3,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Amount + submit */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="sats"
            style={{
              flex: 1,
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: "5px 8px",
              color: "var(--ink)",
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              fontSize: 12,
              outline: "none",
            }}
          />
          <span style={{ fontFamily: "var(--condensed)", fontSize: 9, color: "var(--muted)" }}>{t.bet_sats}</span>
          <button
            onClick={handleCreate}
            disabled={!canBet}
            style={{
              background: canBet ? "var(--gold)" : "var(--panel2)",
              color: canBet ? "#030b18" : "var(--muted)",
              border: "none",
              borderRadius: 6,
              padding: "6px 12px",
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              fontSize: 10,
              cursor: canBet ? "pointer" : "default",
              opacity: canBet ? 1 : 0.6,
              letterSpacing: 0.5,
            }}
          >
            {busy ? "…" : t.bet_create}
          </button>
        </div>

        {notify && (
          <div style={{ fontFamily: "var(--condensed)", fontSize: 10, color: "var(--gold)", marginTop: 6 }}>
            {notify}
          </div>
        )}
        <div style={{ fontFamily: "var(--condensed)", fontSize: 9, color: "var(--muted)", marginTop: 4 }}>
          {t.bet_accept_tip} · {t.bet_fee}
        </div>
      </div>
    </>
  );
}
