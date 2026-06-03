"use client";

import { useCallback, useEffect, useState } from "react";
import {
  hasNip07,
  loginLocal,
  loginNip07,
  loginNip46Bunker,
  loginNip46QR,
  restoreNip46,
  logoutLocal,
  clearPersistedMode,
  getPersistedMode,
  importLocalNsec,
  type Identity,
} from "@/lib/identity";

export function useIdentity() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [nip07Available, setNip07Available] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setNip07Available(hasNip07());

    const mode = getPersistedMode();

    if (mode === "nip07") {
      // Las extensiones NIP-07 a veces inyectan window.nostr con un pequeño delay
      const tryNip07 = async (attempts = 0) => {
        if (hasNip07()) {
          try {
            setIdentity(await loginNip07());
          } catch {
            clearPersistedMode();
          }
        } else if (attempts < 10) {
          setTimeout(() => tryNip07(attempts + 1), 200);
        } else {
          clearPersistedMode();
        }
      };
      tryNip07();
    } else if (mode === "local" || localStorage.getItem("figus:sk")) {
      try {
        setIdentity(loginLocal());
      } catch {
        /* noop */
      }
    } else if (mode === "nip46") {
      restoreNip46()
        .then((id) => {
          if (id) setIdentity(id);
          else clearPersistedMode();
        })
        .catch(() => clearPersistedMode());
    }
  }, []);

  const connectNip07 = useCallback(async () => {
    const id = await loginNip07();
    setIdentity(id);
  }, []);

  const connectLocal = useCallback(() => {
    setIdentity(loginLocal());
  }, []);

  const connectNip46Bunker = useCallback(
    async (url: string, onauth?: (authUrl: string) => void) => {
      const id = await loginNip46Bunker(url, onauth);
      setIdentity(id);
    },
    []
  );

  const connectNip46QR = useCallback(
    async (
      onQR: (uri: string, dataUrl: string, expiresAt: number) => void,
      onauth?: (authUrl: string) => void,
      signal?: AbortSignal
    ) => {
      const id = await loginNip46QR(onQR, onauth, signal);
      setIdentity(id);
    },
    []
  );

  const logout = useCallback(() => {
    if (identity?.mode === "local") logoutLocal();
    else clearPersistedMode();
    setIdentity(null);
  }, [identity]);

  const importNsec = useCallback((raw: string) => {
    const id = importLocalNsec(raw);
    setIdentity(id);
  }, []);

  return {
    identity,
    nip07Available,
    connectNip07,
    connectLocal,
    connectNip46Bunker,
    connectNip46QR,
    logout,
    importNsec,
  };
}
