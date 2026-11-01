import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence } from "framer-motion";
import { api } from "./api";
import { isRtl, loadLanguage } from "./i18n-core";
import { useStore } from "./store";
import { Sidebar, TitleBar, Toasts } from "./components/Shell";
import Library from "./components/Library";
import DetailPanel from "./components/DetailPanel";
import UpdateBanner from "./components/UpdateBanner";
import { LabView, RunningView, SettingsView } from "./components/Views";

export default function App() {
  const { view, selectedId, loadGames, syncRunning, setDiscordUp, toast, select, lang, langRev } = useStore();

  // the language saved from the last run is not loaded yet (only en/ru ship in the main bundle)
  useEffect(() => {
    void loadLanguage(useStore.getState().lang).then(() => useStore.setState((s) => ({ langRev: s.langRev + 1 })));
  }, []);

  // keep <html lang/dir> in sync with the chosen language
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? "rtl" : "ltr";
    const tr = useStore.getState().tr;
    api.setTrayLabels(tr("tray.show"), tr("tray.stop"), tr("tray.quit")).catch(() => {});
  }, [lang, langRev]);

  useEffect(() => {
    loadGames();
    syncRunning();
    api.setCloseToTray(useStore.getState().settings.closeToTray).catch(() => {});

    const checkDiscord = () => api.discordRunning().then(setDiscordUp).catch(() => {});
    checkDiscord();
    // with thousands of decoys running the list is large, so it is refreshed less often
    let t1: ReturnType<typeof setTimeout>;
    const pollRunning = () => {
      void syncRunning().finally(() => {
        t1 = setTimeout(pollRunning, useStore.getState().running.length > 300 ? 15000 : 4000);
      });
    };
    t1 = setTimeout(pollRunning, 4000);
    const t2 = setInterval(checkDiscord, 10000);

    // updates: look shortly after start, then every 6 hours (the setting is read each time)
    const maybeCheck = () => {
      if (useStore.getState().settings.autoUpdate) void useStore.getState().checkUpdate(false);
    };
    const t3 = setTimeout(maybeCheck, 5000);
    const t4 = setInterval(maybeCheck, 6 * 3600 * 1000);

    let lastDone = 0;
    const subs = "__TAURI_INTERNALS__" in window
      ? [
          listen<string>("run-finished", () => {
            // a batch can finish all at once: show the toast only once per few seconds
            if (Date.now() - lastDone > 5000) toast("ok", useStore.getState().tr("toast.timeUp"));
            lastDone = Date.now();
            syncRunning();
          }),
          listen("run-stopped", () => syncRunning()),
          listen("run-detected", () => syncRunning()),
          listen<{ downloaded: number; total: number | null }>("update-progress", (e) => {
            const { downloaded, total } = e.payload;
            useStore.setState((s) => ({ update: { ...s.update, progress: total ? Math.min(1, downloaded / total) : undefined } }));
          }),
        ]
      : [];

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useStore.getState().setView("library");
        setTimeout(() => document.getElementById("search")?.focus(), 30);
      } else if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      clearTimeout(t1);
      clearInterval(t2);
      clearTimeout(t3);
      clearInterval(t4);
      window.removeEventListener("keydown", onKey);
      subs.forEach((p) => p.then((un) => un()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <TitleBar />
      <div className="body">
        <Sidebar />
        <main className="main">
          <UpdateBanner />
          {view === "library" && <Library />}
          {view === "favorites" && <Library favOnly />}
          {view === "running" && <RunningView />}
          {view === "settings" && <SettingsView />}
          {view === "lab" && <LabView />}
          <AnimatePresence>{selectedId && (view === "library" || view === "favorites" || view === "running") && <DetailPanel key={selectedId} gameId={selectedId} />}</AnimatePresence>
        </main>
      </div>
      <Toasts />
    </div>
  );
}
