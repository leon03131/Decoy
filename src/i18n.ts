import { useCallback } from "react";
import { translate, Vars } from "./i18n-core";
import { useStore } from "./store";

export { languages } from "./i18n-core";

/** `const t = useT(); t("nav.library")` — re-renders the component when the language (or its file) changes. */
export function useT() {
  const lang = useStore((s) => s.lang);
  const rev = useStore((s) => s.langRev);
  // `rev` is only a dependency: it changes when a language file finishes loading
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((key: string, vars?: Vars) => translate(lang, key, vars), [lang, rev]);
}

/** BCP-47 tag for Intl / toLocaleString. */
export const useLocale = () => useStore((s) => s.lang);
