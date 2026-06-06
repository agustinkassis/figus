"use client";

import { useState } from "react";
import type { Identity } from "@/lib/identity";
import { shareNote, captureElement, uploadImage } from "@/lib/share";
import { useLang } from "@/contexts/LangContext";

type Status = "idle" | "capturing" | "uploading" | "sharing" | "done" | "error";

export function ShareButton({
  content,
  identity,
  tags = [],
  style,
  cardRef,
}: {
  content: string;
  identity: Identity;
  tags?: string[][];
  style?: React.CSSProperties;
  cardRef?: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useLang();
  const [status, setStatus] = useState<Status>("idle");
  const busy = status === "capturing" || status === "uploading" || status === "sharing";

  async function handleShare() {
    if (busy || status === "done") return;

    let finalContent = content;
    let finalTags = tags;

    if (cardRef?.current) {
      try {
        setStatus("capturing");
        const blob = await captureElement(cardRef.current);
        setStatus("uploading");
        const imageUrl = await uploadImage(blob, identity);
        finalContent = `${content}\n\n${imageUrl}`;
        finalTags = [...tags, ["imeta", `url ${imageUrl}`, "m image/png"]];
      } catch {
        // Upload failed — publish text-only note
        finalContent = content;
        finalTags = tags;
      }
    }

    setStatus("sharing");
    try {
      await shareNote(finalContent, identity, finalTags);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  const label =
    status === "capturing" ? "📸 Capturando..." :
    status === "uploading"  ? "⬆ Subiendo imagen..." :
    status === "sharing"    ? t.share_sending :
    status === "done"       ? t.share_sent :
    status === "error"      ? t.share_error :
    t.share_btn;

  return (
    <button
      onClick={handleShare}
      disabled={busy || status === "done"}
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
        cursor: busy || status === "done" ? "default" : "pointer",
        transition: "all .2s",
        ...style,
      }}
    >
      {label}
    </button>
  );
}
