"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { type Lang, type Translations, getTranslations } from "@/lib/i18n";

interface LangCtx {
  lang: Lang;
  t: Translations;
  toggle: () => void;
}

const LangContext = createContext<LangCtx>({
  lang: "es",
  t: getTranslations("es"),
  toggle: () => {},
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("es");

  useEffect(() => {
    const saved = localStorage.getItem("figus:lang") as Lang | null;
    if (saved === "en" || saved === "es") setLang(saved);
  }, []);

  function toggle() {
    setLang((prev) => {
      const next: Lang = prev === "es" ? "en" : "es";
      localStorage.setItem("figus:lang", next);
      return next;
    });
  }

  return (
    <LangContext.Provider value={{ lang, t: getTranslations(lang), toggle }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
