"use client";

import { useCallback, useEffect, useState } from "react";
import {
  hasNip07,
  loginLocal,
  loginNip07,
  logoutLocal,
  clearPersistedMode,
  getPersistedMode,
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
          clearPersistedMode(); // extensión no disponible, limpiar
        }
      };
      tryNip07();
    } else if (mode === "local" || localStorage.getItem("figus:sk")) {
      try {
        setIdentity(loginLocal());
      } catch {
        /* noop */
      }
    }
  }, []);

  const connectNip07 = useCallback(async () => {
    const id = await loginNip07();
    setIdentity(id);
  }, []);

  const connectLocal = useCallback(() => {
    setIdentity(loginLocal());
  }, []);

  const logout = useCallback(() => {
    if (identity?.mode === "local") logoutLocal();
    else clearPersistedMode();
    setIdentity(null);
  }, [identity]);

  return { identity, nip07Available, connectNip07, connectLocal, logout };
}
