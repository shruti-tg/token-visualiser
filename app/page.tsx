"use client";

import { useEffect, useRef, useState } from "react";

// Claude Sonnet 4.6 pricing (official as of 2026)
const PRICE = {
  input: 3.0,
  output: 15.0,
  cache_creation: 3.75,
  cache_read: 0.3,
};

interface Turn {
  idx: number;
  ts: string | null;
  inTok: number;
  outTok: number;
  cWrite: number;
  cRead: number;
  contextSize: number;
  tools: string[];
  actualCost: number;
  noCacheCost: number;
}

interface Stats {
  turns: Turn[];
  toolCounts: Record<string, number>;
  earliestTs: string | null;
  latestTs: string | null;
  totals: {
    in: number;
    out: number;
    cw: number;
    cr: number;
    actual: number;
    noCache: number;
  };
  savedPct: number;
}

export default function Home() {
  const [palette, setPalette] = useState("workshop");
  const [stats, setStats] = useState<Stats | null>(null);
  const [sourceLabel, setSourceLabel] = useState("none loaded");

  useEffect(() => {
    document.body.setAttribute("data-palette", palette);
  }, [palette]);

  const parseTranscript = (text: string): Stats => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const seen = new Set<string>();
    const turns: Turn[] = [];
    const toolCounts: Record<string, number> = {};
    let earliestTs: string | null = null;
    let latestTs: string | null = null;

    for (const raw of lines) {
      let obj;
      try {
        obj = JSON.parse(raw);
      } catch {
        continue;
      }

      const msg = obj.message;
      if (!msg || msg.role !== "assistant" || !msg.usage) continue;

      if (msg.id) {
        if (seen.has(msg.id)) continue;
        seen.add(msg.id);
      }

      const u = msg.usage;
      const inTok = u.input_tokens || 0;
      const outTok = u.output_tokens || 0;
      const cWrite = u.cache_creation_input_tokens || 0;
      const cRead = u.cache_read_input_tokens || 0;

      const tools: string[] = [];
      if (Array.isArray(msg.content)) {
        for (const b of msg.content) {
          if (b.type === "tool_use" && b.name) {
            tools.push(b.name);
            toolCounts[b.name] = (toolCounts[b.name] || 0) + 1;
          }
        }
      }

      const ts = obj.timestamp || obj.time || null;
      if (ts) {
        if (!earliestTs || ts < earliestTs) earliestTs = ts;
        if (!latestTs || ts > latestTs) latestTs = ts;
      }

      const actualCost =
        (inTok * PRICE.input) / 1e6 +
        (outTok * PRICE.output) / 1e6 +
        (cWrite * PRICE.cache_creation) / 1e6 +
        (cRead * PRICE.cache_read) / 1e6;
      const noCacheCost =
        ((inTok + cWrite + cRead) * PRICE.input) / 1e6 +
        (outTok * PRICE.output) / 1e6;

      turns.push({
        idx: turns.length + 1,
        ts,
        inTok,
        outTok,
        cWrite,
        cRead,
        contextSize: inTok + cWrite + cRead,
        tools,
        actualCost,
        noCacheCost,
      });
    }

    const tot = turns.reduce(
      (a, t) => ({
        in: a.in + t.inTok,
        out: a.out + t.outTok,
        cw: a.cw + t.cWrite,
        cr: a.cr + t.cRead,
        actual: a.actual + t.actualCost,
        noCache: a.noCache + t.noCacheCost,
      }),
      { in: 0, out: 0, cw: 0, cr: 0, actual: 0, noCache: 0 },
    );

    return {
      turns,
      toolCounts,
      earliestTs,
      latestTs,
      totals: tot,
      savedPct: tot.noCache
        ? Math.round(((tot.noCache - tot.actual) / tot.noCache) * 100)
        : 0,
    };
  };

  const handleFileChange = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseTranscript(text);
      setStats(parsed);
      setSourceLabel(file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileChange(files[0]);
    }
  };

  const handleClick = () => {
    const input = document.getElementById("fileInput") as HTMLInputElement;
    input?.click();
  };

  const buildDemo = (kind: "warm" | "cold" | "long") => {
    const TOOLS = [
      "Read",
      "Bash",
      "Grep",
      "Edit",
      "Write",
      "Glob",
      "TodoWrite",
      "WebFetch",
    ];
    const profiles: Record<
      string,
      {
        n: number;
        heavyEvery: number;
        ctxStart: number;
        cacheReadRatio: number;
        outBase: number;
        dups: number[];
      }
    > = {
      warm: {
        n: 22,
        heavyEvery: 5,
        ctxStart: 4200,
        cacheReadRatio: 0.86,
        outBase: 280,
        dups: [7, 14],
      },
      cold: {
        n: 38,
        heavyEvery: 3,
        ctxStart: 3000,
        cacheReadRatio: 0.55,
        outBase: 220,
        dups: [11],
      },
      long: {
        n: 70,
        heavyEvery: 7,
        ctxStart: 5400,
        cacheReadRatio: 0.91,
        outBase: 320,
        dups: [22, 44, 55],
      },
    };

    const p = profiles[kind] || profiles.warm;
    const lines: string[] = [];
    let ctx = p.ctxStart;
    let t = Date.now() - 1000 * 60 * (8 + p.n * 2);

    for (let i = 0; i < p.n; i++) {
      t += 8000 + Math.random() * 55000;
      const heavy = i % p.heavyEvery === 2;
      const first = i === 0;
      const cache_read = first
        ? 0
        : Math.round(ctx * (p.cacheReadRatio + (Math.random() - 0.5) * 0.06));
      const cache_write = first
        ? Math.round(ctx)
        : heavy
          ? Math.round(1200 + Math.random() * 5500)
          : Math.round(80 + Math.random() * 900);
      const input_tokens = Math.round(2 + Math.random() * 30);
      const output_tokens = Math.round(
        p.outBase + Math.random() * 520 + (heavy ? 280 : 0),
      );
      const nTools =
        Math.random() < 0.22 ? 0 : 1 + Math.floor(Math.random() * 3);
      const toolNames: string[] = [];
      for (let k = 0; k < nTools; k++)
        toolNames.push(TOOLS[Math.floor(Math.random() * TOOLS.length)]);

      const entry = {
        message: {
          id: `msg_${kind}_${i}`,
          role: "assistant",
          content: toolNames.map((n) => ({ type: "tool_use", name: n })),
          usage: {
            input_tokens,
            cache_creation_input_tokens: cache_write,
            cache_read_input_tokens: cache_read,
            output_tokens,
          },
        },
        timestamp: new Date(t).toISOString(),
      };

      lines.push(JSON.stringify(entry));
      if (p.dups.includes(i)) lines.push(JSON.stringify(entry));
      ctx += cache_write;
    }

    return lines.join("\n");
  };

  const handleDemoClick = (kind: "warm" | "cold" | "long") => {
    const demoData = buildDemo(kind);
    const parsed = parseTranscript(demoData);
    setStats(parsed);
    setSourceLabel(`demo · ${kind} session`);
  };

  return (
    <div style={{ backgroundColor: "var(--cream)" }}>
      <div className="page">
        {/* Palette Switcher */}
        <div className="palette-switcher">
          <span className="ps-label">palette</span>
          {["workshop", "cream", "sage", "plum", "slate"].map((p) => (
            <button
              key={p}
              className={`ps-swatch ${palette === p ? "active" : ""}`}
              data-pal={p}
              onClick={() => setPalette(p)}
              aria-label={`${p} palette`}
            />
          ))}
        </div>

        {/* Tags */}
        <div className="tags">
          <span className="pill coral">
            <span className="star">★</span> token ledger
          </span>
          <span className="pill blue">v1.0</span>
          <span className="pill">Everything client side</span>
        </div>

        {/* Headline */}
        <h1 className="hero">
          where did
          <br />
          <span className="line2">
            the tokens go?
            <span className="arrow">
              <svg width="110" height="96" viewBox="0 0 110 96" fill="none">
                <path
                  d="M 10 12 Q 62 22 90 86"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <path
                  d="M 74 74 L 90 86 L 92 66"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </span>
          </span>
        </h1>

        <p className="lede">
          drop your claude code session. we tally every call, name every{" "}
          <em>cache miss</em>, and snitch on the{" "}
          <span className="coral">output bloat</span>. all client-side. nothing
          leaves the machine. no notes <em>(some notes)</em>.
        </p>

        {/* Drop Card */}
        <div
          className="drop-card"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={(e) => e.preventDefault()}
        >
          <div
            className="drop-input"
            onClick={handleClick}
            role="button"
            tabIndex={0}
          >
            <span className="icon">↓</span>
            <span className="ph">
              drop a .jsonl here, or click to pick one…
            </span>
            <span className="tag">session log</span>
          </div>
          <button className="cta">
            spill the receipts <span className="arr">→</span>
          </button>
        </div>

        <input
          type="file"
          id="fileInput"
          accept=".jsonl,.json,.txt"
          className="visually-hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              handleFileChange(e.target.files[0]);
            }
          }}
        />

        {/* Try Chips */}
        <div className="try-row">
          <span className="label">try one:</span>
          <button className="chip" onClick={() => handleDemoClick("warm")}>
            <b>demo · 22 calls</b>
            <span className="dot"></span>
            <em>the warm one</em>
          </button>
          <button className="chip" onClick={() => handleDemoClick("cold")}>
            <b>demo · 38 calls</b>
            <span className="dot"></span>
            <em>fresh repo, no cache</em>
          </button>
          <button className="chip" onClick={() => handleDemoClick("long")}>
            <b>demo · 70 calls</b>
            <span className="dot"></span>
            <em>marathon refactor</em>
          </button>
        </div>

        {/* Report */}
        {!stats ? (
          <main id="report">
            <div className="empty-art">
              <h3>nothing filed yet.</h3>
              <p>
                drop a session in, or pick a demo above. the receipts will spill
                themselves.
              </p>
            </div>
          </main>
        ) : (
          <main id="report">
            <Report stats={stats} />
          </main>
        )}

        {/* Footer */}
        <footer className="foot">
          <em>typeset in bricolage grotesque &amp; instrument serif.</em>
          <span className="right">source · {sourceLabel}</span>
        </footer>
      </div>

      <div className="drag-overlay" id="dragOverlay">
        drop it.
      </div>
    </div>
  );
}

