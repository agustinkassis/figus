"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { getNwcString, saveNwcString, clearNwcString, nwcPay } from "@/lib/nwc";
import { useLang } from "@/contexts/LangContext";

export function InvoiceModal({
  invoice,
  amountSats,
  onClose,
  onNwcPaid,
  notify,
}: {
  invoice: string;
  amountSats?: number;
  onClose: () => void;
  onNwcPaid: () => void;
  notify: (msg: string) => void;
}) {
  const { t } = useLang();
  const [qrUrl, setQrUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [nwcString, setNwcString] = useState<string>(getNwcString() ?? "");
  const [showNwcInput, setShowNwcInput] = useState(false);
  const [nwcBusy, setNwcBusy] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(`lightning:${invoice.toUpperCase()}`, {
      width: 240,
      margin: 2,
      color: { dark: "#003087", light: "#ffffff" },
    }).then(setQrUrl);
  }, [invoice]);

  function copyInvoice() {
    navigator.clipboard.writeText(invoice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function payWithNwc() {
    const str = nwcString.trim();
    if (!str.startsWith("nostr+walletconnect://")) {
      notify("⚠️ La cadena NWC debe empezar con nostr+walletconnect://");
      return;
    }
    saveNwcString(str);
    setNwcBusy(true);
    try {
      await nwcPay(invoice, str);
      notify("⚡ Solicitud enviada a tu wallet NWC — esperando figus…");
      onNwcPaid();
    } catch (e: any) {
      notify("⚠️ NWC: " + (e.message || "Error al enviar el pago"));
    } finally {
      setNwcBusy(false);
    }
  }

  function forgetNwc() {
    clearNwcString();
    setNwcString("");
  }

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
          padding: "24px 20px",
          maxWidth: 380,
          width: "100%",
          textAlign: "center",
        }}
      >
        {/* Header */}
        <div style={{ fontSize: 10, fontFamily: "var(--condensed)", fontWeight: 900, letterSpacing: 2, color: "var(--gold)", marginBottom: 4 }}>
          {t.invoice_title}
        </div>
        {amountSats && amountSats > 0 && (
          <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "var(--condensed)", color: "var(--gold)", lineHeight: 1, marginBottom: 4 }}>
            ⚡ {amountSats} sats
          </div>
        )}
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 16px", fontFamily: "var(--condensed)" }}>
          {t.invoice_subtitle}
        </p>

        {/* QR */}
        {qrUrl ? (
          <div
            style={{
              display: "inline-block",
              padding: 10,
              background: "#fff",
              borderRadius: 12,
              marginBottom: 16,
              boxShadow: "0 4px 20px rgba(0,48,135,0.3)",
            }}
          >
            <img src={qrUrl} alt="Invoice QR" width={200} height={200} style={{ display: "block" }} />
          </div>
        ) : (
          <div style={{ width: 220, height: 220, margin: "0 auto 16px", background: "var(--panel2)", borderRadius: 12, display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 12 }}>
            {t.invoice_generating}
          </div>
        )}

        {/* Open in wallet — deep link for mobile Lightning wallets */}
        <a
          href={`lightning:${invoice}`}
          style={{
            display: "block",
            width: "100%",
            background: "linear-gradient(135deg,var(--grass),var(--pitch))",
            color: "#fff",
            border: "none",
            padding: "11px 0",
            borderRadius: 10,
            fontWeight: 900,
            fontSize: 14,
            fontFamily: "var(--condensed)",
            letterSpacing: 0.5,
            marginBottom: 8,
            textAlign: "center",
            textDecoration: "none",
            boxSizing: "border-box",
          }}
        >
          ⚡ ABRIR EN WALLET
        </a>

        {/* Copy button */}
        <button
          onClick={copyInvoice}
          style={{
            width: "100%",
            background: copied ? "var(--panel2)" : "linear-gradient(135deg,var(--gold),#d4920a)",
            color: copied ? "var(--muted)" : "#030b18",
            border: "none",
            padding: "11px 0",
            borderRadius: 10,
            fontWeight: 900,
            fontSize: 14,
            fontFamily: "var(--condensed)",
            letterSpacing: 0.5,
            marginBottom: 12,
            transition: "all .2s",
          }}
        >
          {copied ? t.invoice_copied : t.invoice_copy}
        </button>

        {/* NWC section */}
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 4 }}>
          {!showNwcInput ? (
            <button
              onClick={() => setShowNwcInput(true)}
              style={{
                background: "transparent",
                border: "1px solid var(--line)",
                color: "var(--muted)",
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 12,
                fontFamily: "var(--condensed)",
                fontWeight: 700,
                width: "100%",
              }}
            >
              {t.invoice_nwc_btn}
            </button>
          ) : (
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)", fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>
                {t.invoice_nwc_label}
              </div>
              <textarea
                value={nwcString}
                onChange={(e) => setNwcString(e.target.value)}
                placeholder="nostr+walletconnect://..."
                rows={3}
                style={{
                  width: "100%",
                  background: "var(--panel2)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  color: "var(--ink)",
                  fontSize: 11,
                  fontFamily: "monospace",
                  resize: "none",
                  boxSizing: "border-box",
                  marginBottom: 8,
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={payWithNwc}
                  disabled={nwcBusy || !nwcString.trim()}
                  style={{
                    flex: 1,
                    background: nwcBusy ? "var(--panel2)" : "var(--fifa-blue)",
                    color: nwcBusy ? "var(--muted)" : "#fff",
                    border: "none",
                    padding: "9px 0",
                    borderRadius: 8,
                    fontWeight: 900,
                    fontSize: 13,
                    fontFamily: "var(--condensed)",
                    opacity: !nwcString.trim() ? 0.5 : 1,
                  }}
                >
                  {nwcBusy ? t.invoice_nwc_sending : t.invoice_nwc_pay}
                </button>
                {getNwcString() && (
                  <button
                    onClick={forgetNwc}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--line)",
                      color: "var(--muted)",
                      padding: "9px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontFamily: "var(--condensed)",
                    }}
                  >
                    {t.invoice_nwc_forget}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, fontFamily: "var(--condensed)" }}>
                {t.invoice_nwc_hint}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
