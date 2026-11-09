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
  /** start the countdown when Discord has noticed the decoy (read from Discord's local log) */
  smartTimer: boolean;
  /** look for new versions on GitHub and download them in the background */
  autoUpdate: boolean;
  /** Lab: allow more decoys than the safe maximum (Discord itself can break far above it) */
  labUnlocked: boolean;
  /** Lab: sort key of the last game launched in alphabetical order ("" = start from the beginning) */
  labLast: string;
}

/** Set when the Discord guard stopped every decoy because Discord's memory use was ballooning. */
export interface GuardEvent {
  memoryMb: number;
  growthMb: number;
  count: number;
  at: number;
}

export type UpdateStatus = "idle" | "checking" | "uptodate" | "available" | "downloading" | "ready" | "installing" | "error";

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  notes?: string | null;
  /** 0..1 while downloading (undefined when the size is unknown) */
  progress?: number;
  error?: string;
  checkedMs?: number;
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
  /** an update the user postponed with "Later": its banner stays hidden */
  dismissedUpdate: string | null;
  // session
  update: UpdateState;
  guard: GuardEvent | null;
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
  checkUpdate: (manual?: boolean) => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  tripGuard: (e: Omit<GuardEvent, "at">) => void;
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
      // 16, not 15: quests ask for 15 minutes of play, and Discord needs up to a minute to notice a new game
      settings: { minutes: 16, autoStop: true, notify: true, closeToTray: true, showNoExe: false, smartTimer: true, autoUpdate: true, labUnlocked: false, labLast: "" },
      dismissedUpdate: null,
      update: { status: "idle" },
      guard: null,
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

      // ---- updates (signed, from GitHub releases; see src-tauri/src/update.rs)
      checkUpdate: async (manual = false) => {
        const busy = get().update.status;
        if (busy === "checking" || busy === "downloading" || busy === "installing") return;
        const { tr, toast } = get();
        set({ update: { ...get().update, status: "checking", error: undefined } });
        try {
          const info = await api.checkUpdate();
          if (!info) {
            set({ update: { status: "uptodate", checkedMs: Date.now() } });
            if (manual) toast("ok", tr("update.uptodate"));
            return;
          }
          const base = { version: info.version, notes: info.notes, checkedMs: Date.now() };
          if (info.ready) {
            set({ update: { ...base, status: "ready", progress: 1 } });
          } else if (get().settings.autoUpdate || manual) {
            set({ update: { ...base, status: "downloading", progress: 0 } });
            await get().downloadUpdate();
          } else {
            set({ update: { ...base, status: "available" } });
          }
        } catch (e) {
          set({ update: { status: "error", error: String(e), checkedMs: Date.now() } });
          if (manual) toast("error", tr("update.error", { e: String(e) }));
        }
      },

      downloadUpdate: async () => {
        const cur = get().update;
        set({ update: { ...cur, status: "downloading", progress: cur.progress ?? 0 } });
        try {
          await api.downloadUpdate();
          set((s) => ({ update: { ...s.update, status: "ready", progress: 1 } }));
        } catch (e) {
          set((s) => ({ update: { ...s.update, status: "error", error: String(e) } }));
          get().toast("error", get().tr("update.error", { e: String(e) }));
        }
      },

      installUpdate: async () => {
        set((s) => ({ update: { ...s.update, status: "installing" } }));
        try {
          await api.installUpdate(); // the app restarts; this only returns on failure
        } catch (e) {
          set((s) => ({ update: { ...s.update, status: "error", error: String(e) } }));
          get().toast("error", get().tr("update.error", { e: String(e) }));
        }
      },

      dismissUpdate: () => set((s) => ({ dismissedUpdate: s.update.version ?? null })),

      tripGuard: (e) => {
        set({ guard: { ...e, at: Date.now() } });
        get().toast("error", get().tr("guard.tripped", { gb: (e.memoryMb / 1024).toFixed(1), grew: (e.growthMb / 1024).toFixed(1) }));
        void get().syncRunning();
      },
    }),
    {
      name: "decoy-state",
      version: 2,
      // v1 -> v2: the default duration became 16 minutes (quests need 15, Discord needs up to a minute to notice the game)
      migrate: (persisted, version) => {
        const s = persisted as { settings?: Partial<Settings> } | undefined;
        if (s?.settings) {
          if (version < 2 && s.settings.minutes === 15) s.settings.minutes = 16;
          s.settings = { smartTimer: true, autoUpdate: true, labLast: "", ...s.settings };
        }
        return persisted as never;
      },
      partialize: (s) => ({ favorites: s.favorites, recent: s.recent, lastExe: s.lastExe, settings: s.settings, viewMode: s.viewMode, lang: s.lang, secret: s.secret, dismissedUpdate: s.dismissedUpdate }),
    },
  ),
);
