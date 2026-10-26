import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, Game, RunInfo } from "./api";
import { detectLang, loadLanguage, translate, Vars } from "./i18n-core";

export type View = "library" | "favorites" | "running" | "settings" | "lab";

export interface Settings {
  minutes: number;
  autoStop: boolean;
  notify: boolean;
  closeToTray: boolean;
  showNoExe: boolean;
}

export interface Toast {
  id: number;
  kind: "ok" | "info" | "error";
  text: string;
}

/** Game with a precomputed lowercase haystack for fast search. */
export interface IndexedGame extends Game {
  hay: string;
  nameLc: string;
}

interface State {
  // persisted
  favorites: string[];
  recent: string[];
  lastExe: Record<string, string>;
  settings: Settings;
  viewMode: "grid" | "list";
  lang: string;
  secret: boolean;
  // session
  /** bumped when a language file finishes loading, so translated text re-renders */
  langRev: number;
  games: IndexedGame[];
  fetchedMs: number;
  loading: boolean;
  refreshing: boolean;
  view: View;
  query: string;
  selectedId: string | null;
  running: RunInfo[];
  discordUp: boolean | null;
  toasts: Toast[];

  setView: (v: View) => void;
  setViewMode: (m: "grid" | "list") => void;
  setLang: (code: string) => void;
  setSecret: (v: boolean) => void;
  tr: (key: string, vars?: Vars) => string;
  setQuery: (q: string) => void;
  select: (id: string | null) => void;
  toggleFav: (id: string) => void;
  setSettings: (p: Partial<Settings>) => void;
  setLastExe: (gameId: string, exe: string) => void;
  pushRecent: (id: string) => void;
  toast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: number) => void;
  loadGames: () => Promise<void>;
  refreshGames: () => Promise<void>;
  syncRunning: () => Promise<void>;
  setDiscordUp: (v: boolean) => void;
}

const index = (games: Game[]): IndexedGame[] =>
  games
    .map((g) => ({
      ...g,
      nameLc: g.name.toLowerCase(),
      hay: (g.name + " " + g.exes.map((e) => e.name).join(" ")).toLowerCase(),
    }))
    // games with usable executables first, then alphabetical (already sorted by the backend)
    .sort((a, b) => Number(b.exes.length > 0) - Number(a.exes.length > 0));

let toastId = 1;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      favorites: [],
      recent: [],
      lastExe: {},
      settings: { minutes: 15, autoStop: true, notify: true, closeToTray: true, showNoExe: false },
      viewMode: "grid",
      lang: detectLang(),
      secret: false,
      langRev: 0,
      games: [],
      fetchedMs: 0,
      loading: true,
      refreshing: false,
      view: "library",
      query: "",
      selectedId: null,
      running: [],
      discordUp: null,
      toasts: [],

      setView: (view) => set({ view, selectedId: null }),
      setViewMode: (viewMode) => set({ viewMode }),
      // switch only once the file is in memory, so the UI never flashes through English
      setLang: (lang) => {
        void loadLanguage(lang).then(() => set((s) => ({ lang, langRev: s.langRev + 1 })));
      },
      setSecret: (secret) => set({ secret }),
      tr: (key, vars) => translate(get().lang, key, vars),
      setQuery: (query) => set({ query }),
      select: (selectedId) => set({ selectedId }),
      toggleFav: (id) =>
        set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [...s.favorites, id] })),
      setSettings: (p) => {
        const settings = { ...get().settings, ...p };
        set({ settings });
        if (p.closeToTray !== undefined) api.setCloseToTray(p.closeToTray).catch(() => {});
      },
      setLastExe: (gameId, exe) => set((s) => ({ lastExe: { ...s.lastExe, [gameId]: exe } })),
      pushRecent: (id) => set((s) => ({ recent: [id, ...s.recent.filter((x) => x !== id)].slice(0, 30) })),
      toast: (kind, text) => {
        const id = toastId++;
        set((s) => ({ toasts: [...s.toasts, { id, kind, text }].slice(-4) }));
        setTimeout(() => get().dismissToast(id), kind === "error" ? 7000 : 4500);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      loadGames: async () => {
        set({ loading: true });
        try {
          const p = await api.getGames();
          set({ games: index(p.games), fetchedMs: p.fetchedMs, loading: false });
          // refresh in the background when the cache is older than a day
          if (Date.now() - p.fetchedMs > 24 * 3600 * 1000) get().refreshGames();
        } catch (e) {
          set({ loading: false });
          get().toast("error", String(e));
        }
      },

      refreshGames: async () => {
        if (get().refreshing) return;
        set({ refreshing: true });
        try {
          const p = await api.refreshGames();
          set({ games: index(p.games), fetchedMs: p.fetchedMs, refreshing: false });
          const { tr } = get();
          if (p.gained.length)
            get().toast("ok", tr("toast.refreshGained", { n: p.gained.length, names: p.gained.slice(0, 3).join(", ") + (p.gained.length > 3 ? "…" : "") }));
          else if (p.addedCount) get().toast("ok", tr("toast.refreshAdded", { n: p.addedCount }));
          else get().toast("info", tr("toast.refreshUpToDate"));
        } catch (e) {
          set({ refreshing: false });
          get().toast("error", String(e));
        }
      },

      syncRunning: async () => {
        try {
          set({ running: await api.listRunning() });
        } catch {
          /* backend not ready */
        }
      },
      setDiscordUp: (discordUp) => set({ discordUp }),
    }),
    {
      name: "decoy-state",
      partialize: (s) => ({ favorites: s.favorites, recent: s.recent, lastExe: s.lastExe, settings: s.settings, viewMode: s.viewMode, lang: s.lang, secret: s.secret }),
    },
  ),
);
