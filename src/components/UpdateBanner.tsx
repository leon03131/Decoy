import { AnimatePresence, motion } from "framer-motion";
import { api } from "../api";
import { useT } from "../i18n";
import { useStore } from "../store";
import { I } from "./ui";

const RELEASE_URL = "https://github.com/leon03131/Decoy/releases/tag/v";

/** Strip above the page: a new version was found, is downloading, or is ready to install. */
export default function UpdateBanner() {
  const t = useT();
  const { update, dismissedUpdate, dismissUpdate, installUpdate, downloadUpdate, running } = useStore();
  const { status, version, progress } = update;
  const visible =
    !!version && version !== dismissedUpdate && (status === "available" || status === "downloading" || status === "ready" || status === "installing");

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          className="update-banner"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="update-row">
            <span className="update-ico"><I.download size={17} /></span>
            <div className="update-text">
              <b>
                {status === "ready" || status === "installing"
                  ? t("update.ready", { v: version! })
                  : status === "downloading"
                    ? t("update.downloading", { v: version!, p: Math.round((progress ?? 0) * 100) })
                    : t("update.available", { v: version! })}
              </b>
              {status === "ready" && running.length > 0 && <small>{t("update.running", { n: running.length })}</small>}
              {status === "installing" && <small>{t("update.installing")}</small>}
            </div>
            <div className="update-actions">
              <button className="btn ghost sm" onClick={() => api.openUrl(RELEASE_URL + version).catch(() => {})}>{t("update.notes")}</button>
              {status === "available" && <button className="btn primary sm" onClick={() => void downloadUpdate()}>{t("update.download")}</button>}
              {status === "ready" && <button className="btn primary sm" onClick={() => void installUpdate()}>{t("update.restart")}</button>}
              {status !== "installing" && <button className="btn ghost sm" onClick={dismissUpdate}>{t("update.later")}</button>}
            </div>
          </div>
          {status === "downloading" && (
            <div className="update-bar"><i style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} /></div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
