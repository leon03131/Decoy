import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { mockInvoke } from "./mock";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const invoke = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> =>
  import.meta.env.DEV && !inTauri ? mockInvoke(cmd, args) : tauriInvoke<T>(cmd, args);

export interface Exe {
  name: string;
  launcher: boolean;
}

export interface Game {
  id: string;
  name: string;
  icon: string | null;
  cover: string | null;
  exes: Exe[];
}

export interface GamesPayload {
  games: Game[];
  fetchedMs: number;
  addedCount: number;
  added: string[];
  gained: string[];
}

export interface RunInfo {
  key: string;
  gameId: string;
  gameName: string;
  exe: string;
  pid: number;
  startedMs: number;
  durationS: number;
}

export const api = {
  getGames: () => invoke<GamesPayload>("get_games"),
  refreshGames: () => invoke<GamesPayload>("refresh_games"),
  launch: (a: { gameId: string; gameName: string; exe: string; minutes: number; autoStop: boolean; notify: boolean; notifyTitle: string; notifyBody: string }) =>
    invoke<RunInfo>("launch", a),
  stop: (key: string) => invoke<void>("stop", { key }),
  stopAll: () => invoke<void>("stop_all"),
  listRunning: () => invoke<RunInfo[]>("list_running"),
  discordRunning: () => invoke<boolean>("discord_running"),
  setCloseToTray: (value: boolean) => invoke<void>("set_close_to_tray", { value }),
  appInfo: () => invoke<{ version: string; portable: boolean; dataDir: string }>("app_info"),
  setTrayLabels: (show: string, stop: string, quit: string) => invoke<void>("set_tray_labels", { show, stop, quit }),
  openPath: (path: string) => invoke<void>("open_path", { path }),
  openStubsDir: () => invoke<void>("open_stubs_dir"),
  clearStubs: () => invoke<void>("clear_stubs"),
  findInstalled: (exes: string[]) => invoke<string | null>("find_installed", { exes }),
};

export const iconUrl = (g: Pick<Game, "id" | "icon">, size = 128) =>
  g.icon ? `https://cdn.discordapp.com/app-icons/${g.id}/${g.icon}.png?size=${size}` : null;

export const coverUrl = (g: Pick<Game, "id" | "cover">, size = 512) =>
  g.cover ? `https://cdn.discordapp.com/app-icons/${g.id}/${g.cover}.png?size=${size}` : null;

/** Non-launcher executables first, they are the ones Discord watches for. */
export const sortedExes = (g: Game): Exe[] =>
  [...g.exes].sort((a, b) => Number(a.launcher) - Number(b.launcher));