// Chart rendering functions
function createStackedBarsChart(
  data: Turn[],
  onBarHover?: (turn: Turn | null, x: number) => void,
) {
  const W = 880,
    H = 320;
  const padL = 56,
    padR = 16,
    padT = 18,
    padB = 44;
  const innerW = W - padL - padR,
    innerH = H - padT - padB;
  const n = data.length;
  const slot = innerW / Math.max(n, 1);
  const barW = Math.min(34, Math.max(6, slot * 0.72));
  const maxTok = Math.max(
    1,
    ...data.map((d) => d.inTok + d.outTok + d.cWrite + d.cRead),
  );

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.style.cursor = "default";

  const css = getComputedStyle(document.body);
  const getColor = (name: string) => (css.getPropertyValue(name) || "").trim();
  const colors = {
    ink: getColor("--ink"),
    coral: getColor("--coral"),
    blue: getColor("--blue"),
    mint: getColor("--mint"),
  };

  // Gridlines
  for (let i = 0; i <= 4; i++) {
    const y = padT + (1 - i / 4) * innerH;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(padL));
    line.setAttribute("x2", String(W - padR));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", colors.ink);
    line.setAttribute("stroke-width", i === 0 ? "2" : "1");
    line.setAttribute("stroke-dasharray", i === 0 ? "" : "2 5");
    line.setAttribute("opacity", i === 0 ? "1" : "0.25");
    svg.appendChild(line);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(padL - 10));
    text.setAttribute("y", String(y + 4));
    text.setAttribute("text-anchor", "end");
    text.setAttribute("font-family", "JetBrains Mono, monospace");
    text.setAttribute("font-size", "11");
    text.setAttribute("fill", colors.ink);
    text.setAttribute("opacity", "0.8");
    text.setAttribute("font-weight", "600");
    text.textContent = formatCompact(Math.round((i / 4) * maxTok));
    svg.appendChild(text);
  }

  // Bars
  const SERIES = [
    { key: "inTok", color: colors.ink },
    { key: "cRead", color: colors.blue },
    { key: "cWrite", color: colors.coral },
    { key: "outTok", color: colors.mint },
  ];

  data.forEach((d, i) => {
    const cx = padL + slot * (i + 0.5);
    const x = cx - barW / 2;
    let cursor = H - padB;

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("data-turn-idx", String(i));
    group.style.cursor = "pointer";

    SERIES.forEach((s, si) => {
      const v = d[s.key as keyof Turn] as number;
      if (v <= 0) return;
      let h = (v / maxTok) * innerH;
      if (h < 2) h = 2;
      cursor -= h;

      const isTop = SERIES.slice(si + 1).every(
        (s2) => ((d[s2.key as keyof Turn] as number) || 0) <= 0,
      );
      const r = isTop ? 6 : 0;

      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", roundedTopRect(x, cursor, barW, h, r));
      path.setAttribute("fill", s.color);
      path.setAttribute("stroke", colors.ink);
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("stroke-linejoin", "round");
      group.appendChild(path);
    });

    if (onBarHover) {
      group.addEventListener("mouseenter", () => {
        onBarHover(d, cx);
      });
      group.addEventListener("mouseleave", () => {
        onBarHover(null, 0);
      });
    }

    svg.appendChild(group);
  });

  // X labels
  const step = Math.max(1, Math.ceil(n / 14));
  for (let i = 0; i < n; i += step) {
    const cx = padL + slot * (i + 0.5);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(cx));
    text.setAttribute("y", String(H - padB + 18));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-family", "JetBrains Mono, monospace");
    text.setAttribute("font-size", "11");
    text.setAttribute("fill", colors.ink);
    text.setAttribute("font-weight", "600");
    text.setAttribute("opacity", "0.75");
    text.textContent = "#" + (i + 1);
    svg.appendChild(text);
  }

  return svg;
}

