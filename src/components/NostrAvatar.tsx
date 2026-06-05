"use client";

import { useProfile } from "@/hooks/useProfile";

export function NostrAvatar({
  pubkey,
  size = 30,
  showName = true,
  fontSize,
  nameColor,
}: {
  pubkey: string;
  size?: number;
  showName?: boolean;
  fontSize?: number;
  nameColor?: string;
}) {
  const profile = useProfile(pubkey);
  const name = profile?.name || (pubkey.slice(0, 8) + "…");
  const picture = profile?.picture;
  const fs = fontSize ?? Math.max(10, Math.floor(size * 0.38));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
      {picture ? (
        <img
          src={picture}
          alt=""
          style={{
            width: size, height: size, borderRadius: "50%",
            objectFit: "cover", flexShrink: 0,
            border: "1.5px solid var(--line)",
          }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: "50%", flexShrink: 0,
          background: "var(--panel2)", border: "1.5px solid var(--line)",
          display: "grid", placeItems: "center",
          fontSize: Math.max(9, Math.floor(size * 0.4)),
          fontWeight: 900, color: "var(--muted)",
          fontFamily: "var(--condensed)",
        }}>
          {name[0]?.toUpperCase() || "?"}
        </div>
      )}
      {showName && (
        <span style={{
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontSize: fs, fontWeight: 700,
          color: nameColor ?? "var(--ink)",
          fontFamily: "var(--condensed)",
        }}>
          {name}
        </span>
      )}
    </div>
  );
}
