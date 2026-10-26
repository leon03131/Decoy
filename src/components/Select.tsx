import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { I } from "./ui";

export interface Option {
  value: string;
  label: string;
  /** Secondary text shown dimmed on the right and matched by the search (e.g. the English name). */
  hint?: string;
}

const SEARCH_FROM = 10; // show the search box when there are more options than this

/** Dropdown in the app's own style (the native <select> popup is drawn by the system and cannot be themed). */
export default function Select({
  value,
  options,
  onChange,
  searchPlaceholder = "Search",
  emptyText = "No matches",
}: {
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);
  const searchable = options.length > SEARCH_FROM;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => (o.label + " " + (o.hint ?? "") + " " + o.value).toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // keep the highlighted row visible while moving with the arrow keys / after the list opens
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(".sel-opt.active")?.scrollIntoView({ block: "nearest" });
  }, [open, active, shown]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const typing = (e.target as HTMLElement).tagName === "INPUT";
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(shown.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" || (e.key === " " && !typing)) {
      e.preventDefault();
      if (shown[active]) pick(shown[active].value);
    }
  };

  return (
    <div className="sel" ref={root} onKeyDown={onKey}>
      <button className={"sel-btn" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span>{current?.label ?? value}</span>
        <span className="sel-chev"><I.chevron size={14} /></span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="sel-menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            {searchable && (
              <div className="sel-search">
                <I.search size={14} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  placeholder={searchPlaceholder}
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
            )}
            <ul ref={list} role="listbox" className="sel-list">
              {shown.map((o, i) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  className={"sel-opt" + (i === active ? " active" : "") + (o.value === value ? " chosen" : "")}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o.value)}
                >
                  <span className="sel-opt-label">{o.label}</span>
                  {o.hint ? <span className="sel-opt-hint">{o.hint}</span> : null}
                  {o.value === value && <I.check size={14} />}
                </li>
              ))}
              {shown.length === 0 && <li className="sel-empty">{emptyText}</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
