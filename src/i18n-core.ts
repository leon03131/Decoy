// Languages are plain JSON files in src/locales (one file per language, file name = language code).
// Dropping a new xx.json there is all it takes to add a language: no code changes needed.
//
// Only English and Russian ship in the main bundle. Every other language is its own small chunk that is fetched
// when the language is selected, so 170+ languages cost nothing at startup.

import available from "virtual:languages";
import en from "./locales/en.json";
import ru from "./locales/ru.json";

type Dict = Record<string, string>;
type Meta = { name?: string; rtl?: boolean };

// every other language: one small chunk each, fetched when it is selected
const loaders = import.meta.glob(["./locales/*.json", "!./locales/en.json", "!./locales/ru.json"], {
  import: "default",
}) as Record<string, () => Promise<Dict & { _meta?: Meta }>>;

const dicts: Record<string, Dict> = {};
const strip = ({ _meta, ...rest }: Dict & { _meta?: Meta }): Dict => rest as Dict;
dicts.en = strip(en as unknown as Dict & { _meta?: Meta });
dicts.ru = strip(ru as unknown as Dict & { _meta?: Meta });

export interface Language {
  code: string;
  name: string;
  rtl: boolean;
  /** English name, used to find a language by typing it ("German" finds "Deutsch"). */
  english: string;
}

let displayNames: Intl.DisplayNames | null = null;
try {
  displayNames = new Intl.DisplayNames(["en"], { type: "language" });
} catch {
  /* Intl.DisplayNames is missing in very old engines: search just uses the native name */
}
const englishName = (code: string) => {
  try {
    const n = displayNames?.of(code);
    return n && n !== code ? n : "";
  } catch {
    return "";
  }
};

export const languages: Language[] = available
  .map((l) => ({ ...l, english: englishName(l.code) }))
  .sort((a, b) => (a.english || a.name).localeCompare(b.english || b.name, "en"));

export type Vars = Record<string, string | number>;

const loading = new Map<string, Promise<void>>();

/** Fetches a language's dictionary (cached). Resolves immediately for languages that are already loaded. */
export function loadLanguage(code: string): Promise<void> {
  if (dicts[code]) return Promise.resolve();
  const key = `./locales/${code}.json`;
  const load = loaders[key];
  if (!load) return Promise.resolve();
  let p = loading.get(code);
  if (!p) {
    p = load()
      .then((d) => {
        dicts[code] = strip(d);
      })
      .catch(() => {
        /* offline chunk missing: keep falling back to English */
      })
      .finally(() => loading.delete(code));
    loading.set(code, p);
  }
  return p;
}

/** Looks the key up in the chosen language, then English, then Russian, finally returns the key itself. */
export function translate(lang: string, key: string, vars?: Vars): string {
  let s = dicts[lang]?.[key] ?? dicts.en?.[key] ?? dicts.ru?.[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));
  return s;
}

export function detectLang(): string {
  const nav = (typeof navigator !== "undefined" ? navigator.language : "en").toLowerCase();
  const exact = languages.find((l) => l.code.toLowerCase() === nav);
  if (exact) return exact.code;
  const base = nav.split("-")[0];
  return languages.find((l) => l.code.toLowerCase() === base)?.code
    ?? languages.find((l) => l.code.toLowerCase().split("-")[0] === base)?.code
    ?? "en";
}

export const isRtl = (lang: string) => languages.find((l) => l.code === lang)?.rtl ?? false;
