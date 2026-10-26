import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api, sortedExes } from "../api";
import { languages } from "../i18n-core";
import { useT } from "../i18n";
import { useStore } from "../store";
import Select from "./Select";
import { Cover, fmtTime, GameIcon, I, Ring, useNow } from "./ui";

export function RunningView() {
  const t = useT();
  const { running, games, syncRunning, select, toast } = useStore();
  const now = useNow(1000);
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  return (
    <section className="page">
      <div className="page-head row">
        <div>
          <h1>{t("running.title")}</h1>
          <p>{running.length ? t("running.count", { n: running.length }) : t("running.none")}</p>
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
        <div className="run-grid">
          {running.map((r) => {
            const left = r.durationS - (now - r.startedMs) / 1000;
            const g = byId.get(r.gameId);
            return (
              <motion.div key={r.key} layout className="run-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                {g && <Cover game={g} className="run-bg" />}
                <div className="run-veil" />
                <Ring progress={1 - left / r.durationS} size={92} stroke={6}>
                  <div className="ring-time sm">{left <= 0 ? "✓" : fmtTime(left)}</div>
                </Ring>
                <div className="run-meta">
                  <div className="run-title" onClick={() => g && select(g.id)}>
                    {g && <GameIcon game={g} size={26} radius={8} />}
                    <span>{r.gameName}</span>
                  </div>
                  <div className="run-exe">{r.exe} · PID {r.pid}</div>
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
      )}
    </section>
  );
}

const LAB_PRESETS = [10, 25, 50, 100, 250, 500];
const LAB_MAX = 500;

/** Secret tab: starts a batch of random decoys at once. The user picks how many, never which games. */
export function LabView() {
  const t = useT();
  const { games, running, settings, syncRunning, toast, setSecret, setView, lang } = useStore();
  const eligible = useMemo(() => games.filter((g) => g.exes.length > 0), [games]);
  const max = Math.min(LAB_MAX, eligible.length);
  const [count, setCount] = useState(25);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const cancel = useRef(false);
  const n = Math.max(1, Math.min(count, max || 1));

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
    for (const g of pick) {
      if (cancel.current) break;
      try {
        await api.launch({
          gameId: g.id,
          gameName: g.name,
          exe: sortedExes(g)[0].name,
          minutes: settings.minutes,
          autoStop: settings.autoStop,
          notify: false,
          notifyTitle: "",
          notifyBody: "",
        });
        ok++;
      } catch {
        /* skip a game that fails to start */
      }
      setProg((p) => p && { ...p, done: p.done + 1 });
      if (ok % 10 === 0) await syncRunning();
      await new Promise((r) => setTimeout(r, 30));
    }
    await syncRunning();
    setProg(null);
    toast("ok", t("toast.labDone", { n: ok }));
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
            <button onClick={() => setCount(Math.max(1, n - 5))} disabled={!!prog}>−</button>
            <span style={{ minWidth: 46 }}>{n}</span>
            <button onClick={() => setCount(Math.min(max, n + 5))} disabled={!!prog}>+</button>
          </div>
        </Row>
        <div className="lab-presets">
          {LAB_PRESETS.filter((p) => p <= max).map((p) => (
            <button key={p} className={"chip" + (n === p ? " on" : "")} onClick={() => setCount(p)} disabled={!!prog}>{p}</button>
          ))}
        </div>

        {prog ? (
          <div className="lab-prog">
            <div className="bar"><i style={{ width: `${(prog.done / prog.total) * 100}%` }} /></div>
            <div className="lab-prog-row">
              <span>{t("lab.launching", { done: prog.done, total: prog.total })}</span>
              <button className="btn ghost sm" onClick={() => (cancel.current = true)}>{t("lab.cancel")}</button>
            </div>
          </div>
        ) : (
          <button className="btn primary big lab-go" onClick={launchAll} disabled={!max}>
            <I.play size={14} />{t("lab.launch", { n })}
          </button>
        )}
        <p className="lab-warn">{t("lab.warn", { max: LAB_MAX })}</p>
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
            <I.stop size={13} />{t("running.stopAll")} · {running.length}
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
  const { settings, setSettings, refreshGames, refreshing, fetchedMs, games, lang, setLang } = useStore();
  const [info, setInfo] = useState<{ version: string; portable: boolean; dataDir: string } | null>(null);
  useEffect(() => {
    api.appInfo().then(setInfo).catch(() => {});
  }, []);
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
      </div>

      <div className="panel">
        <h3>{t("settings.stubs")}</h3>
        <Row title={t("settings.defaultTime")} desc={t("settings.defaultTime.desc")}>
          <div className="stepper">
            <button onClick={() => setSettings({ minutes: Math.max(1, settings.minutes - 1) })}>−</button>
            <span>{settings.minutes}</span>
            <button onClick={() => setSettings({ minutes: Math.min(240, settings.minutes + 1) })}>+</button>
          </div>
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
