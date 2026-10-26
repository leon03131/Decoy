import { useEffect, useState } from "react";
import { coverUrl, Game, iconUrl } from "../api";

export function useNow(interval = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export const fmtTime = (secs: number) => {
  const s = Math.max(0, Math.round(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const hue = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
};

type G = Pick<Game, "id" | "icon" | "cover" | "name">;

export function GameIcon({ game, size = 64, radius }: { game: G; size?: number; radius?: number }) {
  const [failed, setFailed] = useState(false);
  const url = iconUrl(game, size >= 96 ? 256 : 128);
  const r = radius ?? Math.round(size * 0.24);
  if (!url || failed) {
    const h = hue(game.id);
    return (
      <div
        className="game-icon fallback"
        style={{ width: size, height: size, borderRadius: r, fontSize: size * 0.4, background: `linear-gradient(145deg, hsl(${h} 22% 26%), hsl(${(h + 30) % 360} 24% 16%))` }}
      >
        {game.name.trim().charAt(0).toUpperCase()}
      </div>
    );
  }
  return <img className="game-icon" src={url} width={size} height={size} style={{ borderRadius: r }} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

/** Wide artwork: the game's cover, or a soft blurred version of its icon when there is none. */
export function Cover({ game, className = "" }: { game: G; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = coverUrl(game, 512);
  const icon = iconUrl(game, 128);
  if (url && !failed) {
    return <img className={"cover " + className} src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  const h = hue(game.id);
  return (
    <div className={"cover fallback " + className} style={{ background: `linear-gradient(145deg, hsl(${h} 26% 20%), hsl(${(h + 40) % 360} 28% 11%))` }}>
      {icon && <div className="cover-blur" style={{ backgroundImage: `url(${icon})` }} />}
    </div>
  );
}

export function Ring({ progress, size = 132, stroke = 8, children }: { progress: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={p >= 1 ? "var(--good)" : "var(--accent)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset .9s linear" }}
        />
      </svg>
      <div className="ring-inner">{children}</div>
    </div>
  );
}

type P = { size?: number };
const base = (size = 18) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export const I = {
  library: (p: P) => (<svg {...base(p.size)}><rect x="3.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.8" /></svg>),
  list: (p: P) => (<svg {...base(p.size)}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>),
  star: (p: P & { filled?: boolean }) => (<svg {...base(p.size)} fill={p.filled ? "currentColor" : "none"}><path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z" /></svg>),
  play: (p: P) => (<svg {...base(p.size)} fill="currentColor" stroke="none"><path d="M7 4.6v14.8a1 1 0 0 0 1.5.86l12-7.4a1 1 0 0 0 0-1.72l-12-7.4A1 1 0 0 0 7 4.6z" /></svg>),
  stop: (p: P) => (<svg {...base(p.size)} fill="currentColor" stroke="none"><rect x="5.5" y="5.5" width="13" height="13" rx="2.5" /></svg>),
  pulse: (p: P) => (<svg {...base(p.size)}><path d="M3 12h4l2.5-7 5 14L17 12h4" /></svg>),
  settings: (p: P) => (<svg {...base(p.size)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>),
  search: (p: P) => (<svg {...base(p.size)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>),
  refresh: (p: P) => (<svg {...base(p.size)}><path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4" /></svg>),
  folder: (p: P) => (<svg {...base(p.size)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>),
  close: (p: P) => (<svg {...base(p.size)}><path d="M6 6l12 12M18 6 6 18" /></svg>),
  min: (p: P) => (<svg {...base(p.size)}><path d="M5 12h14" /></svg>),
  max: (p: P) => (<svg {...base(p.size)}><rect x="5.5" y="5.5" width="13" height="13" rx="2" /></svg>),
  flask: (p: P) => (<svg {...base(p.size)}><path d="M9 3h6M10 3v6.2L4.6 18.4A2 2 0 0 0 6.3 21.5h11.4a2 2 0 0 0 1.7-3.1L14 9.2V3" /><path d="M7.5 15h9" /></svg>),
  chevron: (p: P) => (<svg {...base(p.size)}><path d="m6 9 6 6 6-6" /></svg>),
  gamepad: (p: P) => (<svg {...base(p.size)}><path d="M6 8h12a4 4 0 0 1 3.9 4.9l-.7 3.4a2.4 2.4 0 0 1-4.1 1.2L15 15H9l-2.1 2.5a2.4 2.4 0 0 1-4.1-1.2l-.7-3.4A4 4 0 0 1 6 8z" /><path d="M8 10.5v3M6.5 12h3M15.5 11.2h.01M17.5 12.8h.01" /></svg>),
  check: (p: P) => (<svg {...base(p.size)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>),
  warn: (p: P) => (<svg {...base(p.size)}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17.5v.01" /></svg>),
  trash: (p: P) => (<svg {...base(p.size)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>),
  clock: (p: P) => (<svg {...base(p.size)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>),
};
