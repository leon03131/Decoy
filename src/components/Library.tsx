import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useT } from "../i18n";
import { IndexedGame, useStore } from "../store";
import { Cover, GameIcon, I } from "./ui";

const CARD_MIN = 232;
const GAP = 16;
const TILE_H = 188;
const LIST_H = 56;

function Fav({ id, on }: { id: string; on: boolean }) {
  const toggleFav = useStore((s) => s.toggleFav);
  const t = useT();
  return (
    <button
      className={"fav" + (on ? " on" : "")}
      onClick={(e) => {
        e.stopPropagation();
        toggleFav(id);
      }}
      aria-label={t("lib.addFavorite")}
    >
      <I.star size={15} filled={on} />
    </button>
  );
}

function Status({ game, live }: { game: IndexedGame; live: boolean }) {
  const t = useT();
  if (live) return <span className="tag live"><i />{t("tag.live")}</span>;
  if (game.exes.length === 0) return <span className="tag off">{t("tag.noExe")}</span>;
  return <span className="tag">{t("tag.exeCount", { n: game.exes.length })}</span>;
}

function Tile({ game }: { game: IndexedGame }) {
  const { favorites, select, selectedId, running } = useStore();
  const live = running.some((r) => r.gameId === game.id);
  return (
    <div className={"tile" + (selectedId === game.id ? " selected" : "") + (game.exes.length ? "" : " dim")} onClick={() => select(game.id)}>
      <div className="tile-art">
        <Cover game={game} />
        <div className="tile-shade" />
        <Fav id={game.id} on={favorites.includes(game.id)} />
      </div>
      <div className="tile-meta">
        <GameIcon game={game} size={32} radius={9} />
        <div className="tile-text">
          <div className="tile-name" title={game.name}>{game.name}</div>
          <Status game={game} live={live} />
        </div>
      </div>
    </div>
  );
}

function Row({ game }: { game: IndexedGame }) {
  const { favorites, select, selectedId, running } = useStore();
  const live = running.some((r) => r.gameId === game.id);
  return (
    <div className={"lrow" + (selectedId === game.id ? " selected" : "") + (game.exes.length ? "" : " dim")} onClick={() => select(game.id)}>
      <GameIcon game={game} size={36} radius={10} />
      <div className="lrow-name" title={game.name}>{game.name}</div>
      <div className="lrow-exe">{game.exes[0]?.name ?? "—"}</div>
      <Status game={game} live={live} />
      <Fav id={game.id} on={favorites.includes(game.id)} />
    </div>
  );
}

