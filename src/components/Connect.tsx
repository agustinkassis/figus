"use client";

import { useState } from "react";
import type { Identity } from "@/lib/identity";
import { useProfile } from "@/hooks/useProfile";
import { useLang } from "@/contexts/LangContext";

export function Connect({
  identity,
  nip07Available,
  onNip07,
  onLocal,
  onLogout,
}: {
  identity: Identity | null;
  nip07Available: boolean;
  onNip07: () => void;
  onLocal: () => void;
  onLogout: () => void;
}) {
  const { t } = useLang();
  const profile = useProfile(identity?.pubkey ?? null);
  const [imgError, setImgError] = useState(false);

  if (identity) {
    const displayName = profile?.name
      ? profile.name.length > 16
        ? profile.name.slice(0, 16) + "…"
        : profile.name
      : identity.pubkey.slice(0, 8) + "…";

    const initials = profile?.name
      ? profile.name.slice(0, 2).toUpperCase()
      : identity.pubkey.slice(0, 2).toUpperCase();

    const showImg = profile?.picture && !imgError;

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Avatar + name */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {/* Avatar circle */}
          <div style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            overflow: "hidden",
            border: "1.5px solid var(--gold)",
            flexShrink: 0,
            background: "var(--panel2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            {showImg ? (
              <img
                src={profile!.picture}
                alt=""
                width={30}
                height={30}
                style={{ objectFit: "cover", width: "100%", height: "100%", display: "block" }}
                onError={() => setImgError(true)}
              />
            ) : (
              <span style={{ fontSize: 11, fontWeight: 900, color: "var(--gold)", fontFamily: "var(--condensed)" }}>
                {initials}
              </span>
            )}
          </div>

          {/* Name */}
          <span style={{
            fontSize: 12,
            color: "var(--ink)",
            fontFamily: "var(--condensed)",
            fontWeight: 700,
            letterSpacing: 0.3,
            maxWidth: 120,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}>
            {displayName}
          </span>
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          style={{
            background: "transparent",
            border: "1px solid var(--line)",
            color: "var(--muted)",
            padding: "5px 10px",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "var(--condensed)",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {t.logout}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {nip07Available && (
        <button
          onClick={onNip07}
          style={{
            background: "linear-gradient(135deg,var(--grass),var(--pitch))",
            color: "#fff",
            border: 0,
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {t.connect_ext}
        </button>
      )}
      <button
        onClick={onLocal}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--gold)",
          color: "var(--gold)",
          padding: "8px 14px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {t.connect_local}
      </button>
    </div>
  );
}
