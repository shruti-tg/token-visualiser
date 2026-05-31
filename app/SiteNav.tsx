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
