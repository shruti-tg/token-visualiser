"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./token-loader.css";

const STATUS_LINES = [
  "tallying every call…",
  "naming the cache misses…",
  "snitching on output bloat…",
  "stacking tokens by the thousand…",
  "pricing cache reads at $0.30…",
  "reading the receipts…",
  "auditing the ledger, line by line…",
  "doing the math you'd rather skip…",
  "deduping by message id…",
  "weighing what the model actually saw…",
];

const CHART_H = 200;
const COLUMNS = 9;
const SPEED = 7;

type Segs = [number, number, number, number];

function genColumns(n: number, chartH: number): Segs[] {
  const cols: Segs[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.6 : i / (n - 1);
    const trend = 0.34 + 0.6 * t;
    const jitter = (Math.random() - 0.5) * 0.26;
    const frac = Math.max(0.18, Math.min(1, trend + jitter));
    const total = frac * chartH;
    let p = [
      0.07 + Math.random() * 0.04,
      0.46 + Math.random() * 0.18,
      0.18 + Math.random() * 0.12,
      0.1 + Math.random() * 0.08,
    ];
    const s = p.reduce((a, b) => a + b, 0);
    p = p.map((x) => x / s);
    const segs = p.map((x) => Math.max(3, Math.round(x * total))) as Segs;
    cols.push(segs);
  }
  return cols;
}

function useSegColors(palette: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [colors, setColors] = useState<[string, string, string, string]>([
    "#1c1814",
    "#2a5d8a",
    "#e16b3a",
    "#6f9656",
  ]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const cs = getComputedStyle(ref.current);
    const g = (v: string, fb: string) =>
      (cs.getPropertyValue(v) || "").trim() || fb;
    setColors([
      g("--ink", "#1c1814"),
      g("--blue", "#2a5d8a"),
      g("--coral", "#e16b3a"),
      g("--mint", "#6f9656"),
    ]);
  }, [palette]);
  return { ref, colors };
}

function LoaderChart({ palette }: { palette: string }) {
  const { ref, colors } = useSegColors(palette);
  const [cols] = useState<Segs[]>(() => genColumns(COLUMNS, CHART_H));

  const stagger = Math.max(28, Math.round(170 - SPEED * 13));
  const durMs = Math.max(1500, Math.round(4200 - SPEED * 230));
  const barW = Math.max(10, Math.min(34, Math.round(360 / COLUMNS)));

  return (
    <div className="tl-chart" ref={ref}>
      {[0.25, 0.5, 0.75].map((f) => (
        <div key={f} className="tl-grid" style={{ bottom: f * CHART_H + 2 }} />
      ))}
      <div className="tl-base" />
      <div className="tl-cols">
        {cols.map((segs, i) => (
          <div className="tl-col" key={i}>
            <div
              className="tl-bar"
              style={{
                width: barW,
                animationDuration: `${durMs}ms`,
                animationDelay: `${i * stagger}ms`,
              }}
            >
              {segs.map((h, si) => (
                <div
                  key={si}
                  className={
                    "tl-seg" + (si === segs.length - 1 ? " cap-rounded" : "")
                  }
                  style={{ height: h, background: colors[si] }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ palette }: { palette: string }) {
  const { ref, colors } = useSegColors(palette);
  const items: [string, string][] = [
    ["input", colors[0]],
    ["cache read", colors[1]],
    ["cache write", colors[2]],
    ["output", colors[3]],
  ];
  return (
    <div className="tl-legend" ref={ref}>
      {items.map(([lab, col]) => (
        <span className="sw" key={lab}>
          <span className="box" style={{ background: col }} />
          {lab}
        </span>
      ))}
    </div>
  );
}

function StatusLine() {
  const [i, setI] = useState(0);
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const iv = setInterval(() => {
      setVis(false);
      setTimeout(() => {
        setI((p) => (p + 1) % STATUS_LINES.length);
        setVis(true);
      }, 280);
    }, 2000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="tl-status">
      <span className="car" />
      <span className="txt" style={{ opacity: vis ? 1 : 0 }}>
        {STATUS_LINES[i]}
      </span>
    </div>
  );
}

export default function TokenLoader({ palette }: { palette: string }) {
  return (
    <div className="tl-stage" data-palette={palette} role="status" aria-live="polite">
      <div className="tl-card">
        <div className="tl-top">
          <span className="tl-brand">
            <span className="star">★</span> token ledger
          </span>
          <span className="tl-chip">
            <span className="blip" /> parsing
          </span>
        </div>

        <div className="tl-head">
          <h1 className="tl-title">
            reading the <em>session.</em>
          </h1>
          <p className="tl-sub">stacking every token where it landed…</p>
        </div>

        <LoaderChart palette={palette} />
        <Legend palette={palette} />
        <StatusLine />
        <div className="tl-scan">
          <i />
        </div>
      </div>
    </div>
  );
}