function createContextLineChart(
  data: Turn[],
  onPointHover?: (turn: Turn | null, x: number) => void,
) {
  const W = 540,
    H = 320;
  const padL = 56,
    padR = 18,
    padT = 18,
    padB = 44;
  const innerW = W - padL - padR,
    innerH = H - padT - padB;
  const n = data.length;
  const maxCtx = Math.max(1, ...data.map((d) => d.contextSize));

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.style.cursor = "default";

  const css = getComputedStyle(document.body);
  const getColor = (name: string) => (css.getPropertyValue(name) || "").trim();
  const colors = { ink: getColor("--ink"), coral: getColor("--coral") };

  // Gridlines
  for (let i = 0; i <= 4; i++) {
    const y = padT + (1 - i / 4) * innerH;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(padL));
    line.setAttribute("x2", String(W - padR));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", colors.ink);
    line.setAttribute("stroke-width", i === 0 ? "2" : "1");
    line.setAttribute("stroke-dasharray", i === 0 ? "" : "2 5");
    line.setAttribute("opacity", i === 0 ? "1" : "0.25");
    svg.appendChild(line);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(padL - 10));
    text.setAttribute("y", String(y + 4));
    text.setAttribute("text-anchor", "end");
    text.setAttribute("font-family", "JetBrains Mono, monospace");
    text.setAttribute("font-size", "11");
    text.setAttribute("fill", colors.ink);
    text.setAttribute("opacity", "0.8");
    text.setAttribute("font-weight", "600");
    text.textContent = formatCompact(Math.round((i / 4) * maxCtx));
    svg.appendChild(text);
  }

  // Points
  const pts = data.map((d, i) => {
    const x = padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = padT + (1 - d.contextSize / maxCtx) * innerH;
    return [x, y] as [number, number];
  });

  // Area and line
  const path = smoothPath(pts);
  const areaPath =
    path +
    ` L ${pts[pts.length - 1][0]},${H - padB} L ${pts[0][0]},${H - padB} Z`;

  const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
  area.setAttribute("d", areaPath);
  area.setAttribute("fill", colors.coral);
  area.setAttribute("opacity", "0.18");
  svg.appendChild(area);

  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.setAttribute("d", path);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", colors.ink);
  line.setAttribute("stroke-width", "3");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke-linejoin", "round");
  svg.appendChild(line);

  // Dots
  const dotStep = Math.max(1, Math.ceil(n / 10));
  pts.forEach(([x, y], i) => {
    if (i % dotStep !== 0 && i !== n - 1) return;
    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    circle.setAttribute("r", "5.5");
    circle.setAttribute("fill", colors.coral);
    circle.setAttribute("stroke", colors.ink);
    circle.setAttribute("stroke-width", "2");
    circle.style.cursor = "pointer";

    if (onPointHover) {
      circle.addEventListener("mouseenter", () => {
        onPointHover(data[i], x);
      });
      circle.addEventListener("mouseleave", () => {
        onPointHover(null, 0);
      });
    }

    svg.appendChild(circle);
  });

  return svg;
}

