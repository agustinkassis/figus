"use client";

import { useState } from "react";
import type { Identity } from "@/lib/identity";
import { shareNote } from "@/lib/share";
import { useLang } from "@/contexts/LangContext";

export function ShareButton({
  content,
  identity,
  tags = [],
  style,
}: {
  content: string;
  identity: Identity;
  tags?: string[][];
  style?: React.CSSProperties;
}) {
  const { t } = useLang();
  const [status, setStatus] = useState<"idle" | "sharing" | "done" | "error">("idle");

  async function handleShare() {
    if (status !== "idle" && status !== "error") return;
    setStatus("sharing");
    try {
      await shareNote(content, identity, tags);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  const label =
    status === "sharing" ? t.share_sending :
    status === "done"    ? t.share_sent :
    status === "error"   ? t.share_error :
    t.share_btn;

  return (
    <button
      onClick={handleShare}
      disabled={status === "sharing" || status === "done"}
      style={{
        background: status === "done"
          ? "rgba(34,197,94,.15)"
          : "rgba(139,92,246,.15)",
        border: `1px solid ${status === "done" ? "rgba(34,197,94,.4)" : "rgba(139,92,246,.4)"}`,
        color: status === "done" ? "rgb(34,197,94)" : "rgb(167,139,250)",
        padding: "8px 16px",
        borderRadius: 8,
        fontWeight: 900,
        fontSize: 11,
        fontFamily: "var(--condensed)",
        letterSpacing: 0.5,
        cursor: status === "sharing" || status === "done" ? "default" : "pointer",
        transition: "all .2s",
        ...style,
      }}
    >
      {label}
    </button>
  );
}
