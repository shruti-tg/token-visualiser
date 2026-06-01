"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ActivePage = "ledger" | "billing" | "guide" | "replay";

interface NavLink {
  key: ActivePage;
  href: string;
  num: string;
  name: string;
  desc: string;
  tag: string;
}

const LINKS: NavLink[] = [
  {
    key: "ledger",
    href: "/",
    num: "01",
    name: "the ledger",
    desc: "drop a session, read the receipts",
    tag: "read the receipts",
  },
  {
    key: "billing",
    href: "/token-chart",
    num: "02",
    name: "how it's built",
    desc: "the token chart, explained",
    tag: "the chart, explained",
  },
  {
    key: "guide",
    href: "/guide",
    num: "03",
    name: "the saver guide",
    desc: "10 ways to spend fewer tokens",
    tag: "spend fewer tokens",
  },
  {
    key: "replay",
    href: "/replay",
    num: "04",
    name: "the replay",
    desc: "scrub a session, catch the leaks",
    tag: "scrub a session",
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
          <span className="dot">·</span>
          {activeLink.tag}
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
