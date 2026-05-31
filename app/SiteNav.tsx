"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ActivePage = "ledger" | "billing" | "guide";

interface NavLink {
  key: ActivePage;
  href: string;
  num: string;
  name: string;
  desc: string;
}

const LINKS: NavLink[] = [
  {
    key: "ledger",
    href: "/",
    num: "01",
    name: "the ledger",
    desc: "drop a session, read the receipts",
  },
  {
    key: "billing",
    href: "/token-chart",
    num: "02",
    name: "how it's built",
    desc: "the token chart, explained",
  },
  {
    key: "guide",
    href: "/guide",
    num: "03",
    name: "the saver guide",
    desc: "10 ways to spend fewer tokens",
  },
];

const PALETTES = ["workshop", "cream", "sage", "plum", "slate"] as const;

const PALETTE_COLORS: Record<
  (typeof PALETTES)[number],
  { ink: string; coral: string; paper: string }
> = {
  workshop: { ink: "#1c1814", coral: "#e16b3a", paper: "#faf3e0" },
  cream: { ink: "#14233f", coral: "#ff6447", paper: "#fffaf2" },
  sage: { ink: "#1d2f25", coral: "#c25535", paper: "#eef2e2" },
  plum: { ink: "#2a1834", coral: "#c64a7a", paper: "#f4eef8" },
  slate: { ink: "#0e1f37", coral: "#d4543c", paper: "#ecf0f5" },
};

function buildFaviconHref(palette: string): string {
  const c =
    PALETTE_COLORS[palette as (typeof PALETTES)[number]] ??
    PALETTE_COLORS.workshop;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="34" cy="36" r="26" fill="${c.ink}"/><circle cx="30" cy="32" r="26" fill="${c.coral}" stroke="${c.ink}" stroke-width="4"/><path d="M16 22 H44 V30 H34 V48 H26 V30 H16 Z" fill="${c.ink}"/><circle cx="44" cy="42" r="3" fill="${c.paper}" stroke="${c.ink}" stroke-width="2"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

interface SiteNavProps {
  active: ActivePage;
  palette: string;
  onPaletteChange: (palette: string) => void;
}

export default function SiteNav({
  active,
  palette,
  onPaletteChange,
}: SiteNavProps) {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const activeLink = LINKS.find((l) => l.key === active) ?? LINKS[0];

  useEffect(() => {
    const href = buildFaviconHref(palette);
    let link = document.querySelector<HTMLLinkElement>(
      'link[rel~="icon"]:not([rel*="apple"])',
    );
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      document.head.appendChild(link);
    }
    link.href = href;
  }, [palette]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const nav = navRef.current;
    if (!nav) return;

    const run = () => {
      const r = nav.getBoundingClientRect();
      const layer = document.createElement("div");
      layer.className = "token-spill";
      document.body.appendChild(layer);

      const palette = ["c-coral", "c-blue", "c-mint", "c-pink", "c-gold", "c-paper"];
      const glyphs = ["★", "$", "◆", "▲", "◇", "✦", "¢", "§"];
      const N = 22;
      type Coin = {
        el: HTMLDivElement;
        x: number;
        y: number;
        vx: number;
        vy: number;
        rot: number;
        vr: number;
        delay: number;
        alive: boolean;
      };
      const coins: Coin[] = [];

      for (let i = 0; i < N; i++) {
        const el = document.createElement("div");
        el.className = "token-coin " + palette[Math.floor(Math.random() * palette.length)];
        el.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
        const sz = 22 + Math.random() * 16;
        el.style.width = el.style.height = sz + "px";
        el.style.fontSize = sz * 0.42 + "px";
        layer.appendChild(el);
        coins.push({
          el,
          x: r.left + 12 + Math.random() * (r.width - 24),
          y: r.bottom - 8 - Math.random() * r.height * 0.5,
          vx: (Math.random() - 0.5) * 4.2,
          vy: -2 - Math.random() * 3,
          rot: Math.random() * 360,
          vr: (Math.random() - 0.5) * 16,
          delay: Math.random() * 340,
          alive: true,
        });
      }

      const G = 0.55;
      const FLOOR = window.innerHeight + 60;
      let start: number | null = null;
      let rafId = 0;

      const frame = (ts: number) => {
        if (start === null) start = ts;
        const elapsed = ts - start;
        let any = false;
        for (const c of coins) {
          if (!c.alive) continue;
          if (elapsed < c.delay) {
            any = true;
            continue;
          }
          c.vy += G;
          c.x += c.vx;
          c.y += c.vy;
          c.rot += c.vr;
          c.vx *= 0.995;
          if (c.y > FLOOR) {
            c.alive = false;
            c.el.remove();
            continue;
          }
          any = true;
          const fade =
            c.y > window.innerHeight - 140
              ? Math.max(0, (FLOOR - c.y) / 200)
              : 1;
          c.el.style.transform = `translate(${c.x}px, ${c.y}px) rotate(${c.rot}deg)`;
          c.el.style.opacity = String(fade);
        }
        if (any) rafId = requestAnimationFrame(frame);
        else layer.remove();
      };
      rafId = requestAnimationFrame(frame);

      return () => {
        cancelAnimationFrame(rafId);
        layer.remove();
      };
    };

    let cleanup: (() => void) | undefined;
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => {
        cleanup = run();
      });
      cleanup = () => cancelAnimationFrame(r2);
    });
    return () => {
      cancelAnimationFrame(r1);
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className={`site-nav${open ? " open" : ""}`} ref={navRef}>
      <div className="nav-left">
        <Link href="/" className="nav-favicon" aria-label="Home">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="34" cy="36" r="26" fill="var(--ink)" />
            <circle cx="30" cy="32" r="26" fill="var(--coral)" stroke="var(--ink)" strokeWidth="4" />
            <path d="M16 22 H44 V30 H34 V48 H26 V30 H16 Z" fill="var(--ink)" />
            <circle cx="44" cy="42" r="3" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
          </svg>
        </Link>
        <span className="nav-crumb">
          <span className="sep">/</span>
          <b>{activeLink.name}</b>
        </span>
      </div>
      <button
        className="nav-toggle"
        type="button"
        aria-expanded={open ? "true" : "false"}
        aria-controls="navPanel"
        aria-label="Toggle navigation menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className="tlabel">{open ? "close" : "menu"}</span>
        <span className="nav-burger">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
      <div className="nav-panel" id="navPanel">
        {LINKS.map((l) => (
          <Link
            key={l.key}
            className={`np-link${l.key === active ? " active" : ""}`}
            href={l.href}
            aria-current={l.key === active ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <span className="np-num">{l.num}</span>
            <span className="np-txt">
              <span className="np-name">{l.name}</span>
              <span className="np-desc">{l.desc}</span>
            </span>
          </Link>
        ))}
        <div className="np-divider"></div>
        <div className="np-palette">
          <span className="pl">palette</span>
          <div className="palette-switcher">
            <span className="ps-label">palette</span>
            {PALETTES.map((p) => (
              <button
                key={p}
                className={`ps-swatch${palette === p ? " active" : ""}`}
                data-pal={p}
                aria-label={`${p} palette`}
                onClick={() => onPaletteChange(p)}
              />
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
