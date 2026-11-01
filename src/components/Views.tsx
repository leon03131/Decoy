import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api, sortedExes } from "../api";
import { languages } from "../i18n-core";
import { useT } from "../i18n";
import { useStore } from "../store";
import Select from "./Select";
import { Cover, fmtTime, GameIcon, I, Ring, runClock, useNow } from "./ui";

/** With thousands of decoys running only the first ones are drawn; the rest are summarised. */
const RUNNING_SHOWN = 120;

export function RunningView() {
  const t = useT();
  const { running, games, syncRunning, select, toast } = useStore();
  const now = useNow(1000);
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const shown = running.length > RUNNING_SHOWN ? running.slice(0, RUNNING_SHOWN) : running;

  return (
    <section className="page">
      <div className="page-head row">
        <div>
          <h1>{t("running.title")}</h1>
          <p>{running.length ? t("running.count", { n: running.length.toLocaleString() }) : t("running.none")}</p>
        </div>
        {running.length > 0 && (
          <button
            className="btn danger"
            onClick={async () => {
              await api.stopAll();
              await syncRunning();
              toast("info", t("toast.allStopped"));
            }}
          >
            <I.stop size={13} />{t("running.stopAll")}
          </button>
        )}
      </div>

      {running.length === 0 ? (
        <div className="empty">
          <div className="empty-ico"><I.pulse size={26} /></div>
          <h3>{t("running.empty.title")}</h3>
          <p>{t("running.empty.text")}</p>
        </div>
      ) : (
        <>
          <div className="run-grid">
            {shown.map((r) => {
              const clock = runClock(r, now);
              const g = byId.get(r.gameId);
              return (
                <motion.div key={r.key} layout={shown.length < 40} className="run-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  {g && <Cover game={g} className="run-bg" />}
                  <div className="run-veil" />
                  <Ring progress={clock.progress} size={92} stroke={6} waiting={clock.phase === "waiting"}>
                    <div className="ring-time sm">{clock.phase === "waiting" ? "…" : clock.phase === "done" ? "✓" : fmtTime(clock.left)}</div>
                  </Ring>
                  <div className="run-meta">
                    <div className="run-title" onClick={() => g && select(g.id)}>
                      {g && <GameIcon game={g} size={26} radius={8} />}
                      <span>{r.gameName}</span>
                    </div>
                    <div className="run-exe">
                      {r.exe} · PID {r.pid}
                      {r.smart && clock.phase === "waiting" && <> · {t("detail.waiting")}</>}
                      {r.detected && <> · ✓ {t("detail.detected")}</>}
                    </div>
                    <button
                      className="btn danger sm"
                      onClick={async () => {
                        await api.stop(r.key);
                        await syncRunning();
                      }}
                    >
                      <I.stop size={11} />{t("running.stop")}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
          {running.length > RUNNING_SHOWN && <p className="run-more">{t("running.more", { n: (running.length - RUNNING_SHOWN).toLocaleString() })}</p>}
        </>
      )}
    </section>
  );
}

// measured with 300 real decoys: about 1.6 MB of RAM each (process + window); rounded up
const MB_PER_DECOY = 2;
const LAB_PRESETS = [10, 50, 100, 500, 1000, 5000];
/** From this many decoys on, the button needs a second click. */
const LAB_CONFIRM_FROM = 1000;
/** Stop a batch early when Windows keeps refusing to start decoys. */
const LAB_MAX_FAILS_IN_A_ROW = 25;

const fmtRam = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);

/** Secret tab: starts a batch of random decoys at once. The user picks how many, never which games. */
export function LabView() {
  const t = useT();
  const { games, running, settings, syncRunning, toast, setSecret, setView, lang } = useStore();
  const eligible = useMemo(() => games.filter((g) => g.exes.length > 0), [games]);
  const max = eligible.length;
  const [count, setCount] = useState(25);
  const [armed, setArmed] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const cancel = useRef(false);
  const n = Math.max(1, Math.min(Math.round(count) || 1, max || 1));
  const big = n >= LAB_CONFIRM_FROM;

  const launchAll = async () => {
    cancel.current = false;
    const busy = new Set(running.map((r) => r.gameId));
    const pool = eligible.filter((g) => !busy.has(g.id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const pick = pool.slice(0, n);
    setProg({ done: 0, total: pick.length });
    let ok = 0;
    let failsInARow = 0;
    for (let i = 0; i < pick.length; i++) {
      if (cancel.current) break;
      const g = pick[i];
      try {
        await api.launch({
          gameId: g.id,
          gameName: g.name,
          exe: sortedExes(g)[0].name,
          minutes: settings.minutes,
          autoStop: settings.autoStop,
          notify: false,
          smart: false, // Discord only reports one "visible" game, so there is nothing to wait for in a batch
          notifyTitle: "",
          notifyBody: "",
        });
        ok++;
        failsInARow = 0;
      } catch {
        if (++failsInARow >= LAB_MAX_FAILS_IN_A_ROW) {
          toast("error", t("lab.limit", { n: ok.toLocaleString() }));
          break;
        }
      }
      if (i % 10 === 9) {
        setProg({ done: i + 1, total: pick.length });
        await new Promise((r) => setTimeout(r, 0)); // let the window repaint
      }
    }
    await syncRunning();
    setProg(null);
    toast("ok", t("toast.labDone", { n: ok.toLocaleString() }));
  };

  const go = () => {
    // thousands of processes can freeze the computer: ask once more
    if (big && !armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 6000);
      return;
    }
    setArmed(false);
    void launchAll();
  };

  return (
    <section className="page">
      <div className="page-head">
        <h1>{t("lab.title")}</h1>
        <p>{t("lab.subtitle")}</p>
      </div>

      <div className="panel lab">
        <h3>{t("lab.eligible", { n: eligible.length.toLocaleString(lang) })}</h3>
        <Row title={t("lab.count")} desc={t("lab.count.desc", { n: settings.minutes })}>
          <div className="stepper">
            <button onClick={() => setCount(Math.max(1, n - Math.max(1, Math.round(n / 10))))} disabled={!!prog}>−</button>
            <input
              className="num"
              type="number"
              min={1}
              max={max}
              value={count}
              disabled={!!prog}
              onChange={(e) => setCount(Number(e.target.value))}
              onBlur={() => setCount(n)}
              aria-label={t("lab.count")}
            />
            <button onClick={() => setCount(Math.min(max, n + Math.max(1, Math.round(n / 10))))} disabled={!!prog}>+</button>
          </div>
        </Row>
        <div className="lab-presets">
          {LAB_PRESETS.filter((p) => p < max).map((p) => (
            <button key={p} className={"chip" + (n === p ? " on" : "")} onClick={() => setCount(p)} disabled={!!prog}>{p.toLocaleString(lang)}</button>
          ))}
          <button className={"chip" + (n === max ? " on" : "")} onClick={() => setCount(max)} disabled={!!prog || !max}>{t("lab.all", { n: max.toLocaleString(lang) })}</button>
        </div>

        <div className={"lab-estimate" + (big ? " hot" : "")}>
          <I.warn size={15} />
          <span>{t("lab.estimate", { n: n.toLocaleString(lang), ram: fmtRam(n * MB_PER_DECOY) })}</span>
        </div>

        {prog ? (
          <div className="lab-prog">
            <div className="bar"><i style={{ width: `${(prog.done / prog.total) * 100}%` }} /></div>
            <div className="lab-prog-row">
              <span>{t("lab.launching", { done: prog.done.toLocaleString(lang), total: prog.total.toLocaleString(lang) })}</span>
              <button className="btn ghost sm" onClick={() => (cancel.current = true)}>{t("lab.cancel")}</button>
            </div>
          </div>
        ) : (
          <button className={"btn big lab-go " + (armed ? "danger" : "primary")} onClick={go} disabled={!max}>
            <I.play size={14} />{armed ? t("lab.confirm", { n: n.toLocaleString(lang) }) : t("lab.launch", { n: n.toLocaleString(lang) })}
          </button>
        )}
        <p className="lab-warn">{t("lab.warn")}</p>
      </div>

      <div className="lab-foot">
        {running.length > 0 && (
          <button
            className="btn danger"
            onClick={async () => {
              await api.stopAll();
              await syncRunning();
              toast("info", t("toast.allStopped"));
            }}
          >
            <I.stop size={13} />{t("running.stopAll")} · {running.length.toLocaleString(lang)}
          </button>
        )}
        <button
          className="btn ghost"
          onClick={() => {
            setSecret(false);
            setView("settings");
            toast("info", t("toast.labHidden"));
          }}
        >
          {t("lab.hide")}
        </button>
      </div>
    </section>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={"toggle" + (on ? " on" : "")} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span />
    </button>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div>
        <div className="set-title">{title}</div>
        {desc && <div className="set-desc">{desc}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SettingsView() {
  const t = useT();
  const { settings, setSettings, refreshGames, refreshing, fetchedMs, games, lang, setLang, update, checkUpdate } = useStore();
  const [info, setInfo] = useState<{ version: string; portable: boolean; dataDir: string } | null>(null);
  useEffect(() => {
    api.appInfo().then(setInfo).catch(() => {});
  }, []);

  const updateStatus =
    update.status === "checking" ? t("update.checking")
    : update.status === "uptodate" ? t("update.uptodate")
    : update.status === "available" || update.status === "downloading" || update.status === "ready" || update.status === "installing" ? t("update.available", { v: update.version ?? "" })
    : update.status === "error" ? t("update.error", { e: update.error ?? "" })
    : "";
  const updateBusy = update.status === "checking" || update.status === "downloading" || update.status === "installing";

  return (
    <section className="page">
      <div className="page-head">
        <h1>{t("settings.title")}</h1>
        <p>
          Decoy {info?.version ?? ""}
          {info?.portable && <span className="tag" style={{ marginLeft: 10 }}>{t("settings.portable")}</span>}
        </p>
      </div>

      <div className="panel">
        <h3>{t("settings.general")}</h3>
        <Row title={t("settings.language")} desc={t("settings.language.desc")}>
          <Select
            value={lang}
            onChange={setLang}
            searchPlaceholder={t("lib.search")}
            emptyText={t("lib.empty.title")}
            options={languages.map((l) => ({ value: l.code, label: l.name, hint: l.english && l.english !== l.name ? l.english : undefined }))}
          />
        </Row>
        <Row title={t("settings.updates")} desc={t("update.current", { v: info?.version ?? "…" }) + (updateStatus ? " · " + updateStatus : "")}>
          <button className="btn ghost" onClick={() => void checkUpdate(true)} disabled={updateBusy}>
            <span className={update.status === "checking" ? "spin" : ""}><I.refresh size={16} /></span>{t("settings.checkNow")}
          </button>
        </Row>
        <Row title={t("settings.autoUpdate")} desc={t("settings.autoUpdate.desc")}>
          <Toggle on={settings.autoUpdate} onChange={(v) => setSettings({ autoUpdate: v })} />
        </Row>
      </div>

      <div className="panel">
        <h3>{t("settings.stubs")}</h3>
        <Row title={t("settings.defaultTime")} desc={t("settings.defaultTime.desc", { n: settings.minutes })}>
          <div className="stepper">
            <button onClick={() => setSettings({ minutes: Math.max(1, settings.minutes - 1) })}>−</button>
            <span>{settings.minutes}</span>
            <button onClick={() => setSettings({ minutes: Math.min(240, settings.minutes + 1) })}>+</button>
          </div>
        </Row>
        <Row title={t("settings.smartTimer")} desc={t("settings.smartTimer.desc")}>
          <Toggle on={settings.smartTimer} onChange={(v) => setSettings({ smartTimer: v })} />
        </Row>
        <Row title={t("settings.autoStop")} desc={t("settings.autoStop.desc")}>
          <Toggle on={settings.autoStop} onChange={(v) => setSettings({ autoStop: v })} />
        </Row>
        <Row title={t("settings.notify")} desc={t("settings.notify.desc")}>
          <Toggle on={settings.notify} onChange={(v) => setSettings({ notify: v })} />
        </Row>
        <Row title={t("settings.tray")} desc={t("settings.tray.desc")}>
          <Toggle on={settings.closeToTray} onChange={(v) => setSettings({ closeToTray: v })} />
        </Row>
      </div>

      <div className="panel">
        <h3>{t("settings.db")}</h3>
        <Row
          title={t("settings.source")}
          desc={t("settings.source.desc", { n: games.length.toLocaleString(lang), date: fetchedMs ? new Date(fetchedMs).toLocaleString(lang) : "—" })}
        >
          <button className="btn ghost" onClick={refreshGames} disabled={refreshing}>
            <span className={refreshing ? "spin" : ""}><I.refresh size={16} /></span>{t("settings.refresh")}
          </button>
        </Row>
        <Row title={t("settings.showNoExe")} desc={t("settings.showNoExe.desc")}>
          <Toggle on={settings.showNoExe} onChange={(v) => setSettings({ showNoExe: v })} />
        </Row>
      </div>

      <div className="panel">
        <h3>{t("settings.files")}</h3>
        <Row title={t("settings.dataDir")} desc={info ? (info.portable ? t("settings.dataDir.portable") + " " : "") + info.dataDir : t("settings.dataDir.desc")}>
          <button className="btn ghost" onClick={() => info && api.openPath(info.dataDir)} disabled={!info}><I.folder size={16} />{t("settings.open")}</button>
        </Row>
      </div>

      <p className="legal">{t("settings.legal")}</p>
    </section>
  );
}
