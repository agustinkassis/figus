"use client";

import { useState } from "react";
import { getNwcString, saveNwcString, clearNwcString, parseNwc } from "@/lib/nwc";

function maskNwc(str: string): string {
  // nostr+walletconnect://XXXX…XXXX — keep scheme + first 8 chars of pubkey + last 6
  const pfx = "nostr+walletconnect://";
  const body = str.startsWith(pfx) ? str.slice(pfx.length) : str;
  return `${pfx}${body.slice(0, 8)}${"•".repeat(12)}${body.slice(-6)}`;
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const current = getNwcString();
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(!current);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function copyNwc() {
    if (!current) return;
    navigator.clipboard.writeText(current);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function save() {
    const str = input.trim();
    if (!str) {
      clearNwcString();
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
      return;
    }
    if (!str.startsWith("nostr+walletconnect://")) {
      setError("Debe comenzar con nostr+walletconnect://");
      return;
    }
    try {
      parseNwc(str);
      saveNwcString(str);
      setError(null);
      setInput("");
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function clear() {
    clearNwcString();
    setInput("");
    setEditing(false);
    setSaved(false);
  }

  const hasNwc = Boolean(getNwcString());

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(3,11,24,.92)",
        backdropFilter: "blur(8px)",
        display: "grid", placeItems: "center",
        zIndex: 50, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 20,
          padding: "24px 20px",
          maxWidth: 400, width: "100%",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontFamily: "var(--condensed)", fontWeight: 900, letterSpacing: 2, color: "var(--gold)" }}>
            CONFIGURACIÓN
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}
          >
            ✕
          </button>
        </div>

        {/* NWC label */}
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)", fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>
          NOSTR WALLET CONNECT (NWC)
        </div>

        {/* ── View mode (NWC saved, not editing) ── */}
        {hasNwc && !editing && (
          <div>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--panel2)", borderRadius: 8,
              padding: "10px 12px", marginBottom: 12,
            }}>
              <div style={{
                flex: 1, fontFamily: "monospace", fontSize: 11,
                color: "var(--gold)", wordBreak: "break-all", lineHeight: 1.4,
              }}>
                {maskNwc(getNwcString()!)}
              </div>
              <button
                onClick={copyNwc}
                title="Copiar cadena NWC"
                style={{
                  background: copied ? "var(--panel)" : "var(--fifa-blue)",
                  border: "none", color: "#fff",
                  padding: "6px 10px", borderRadius: 7,
                  fontSize: 11, fontFamily: "var(--condensed)", fontWeight: 900,
                  flexShrink: 0, whiteSpace: "nowrap",
                }}
              >
                {copied ? "✅" : "📋 COPIAR"}
              </button>
            </div>

            {saved && (
              <div style={{ fontSize: 11, color: "var(--gold)", fontFamily: "var(--condensed)", marginBottom: 10, textAlign: "center" }}>
                ✅ Guardado
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setEditing(true); setInput(""); }}
                style={{
                  flex: 1, background: "var(--fifa-blue)", color: "#fff",
                  border: "none", padding: "9px 0", borderRadius: 8,
                  fontWeight: 900, fontSize: 13, fontFamily: "var(--condensed)",
                }}
              >
                CAMBIAR
              </button>
              <button
                onClick={clear}
                style={{
                  background: "transparent", border: "1px solid var(--line)",
                  color: "var(--muted)", padding: "9px 14px", borderRadius: 8,
                  fontSize: 12, fontFamily: "var(--condensed)", fontWeight: 700,
                }}
              >
                BORRAR
              </button>
            </div>
          </div>
        )}

        {/* ── Edit mode (no NWC or clicking CAMBIAR) ── */}
        {(!hasNwc || editing) && (
          <div>
            {!hasNwc && (
              <div style={{ fontSize: 11, color: "var(--muted)", background: "var(--panel2)", borderRadius: 8, padding: "7px 10px", marginBottom: 10, fontFamily: "var(--condensed)" }}>
                Sin wallet configurada — los pagos se harán con QR
              </div>
            )}

            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(null); }}
              placeholder="nostr+walletconnect://..."
              rows={4}
              autoFocus
              style={{
                width: "100%", background: "var(--panel2)",
                border: `1px solid ${error ? "#cc2244" : "var(--line)"}`,
                borderRadius: 8, padding: "8px 10px",
                color: "var(--ink)", fontSize: 11, fontFamily: "monospace",
                resize: "none", boxSizing: "border-box", marginBottom: error ? 6 : 10,
              }}
            />

            {error && (
              <div style={{ fontSize: 11, color: "#cc2244", marginBottom: 10, fontFamily: "var(--condensed)" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={save}
                style={{
                  flex: 1, background: "var(--fifa-blue)", color: "#fff",
                  border: "none", padding: "10px 0", borderRadius: 8,
                  fontWeight: 900, fontSize: 13, fontFamily: "var(--condensed)",
                  letterSpacing: 0.5,
                }}
              >
                GUARDAR
              </button>
              {editing && hasNwc && (
                <button
                  onClick={() => { setEditing(false); setError(null); setInput(""); }}
                  style={{
                    background: "transparent", border: "1px solid var(--line)",
                    color: "var(--muted)", padding: "10px 14px", borderRadius: 8,
                    fontSize: 12, fontFamily: "var(--condensed)", fontWeight: 700,
                  }}
                >
                  CANCELAR
                </button>
              )}
            </div>
          </div>
        )}

        <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 14, marginBottom: 0, fontFamily: "var(--condensed)", lineHeight: 1.6 }}>
          Encontrás tu cadena NWC en Alby Hub, Primal, Mutiny, Wallet of Satoshi u otras wallets compatibles con NIP-47.
        </p>
      </div>
    </div>
  );
}
