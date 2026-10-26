import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { api, sortedExes } from "../api";
import { isRtl } from "../i18n-core";
import { useT } from "../i18n";
import { useStore } from "../store";
import { Cover, fmtTime, GameIcon, I, Ring, useNow } from "./ui";

const PRESETS = [5, 15, 30, 60];

export default function DetailPanel({ gameId }: { gameId: string }) {
  const t = useT();
  const slide = isRtl(useStore((s) => s.lang)) ? -48 : 48; // the panel enters from the inline-end side
  const { games, select, favorites, toggleFav, running, settings, lastExe, setLastExe, pushRecent, syncRunning, toast } = useStore();
  const game = useMemo(() => games.find((g) => g.id === gameId), [games, gameId]);
  const exes = useMemo(() => (game ? sortedExes(game) : []), [game]);

  const [exe, setExe] = useState<string>("");
  const [minutes, setMinutes] = useState(settings.minutes);
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState<string | null | undefined>(undefined);
  const now = useNow(1000);

  useEffect(() => {
    if (!game) return;
    const remembered = lastExe[game.id];
    setExe(exes.find((e) => e.name === remembered)?.name ?? exes[0]?.name ?? "");
    setMinutes(settings.minutes);
    setInstalled(undefined);
    if (exes.length) api.findInstalled(exes.map((e) => e.name)).then(setInstalled).catch(() => setInstalled(null));
    else setInstalled(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id]);

  if (!game) return null;
  const fav = favorites.includes(game.id);
  const run = running.find((r) => r.gameId === game.id && r.exe === exe);
  const anyRun = running.find((r) => r.gameId === game.id);
  const left = run ? run.durationS - (now - run.startedMs) / 1000 : 0;
  const progress = run ? 1 - left / run.durationS : 0;
  const done = !!run && left <= 0;

  const start = async () => {
    if (!exe) return;
    setBusy(true);
    try {
      await api.launch({
        gameId: game.id,
        gameName: game.name,
        exe,
        minutes,
        autoStop: settings.autoStop,
        notify: settings.notify,
        notifyTitle: t("notify.title"),
        notifyBody: t("notify.body", { name: game.name, n: minutes }),
      });
      setLastExe(game.id, exe);
      pushRecent(game.id);
      await syncRunning();
      toast("ok", t("toast.launched", { name: game.name, n: minutes }));
    } catch (e) {
      toast("error", String(e));
    } finally {
      setBusy(false);
    }
  };

  const halt = async () => {
    if (!run) return;
    await api.stop(run.key);
    await syncRunning();
    toast("info", t("toast.stopped"));
  };

  return (
    <>
      <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => select(null)} />
      <motion.aside
        className="detail"
        initial={{ x: slide, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: slide, opacity: 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 42 }}
      >
        <div className="detail-cover">
          <Cover game={game} />
          <div className="detail-fade" />
          <div className="detail-top">
            <button className="icon-btn glass" onClick={() => toggleFav(game.id)} aria-label={t("detail.favorite")} data-on={fav}><I.star size={16} filled={fav} /></button>
            <button className="icon-btn glass" onClick={() => select(null)} aria-label={t("detail.close")}><I.close size={16} /></button>
          </div>
        </div>

        <div className="detail-body">
          <div className="detail-title">
            <GameIcon game={game} size={56} radius={15} />
            <div>
              <h2>{game.name}</h2>
              <div className="hero-sub">{t("detail.id", { id: game.id })}</div>
            </div>
          </div>

          {exes.length === 0 ? (
            <div className="notice">
              <I.warn size={17} />
              <div>
                <b>{t("detail.noExe.title")}</b>
                <p>{t("detail.noExe.text")}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="field-label">{t("detail.process")}</div>
              <div className="exe-list">
                {exes.map((e) => (
                  <button key={e.name} className={"exe" + (exe === e.name ? " on" : "")} onClick={() => setExe(e.name)} disabled={!!anyRun}>
                    <span className="radio" />
                    <span className="exe-name">{e.name}</span>
                    {e.launcher && <span className="tag">{t("tag.launcher")}</span>}
                  </button>
                ))}
              </div>

              {!anyRun && (
                <>
                  <div className="field-label">{t("detail.duration")}</div>
                  <div className="presets">
                    {PRESETS.map((m) => (
                      <button key={m} className={"chip" + (minutes === m ? " on" : "")} onClick={() => setMinutes(m)}>{t("detail.minutes", { n: m })}</button>
                    ))}
                    <div className="stepper">
                      <button onClick={() => setMinutes(Math.max(1, minutes - 1))}>−</button>
                      <span>{minutes}</span>
                      <button onClick={() => setMinutes(Math.min(240, minutes + 1))}>+</button>
                    </div>
                  </div>
                </>
              )}

              {run && (
                <div className="run-box">
                  <Ring progress={progress}>
                    <div className="ring-time">{done ? t("detail.done") : fmtTime(left)}</div>
                    <div className="ring-cap">{done ? t("detail.timeUp") : t("detail.left")}</div>
                  </Ring>
                  <div className="run-note">{done ? t("detail.noteDone") : t("detail.noteRunning")}</div>
                </div>
              )}

              <div className="actions">
                {run ? (
                  <button className="btn danger big" onClick={halt}><I.stop size={14} />{t("detail.stop")}</button>
                ) : (
                  <button className="btn primary big" onClick={start} disabled={busy || !exe || !!anyRun}>
                    <I.play size={14} />{busy ? t("detail.starting") : t("detail.start")}
                  </button>
                )}
                {installed && (
                  <button className="btn ghost big" onClick={() => api.openPath(installed)}>
                    <I.folder size={16} />{t("detail.openFolder")}
                  </button>
                )}
              </div>
              {installed === undefined && <div className="hint">{t("detail.finding")}</div>}
              {installed === null && <div className="hint">{t("detail.notInstalled")}</div>}
            </>
          )}
        </div>
      </motion.aside>
    </>
  );
}
