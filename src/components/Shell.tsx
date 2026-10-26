import { useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AnimatePresence, motion } from "framer-motion";
import { useT } from "../i18n";
import { useStore, View } from "../store";
import { I } from "./ui";

export function TitleBar() {
  const t = useT();
  const w = "__TAURI_INTERNALS__" in window
    ? getCurrentWindow()
    : { minimize: () => {}, toggleMaximize: () => {}, close: () => {} };
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="tb-brand" data-tauri-drag-region>
        <span className="tb-logo">D</span>
        <span data-tauri-drag-region>Decoy</span>
      </div>
      <div className="tb-btns">
        <button onClick={() => w.minimize()} aria-label={t("window.minimize")}><I.min size={15} /></button>
        <button onClick={() => w.toggleMaximize()} aria-label={t("window.maximize")}><I.max size={13} /></button>
        <button className="tb-close" onClick={() => w.close()} aria-label={t("window.close")}><I.close size={15} /></button>
      </div>
    </header>
  );
}

const NAV: { id: View; key: string; icon: (p: { size?: number }) => React.ReactNode }[] = [
  { id: "library", key: "nav.library", icon: I.library },
  { id: "favorites", key: "nav.favorites", icon: (p) => <I.star {...p} /> },
  { id: "running", key: "nav.running", icon: I.pulse },
  { id: "settings", key: "nav.settings", icon: I.settings },
];

const LAB: (typeof NAV)[number] = { id: "lab", key: "nav.lab", icon: I.flask };

export function Sidebar() {
  const t = useT();
  const { view, setView, running, discordUp, secret, setSecret, toast } = useStore();
  const taps = useRef<number[]>([]);

  const open = (id: View) => {
    setView(id);
    // secret: 10 quick taps on Settings reveal the Lab tab
    if (id !== "settings") return;
    const now = Date.now();
    taps.current = [...taps.current.filter((x) => now - x < 3000), now];
    if (taps.current.length >= 10 && !secret) {
      taps.current = [];
      setSecret(true);
      toast("ok", useStore.getState().tr("toast.labUnlocked"));
    }
  };

  return (
    <nav className="sidebar">
      <div className="nav-list">
        {(secret ? [...NAV, LAB] : NAV).map((n) => (
          <button key={n.id} className={"nav-item" + (n.id === "lab" ? " lab" : "") + (view === n.id ? " active" : "")} onClick={() => open(n.id)}>
            {view === n.id && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 600, damping: 44 }} />}
            <span className="nav-ico">{n.icon({ size: 17 })}</span>
            <span className="nav-label">{t(n.key)}</span>
            {n.id === "running" && running.length > 0 && <span className="nav-badge">{running.length}</span>}
          </button>
        ))}
      </div>
      <div className={"dstatus " + (discordUp === null ? "" : discordUp ? "up" : "down")}>
        <span className="dstatus-ico"><I.gamepad size={16} /><i /></span>
        <span className="dstatus-text">
          <b>Discord</b>
          <small>{discordUp === null ? t("discord.checking") : discordUp ? t("discord.up") : t("discord.down")}</small>
        </span>
      </div>
    </nav>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((x) => (
          <motion.div
            key={x.id}
            className={"toast " + x.kind}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ type: "spring", stiffness: 500, damping: 36 }}
            onClick={() => dismissToast(x.id)}
          >
            <span className="toast-ico">{x.kind === "error" ? <I.warn size={14} /> : <I.check size={14} />}</span>
            <span>{x.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