function Recent({ ids }: { ids: string[] }) {
  const t = useT();
  const { games, select, running } = useStore();
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const list = ids.map((id) => byId.get(id)).filter((g): g is IndexedGame => !!g).slice(0, 4);
  if (!list.length) return null;
  return (
    <section className="recent">
      <h2 className="sec-title">{t("lib.recent")}</h2>
      <div className="recent-row">
        {list.map((g) => (
          <div key={g.id} className="hero-card" onClick={() => select(g.id)}>
            <Cover game={g} />
            <div className="hero-shade" />
            <div className="hero-body">
              <GameIcon game={g} size={40} radius={11} />
              <div className="hero-text">
                <div className="hero-name">{g.name}</div>
                <Status game={g} live={running.some((r) => r.gameId === g.id)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Library({ favOnly = false }: { favOnly?: boolean }) {
  const t = useT();
  const { games, query, setQuery, favorites, recent, settings, setSettings, viewMode, setViewMode, loading, refreshing, refreshGames, fetchedMs, lang } = useStore();
  const deferred = useDeferredValue(query);

  const filtered = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/) : [];
    const favSet = new Set(favorites);
    let list = games.filter((g) => {
      if (favOnly && !favSet.has(g.id)) return false;
      if (!settings.showNoExe && g.exes.length === 0 && !favSet.has(g.id)) return false;
      return tokens.every((t) => g.hay.includes(t));
    });
    if (q) {
      const rank = (g: IndexedGame) => (g.nameLc.startsWith(q) ? 0 : g.nameLc.includes(q) ? 1 : 2);
      list = list.map((g) => [rank(g), g] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    }
    return list;
  }, [games, deferred, favOnly, favorites, settings.showNoExe]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollInRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [margin, setMargin] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const showRecent = !favOnly && !deferred.trim() && recent.length > 0 && !loading;
  useLayoutEffect(() => {
    // distance from the top of the scrollable content to the start of the virtual list
    setMargin((scrollInRef.current?.offsetTop ?? 0) + (listRef.current?.offsetTop ?? 0));
  }, [showRecent, width, loading, filtered.length === 0]);

  const list = viewMode === "list";
  const inner = width - 64;
  const cols = list ? 1 : Math.max(1, Math.floor((inner + GAP) / (CARD_MIN + GAP)));
  const rows = Math.ceil(filtered.length / cols);
  const rowH = list ? LIST_H : TILE_H;
  const virt = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH + (list ? 4 : GAP),
    overscan: 5,
    scrollMargin: margin,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [deferred, favOnly]);

  const updated = fetchedMs ? new Date(fetchedMs).toLocaleString(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <section className="library">
      <div className="scroll" ref={scrollRef}>
      <div className="topbar">
        <div className="search">
          <I.search size={17} />
          <input id="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("lib.search")} spellCheck={false} autoComplete="off" />
          {query ? (
            <button className="clear" onClick={() => setQuery("")} aria-label={t("lib.clear")}><I.close size={14} /></button>
          ) : (
            <kbd>Ctrl K</kbd>
          )}
        </div>
        <div className="seg" role="group">
          <button className={!list ? "on" : ""} onClick={() => setViewMode("grid")} aria-label={t("lib.viewGrid")} title={t("lib.viewGrid")}><I.library size={16} /></button>
          <button className={list ? "on" : ""} onClick={() => setViewMode("list")} aria-label={t("lib.viewList")} title={t("lib.viewList")}><I.list size={16} /></button>
        </div>
        <button className="icon-btn" onClick={refreshGames} disabled={refreshing} title={t("lib.refreshTitle", { date: updated })} aria-label={t("lib.refresh")}>
          <span className={refreshing ? "spin" : ""}><I.refresh size={16} /></span>
        </button>
      </div>

        <div className="scroll-in" ref={scrollInRef}>
          {!favOnly && (
            <header className="page-head">
              <h1>{t("lib.title")}</h1>
              <p>{loading ? t("lib.loading") : t("lib.subtitle", { n: games.filter((g) => g.exes.length).length.toLocaleString(lang), date: updated })}</p>
            </header>
          )}
          {favOnly && (
            <header className="page-head">
              <h1>{t("fav.title")}</h1>
              <p>{favorites.length ? t("fav.count", { n: favorites.length }) : t("fav.hint")}</p>
            </header>
          )}

          {showRecent && <Recent ids={recent} />}

          <div className="sec-head">
            <h2 className="sec-title">{deferred.trim() ? t("lib.results") : favOnly ? t("lib.games") : t("lib.all")} <span>{loading ? "" : filtered.length.toLocaleString(lang)}</span></h2>
            <label className="check">
              <input type="checkbox" checked={settings.showNoExe} onChange={(e) => setSettings({ showNoExe: e.target.checked })} />
              <i />
              <span>{t("lib.showNoExe")}</span>
            </label>
          </div>

          {loading ? (
            <div className="skeleton-grid">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="tile skeleton" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-ico"><I.search size={26} /></div>
              <h3>{favOnly ? t("fav.empty.title") : t("lib.empty.title")}</h3>
              <p>{favOnly ? t("fav.empty.text") : t("lib.empty.text")}</p>
            </div>
          ) : (
            <div ref={listRef} style={{ height: virt.getTotalSize(), position: "relative" }}>
              {virt.getVirtualItems().map((vr) => (
                <div
                  key={vr.key}
                  className="vrow"
                  style={{ transform: `translateY(${vr.start - margin}px)`, height: rowH, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: GAP }}
                >
                  {filtered.slice(vr.index * cols, vr.index * cols + cols).map((g) => (list ? <Row key={g.id} game={g} /> : <Tile key={g.id} game={g} />))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