function createCostCompareChart(
  totals: Stats["totals"],
  onBarHover?: (label: string | null, val: number, x: number) => void,
) {
  const W = 460,
    H = 280;
  const padL = 40,
    padR = 24,
    padT = 28,
    padB = 56;
  const innerW = W - padL - padR,
    innerH = H - padT - padB;
  const max = Math.max(totals.noCache, totals.actual, 0.0001);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.style.cursor = "default";

  const css = getComputedStyle(document.body);
  const getColor = (name: string) => (css.getPropertyValue(name) || "").trim();
  const colors = {
    ink: getColor("--ink"),
    coral: getColor("--coral"),
    mint: getColor("--mint"),
    paper: getColor("--paper"),
  };

  const items = [
    { lab: "without cache", val: totals.noCache, color: colors.coral },
    { lab: "actual", val: totals.actual, color: colors.mint },
  ];

  const barW = innerW / 2 - 24;
  items.forEach((it, i) => {
    const x = padL + i * (innerW / 2) + 12;
    const h = (it.val / max) * innerH;
    const y = padT + (innerH - h);
    const r = Math.min(14, h / 2);

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.style.cursor = "pointer";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      `M${x},${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${padT + innerH} H${x} Z`,
    );
    path.setAttribute("fill", it.color);
    path.setAttribute("stroke", colors.ink);
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("stroke-linejoin", "round");
    group.appendChild(path);

    if (onBarHover) {
      group.addEventListener("mouseenter", () => {
        onBarHover(it.lab, it.val, x + barW / 2);
      });
      group.addEventListener("mouseleave", () => {
        onBarHover(null, 0, 0);
      });
    }

    svg.appendChild(group);

    const v = document.createElementNS("http://www.w3.org/2000/svg", "text");
    v.setAttribute("x", String(x + barW / 2));
    v.setAttribute("y", String(y - 12));
    v.setAttribute("text-anchor", "middle");
    v.setAttribute("font-family", "Bricolage Grotesque, sans-serif");
    v.setAttribute("font-weight", "800");
    v.setAttribute("font-size", "30");
    v.setAttribute("fill", colors.ink);
    v.textContent = formatMoneyShort(it.val);
    svg.appendChild(v);

    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", String(x + barW / 2));
    t.setAttribute("y", String(padT + innerH + 22));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-family", "Bricolage Grotesque, sans-serif");
    t.setAttribute("font-weight", "600");
    t.setAttribute("font-size", "15");
    t.setAttribute("fill", colors.ink);
    t.textContent = it.lab;
    svg.appendChild(t);
  });

  // Baseline
  const baseline = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "line",
  );
  baseline.setAttribute("x1", String(padL));
  baseline.setAttribute("x2", String(W - padR));
  baseline.setAttribute("y1", String(padT + innerH));
  baseline.setAttribute("y2", String(padT + innerH));
  baseline.setAttribute("stroke", colors.ink);
  baseline.setAttribute("stroke-width", "2.5");
  baseline.setAttribute("stroke-linecap", "round");
  svg.appendChild(baseline);

  return svg;
}

