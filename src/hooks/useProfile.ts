"use client";

import { useEffect, useState } from "react";
import { list } from "@/lib/pool";

export interface NostrProfile {
  name: string;
  picture: string;
  nip05: string;
}

export function useProfile(pubkey: string | null): NostrProfile | null {
  const [profile, setProfile] = useState<NostrProfile | null>(null);

  useEffect(() => {
    if (!pubkey) { setProfile(null); return; }

    list([{ kinds: [0], authors: [pubkey], limit: 1 }]).then((evs) => {
      if (!evs.length) return;
      const latest = evs.sort((a, b) => b.created_at - a.created_at)[0];
      try {
        const meta = JSON.parse(latest.content);
        setProfile({
          name:    meta.display_name || meta.name || "",
          picture: meta.picture      || "",
          nip05:   meta.nip05        || "",
        });
      } catch { /* malformed kind:0 */ }
    });
  }, [pubkey]);

  return profile;
}