// Helper functions
function roundedTopRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  if (r <= 0) return `M${x},${y} h${w} v${h} h${-w} z`;
  r = Math.min(r, h, w / 2);
  return `M${x},${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} H${x} Z`;
}

function smoothPath(pts: [number, number][]): string {
  if (!pts.length) return "";
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1],
      [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

function formatCompact(n: number): string {
  if (!n) return "0";
  if (n >= 1e6)
    return (n / 1e6).toFixed(n >= 1e7 ? 0 : 2).replace(/\.?0+$/, "") + "M";
  if (n >= 1e3)
    return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.?0+$/, "") + "k";
  return String(n);
}

function formatMoneyShort(n: number): string {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (n >= 100) return "$" + n.toFixed(0);
  if (n >= 1) return "$" + n.toFixed(2);
  return "$" + n.toFixed(3);
}

function Report({ stats }: { stats: Stats }) {
  const T = stats.totals;
  const barChartRef = useRef<HTMLDivElement>(null);
  const lineChartRef = useRef<HTMLDivElement>(null);
  const costChartRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipData, setTooltipData] = useState<{
    type: "turn" | "context" | "cost";
    data: any;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const fmtInt = (n: number) => (n || 0).toLocaleString("en-US");
  const fmtMoney = (n: number) => "$" + (n || 0).toFixed(2);
  const fmtMoneyShort = (n: number) => {
    if (n >= 1000) return "$" + (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    if (n >= 100) return "$" + n.toFixed(0);
    if (n >= 1) return "$" + n.toFixed(2);
    return "$" + n.toFixed(3);
  };

  const handleBarHover = (turn: Turn | null, svgX: number) => {
    if (turn && barChartRef.current) {
      const svgElem = barChartRef.current.querySelector("svg");
      if (svgElem) {
        const svgRect = svgElem.getBoundingClientRect();
        const scale = svgRect.width / 880;
        setTooltipData({ type: "turn", data: turn });
        setTooltipPos({
          x: svgRect.left + svgX * scale,
          y: svgRect.top - 8,
        });
      }
    } else {
      setTooltipData(null);
    }
  };

  const handlePointHover = (turn: Turn | null, svgX: number) => {
    if (turn && lineChartRef.current) {
      const svgElem = lineChartRef.current.querySelector("svg");
      if (svgElem) {
        const svgRect = svgElem.getBoundingClientRect();
        const scale = svgRect.width / 540;
        setTooltipData({ type: "context", data: turn });
        setTooltipPos({
          x: svgRect.left + svgX * scale,
          y: svgRect.top - 8,
        });
      }
    } else {
      setTooltipData(null);
    }
  };

  const handleCostHover = (label: string | null, val: number, svgX: number) => {
    if (label && costChartRef.current) {
      const svgElem = costChartRef.current.querySelector("svg");
      if (svgElem) {
        const svgRect = svgElem.getBoundingClientRect();
        const scale = svgRect.width / 460;
        setTooltipData({ type: "cost", data: { label, val } });
        setTooltipPos({
          x: svgRect.left + svgX * scale,
          y: svgRect.top - 8,
        });
      }
    } else {
      setTooltipData(null);
    }
  };

  useEffect(() => {
    if (barChartRef.current) {
      barChartRef.current.innerHTML = "";
      barChartRef.current.appendChild(
        createStackedBarsChart(stats.turns, handleBarHover),
      );
    }
    if (lineChartRef.current) {
      lineChartRef.current.innerHTML = "";
      lineChartRef.current.appendChild(
        createContextLineChart(stats.turns, handlePointHover),
      );
    }
    if (costChartRef.current) {
      costChartRef.current.innerHTML = "";
      costChartRef.current.appendChild(
        createCostCompareChart(T, handleCostHover),
      );
    }
  }, [stats]);

  const statCards = [
    {
      kind: "coral",
      icon: "☎",
      label: "api calls",
      big: fmtInt(stats.turns.length),
      sub: "deduped by message.id",
    },
    {
      kind: "pink",
      icon: "↘",
      label: "tokens in",
      big: fmtInt(T.in + T.cw + T.cr),
      sub: `${fmtInt(T.cw)} cache·w · ${fmtInt(T.cr)} cache·r`,
    },
    {
      kind: "mint",
      icon: "↗",
      label: "tokens out",
      big: fmtInt(T.out),
      sub: `${Math.round((T.out / (T.in + T.cw + T.cr)) * 100)}% of what we sent in`,
    },
    {
      kind: "",
      icon: "$",
      label: "you spent",
      big: fmtMoneyShort(T.actual),
      sub: `would have been ${fmtMoneyShort(T.noCache)}`,
    },
    {
      kind: "blue",
      icon: "%",
      label: "cache saved you",
      big: stats.savedPct + "%",
      sub: `that's ${fmtMoneyShort(T.noCache - T.actual)} kept`,
    },
  ];

  return (
    <>
      <section className="stats">
        {statCards.map((s, i) => (
          <div key={i} className={`stat ${s.kind}`}>
            <div className="icon-tag">{s.icon}</div>
            <div>
              <div className="label">{s.label}</div>
              <div className="big">{s.big}</div>
              <div className="sub">{s.sub}</div>
            </div>
          </div>
        ))}
      </section>

      <div className="sec-head">
        <h2>
          the caching <em>story.</em>
        </h2>
        <div className="note">
          every call's diet, stacked. tall bars are expensive bars.
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 className="ctitle">tokens per call</h3>
          <p className="cdek">
            input, cache writes, cache reads, output — stacked.
          </p>
          <div ref={barChartRef} />
          <div className="legend">
            <span className="sw">
              <span className="box" style={{ background: "var(--ink)" }}></span>
              input
            </span>
            <span className="sw">
              <span
                className="box"
                style={{ background: "var(--blue)" }}
              ></span>
              cache read
            </span>
            <span className="sw">
              <span
                className="box"
                style={{ background: "var(--coral)" }}
              ></span>
              cache write
            </span>
            <span className="sw">
              <span
                className="box"
                style={{ background: "var(--mint)" }}
              ></span>
              output
            </span>
          </div>
        </div>
        <div className="card tinted">
          <h3 className="ctitle">context growth</h3>
          <p className="cdek">
            how much conversation the model is reading each turn.
          </p>
          <div ref={lineChartRef} />
        </div>
      </div>

      {tooltipData && (
        <div
          ref={tooltipRef}
          className="chart-tooltip"
          style={{
            position: "fixed",
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            zIndex: 1000,
          }}
        >
          {tooltipData.type === "turn" && (
            <>
              <div className="tt-row">
                <span className="tt-label">call #{tooltipData.data.idx}</span>
                <span className="tt-time">
                  {tooltipData.data.ts
                    ? new Date(tooltipData.data.ts).toLocaleTimeString(
                        "en-US",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        },
                      )
                    : "—"}
                </span>
              </div>
              <div className="tt-divider" />
              <div className="tt-row">
                <span className="tt-label">input</span>
                <span className="tt-value">
                  {fmtInt(tooltipData.data.inTok)}
                </span>
              </div>
              <div className="tt-row">
                <span className="tt-label">cache read</span>
                <span className="tt-value">
                  {fmtInt(tooltipData.data.cRead)}
                </span>
              </div>
              <div className="tt-row">
                <span className="tt-label">cache write</span>
                <span className="tt-value">
                  {fmtInt(tooltipData.data.cWrite)}
                </span>
              </div>
              <div className="tt-row">
                <span className="tt-label">output</span>
                <span className="tt-value">
                  {fmtInt(tooltipData.data.outTok)}
                </span>
              </div>
              <div className="tt-divider" />
              <div className="tt-row">
                <span className="tt-label">total</span>
                <span className="tt-value">
                  {fmtInt(
                    tooltipData.data.inTok +
                      tooltipData.data.cRead +
                      tooltipData.data.cWrite +
                      tooltipData.data.outTok,
                  )}
                </span>
              </div>
              <div className="tt-row">
                <span className="tt-label">cost</span>
                <span className="tt-value">
                  {fmtMoney(tooltipData.data.actualCost)}
                </span>
              </div>
            </>
          )}
          {tooltipData.type === "context" && (
            <>
              <div className="tt-row">
                <span className="tt-label">call #{tooltipData.data.idx}</span>
                <span className="tt-time">
                  {tooltipData.data.ts
                    ? new Date(tooltipData.data.ts).toLocaleTimeString(
                        "en-US",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        },
                      )
                    : "—"}
                </span>
              </div>
              <div className="tt-divider" />
              <div className="tt-row">
                <span className="tt-label">context size</span>
                <span className="tt-value">
                  {fmtInt(tooltipData.data.contextSize)}
                </span>
              </div>
            </>
          )}
          {tooltipData.type === "cost" && (
            <>
              <div className="tt-row">
                <span className="tt-label">{tooltipData.data.label}</span>
              </div>
              <div className="tt-divider" />
              <div className="tt-row">
                <span className="tt-label">cost</span>
                <span className="tt-value">
                  {fmtMoney(tooltipData.data.val)}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="sec-head">
        <h2>
          the <em>damage.</em>
        </h2>
        <div className="note">
          sonnet 4 list pricing. cache hits priced at 10% of input.
        </div>
      </div>

      <div className="grid-3">
        <div className="card">
          <h3 className="ctitle">itemized</h3>
          <p className="cdek">every line of the invoice, no padding.</p>
          <div className="bill-list">
            <div className="bill-line">
              <span className="l">input · {fmtInt(T.in)} tok @ $3</span>
              <span className="v">{fmtMoney((T.in * PRICE.input) / 1e6)}</span>
            </div>
            <div className="bill-line">
              <span className="l">output · {fmtInt(T.out)} tok @ $15</span>
              <span className="v">
                {fmtMoney((T.out * PRICE.output) / 1e6)}
              </span>
            </div>
            <div className="bill-line">
              <span className="l">
                cache write · {fmtInt(T.cw)} tok @ $3.75
              </span>
              <span className="v">
                {fmtMoney((T.cw * PRICE.cache_creation) / 1e6)}
              </span>
            </div>
            <div className="bill-line">
              <span className="l">cache read · {fmtInt(T.cr)} tok @ $0.30</span>
              <span className="v">
                {fmtMoney((T.cr * PRICE.cache_read) / 1e6)}
              </span>
            </div>
          </div>
          <div className="bill-total">
            <span className="lab">total paid</span>
            <span className="val">{fmtMoney(T.actual)}</span>
          </div>
          <div className="bill-foot">
            vs. {fmtMoney(T.noCache)} without caching — a {stats.savedPct}%
            discount.
          </div>
        </div>

        <div className="card tinted">
          <h3 className="ctitle">with cache vs without</h3>
          <p className="cdek">same conversation, two universes.</p>
          <div ref={costChartRef} />
        </div>

        <div className="card">
          <h3 className="ctitle">tools called</h3>
          <p className="cdek">
            {Object.values(stats.toolCounts).reduce((a, b) => a + b, 0)}{" "}
            invocations across {Object.keys(stats.toolCounts).length} tools.
          </p>
          <div className="tool-grid">
            {Object.entries(stats.toolCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => (
                <div key={name} className="tool-row">
                  <span className="name">{name}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${(count / Math.max(...Object.values(stats.toolCounts))) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="count">{count}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="sec-head">
        <h2>
          the <em>ledger.</em>
        </h2>
        <div className="note">
          every turn, in order. scroll like an auditor.
        </div>
      </div>

      <div className="card table-card">
        <div className="table-head">
          <h3>
            {stats.turns.length} calls · {fmtInt(T.in + T.cw + T.cr + T.out)}{" "}
            total tokens
          </h3>
          <span className="meta">
            {stats.earliestTs
              ? new Date(stats.earliestTs).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "no timestamps"}
          </span>
        </div>
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th className="l">#</th>
                <th className="l">time</th>
                <th>input</th>
                <th>cache·w</th>
                <th>cache·r</th>
                <th>output</th>
                <th>context</th>
                <th>cost</th>
                <th className="l">tools</th>
              </tr>
            </thead>
            <tbody>
              {stats.turns.map((t) => (
                <tr key={t.idx}>
                  <td className="l idx">{t.idx}</td>
                  <td className="l">
                    {t.ts
                      ? new Date(t.ts).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td>{fmtInt(t.inTok)}</td>
                  <td className="cw">{fmtInt(t.cWrite)}</td>
                  <td className="cr">{fmtInt(t.cRead)}</td>
                  <td>{fmtInt(t.outTok)}</td>
                  <td>{fmtInt(t.contextSize)}</td>
                  <td className="cost">{fmtMoneyShort(t.actualCost)}</td>
                  <td className="tools">
                    {t.tools.length ? (
                      t.tools.map((n, i) => (
                        <span key={`${t.idx}-tool-${i}`} className="tt">
                          {n}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: "#a39c87" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
