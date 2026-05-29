"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

interface Datum {
  i: number;
  cr: number;
  cw: number;
  o: number;
}

interface Rule {
  num: string;
  kicker: string;
  title: ReactNode;
  badTitle: string;
  goodTitle: string;
  bad: Datum[];
  good: Datum[];
  takeaway: ReactNode;
}

const N = (i: number, cr: number, cw: number, o: number): Datum => ({
  i,
  cr,
  cw,
  o,
});

function seq(n: number, fn: (i: number) => Datum): Datum[] {
  const out: Datum[] = [];
  for (let i = 0; i < n; i++) out.push(fn(i));
  return out;
}

const RULES: Record<number, Rule> = {
  1: {
    num: "01",
    kicker: "cache preservation",
    title: (
      <>
        pick a model. <em>stick with it.</em>
      </>
    ),
    badTitle: "sonnet → opus → sonnet",
    goodTitle: "sonnet, start to finish",
    bad: [
      N(18, 28000, 600, 420),
      N(22, 32000, 500, 380),
      N(20, 36000, 600, 510),
      N(28, 0, 115000, 620),
      N(22, 18000, 500, 470),
      N(20, 32000, 600, 440),
      N(25, 45000, 700, 450),
      N(28, 0, 155000, 620),
      N(22, 22000, 500, 470),
      N(20, 38000, 600, 440),
    ],
    good: [
      N(18, 28000, 800, 420),
      N(22, 32000, 500, 380),
      N(20, 36000, 600, 510),
      N(25, 40000, 700, 450),
      N(19, 44000, 400, 390),
      N(24, 48000, 600, 480),
      N(20, 52000, 800, 420),
      N(22, 55000, 500, 400),
      N(21, 58000, 600, 470),
      N(20, 61000, 400, 380),
    ],
    takeaway:
      "Two switches, at call 4 and call 8 — each one re-uploads the entire conversation to the new model's cache. Those two calls alone cost more than the other eight combined.",
  },
  2: {
    num: "02",
    kicker: "context management",
    title: (
      <>
        <code>/compact</code> at <em>~70%.</em>
      </>
    ),
    badTitle: "never compacted",
    goodTitle: "compacted at call 7",
    bad: seq(12, (i) => N(22, Math.round(20000 + i * 17500), 600, 420)),
    good: seq(12, (i) =>
      i < 7
        ? N(22, Math.round(20000 + i * 17500), 600, 420)
        : N(22, Math.round(25000 + (i - 7) * 12000), 800, 420),
    ),
    takeaway:
      "Without /compact, every turn re-reads the whole history. Compacting once at the 70% mark resets the baseline — and the next ten turns ride a flatter curve.",
  },
  3: {
    num: "03",
    kicker: "CLAUDE.md",
    title: (
      <>
        under <em>200 lines.</em>
      </>
    ),
    badTitle: "bloated CLAUDE.md (~600 lines)",
    goodTitle: "lean CLAUDE.md (~150 lines)",
    bad: seq(8, (i) => N(20, 38000 + i * 4000, 600, 420)),
    good: seq(8, (i) => N(20, 11000 + i * 4000, 600, 420)),
    takeaway:
      "Every call pays the CLAUDE.md tax. A 600-line file is a ~28k-token surcharge applied to every single message of the session.",
  },
  4: {
    num: "04",
    kicker: "model choice",
    title: (
      <>
        decide <em>before</em> you start.
      </>
    ),
    badTitle: "opus for routine work",
    goodTitle: "sonnet for routine work",
    bad: seq(8, (i) => N(22, 32000 + i * 4000, 600, 1800 + (i % 3) * 400)),
    good: seq(8, (i) => N(22, 32000 + i * 4000, 600, 420 + (i % 3) * 60)),
    takeaway:
      "Same task, same context — Opus simply writes longer. And output tokens are billed at $75/Mtok on Opus vs $15 on Sonnet. The output stripe alone is the difference.",
  },
  5: {
    num: "05",
    kicker: "prompting",
    title: (
      <>
        be <em>specific.</em>
      </>
    ),
    badTitle: "“improve the codebase”",
    goodTitle: "“add validation to login in auth.ts”",
    bad: [
      N(18, 18000, 400, 320),
      N(20, 22000, 500, 380),
      N(22, 26000, 400, 420),
      N(19, 30000, 600, 360),
      N(21, 34000, 500, 400),
      N(20, 38000, 400, 380),
      N(22, 42000, 500, 420),
      N(20, 46000, 600, 380),
      N(24, 50000, 800, 480),
      N(22, 54000, 600, 420),
    ],
    good: [
      N(60, 12000, 2200, 520),
      N(28, 18000, 400, 460),
      N(26, 22000, 500, 520),
      N(24, 28000, 400, 480),
    ],
    takeaway:
      "A vague prompt sends Claude exploring. Ten exploratory calls before useful work — vs four focused ones when the ask is precise.",
  },
  6: {
    num: "06",
    kicker: "subagents",
    title: (
      <>
        delegate the <em>noise.</em>
      </>
    ),
    badTitle: "tests + logs in main thread",
    goodTitle: "tests + logs in a subagent",
    bad: seq(10, (i) => N(22, 28000 + i * 8500, i === 3 ? 12000 : 600, 420)),
    good: seq(10, (i) =>
      i === 3 ? N(22, 32000, 2400, 380) : N(22, 30000 + i * 1200, 600, 420),
    ),
    takeaway:
      "Verbose tool output stays in the subagent's context. Only the summary lands back in yours — the main thread keeps reading a small, flat baseline.",
  },
  7: {
    num: "07",
    kicker: "MCP servers",
    title: (
      <>
        trim. <em>then commit.</em>
      </>
    ),
    badTitle: "12 MCP servers, ~80 tools",
    goodTitle: "3 MCP servers, ~18 tools",
    bad: seq(8, (i) => N(20, 46000 + i * 4000, 1200, 420)),
    good: seq(8, (i) => N(20, 14000 + i * 4000, 400, 420)),
    takeaway:
      "Every tool definition rides in the system prompt on every call. Dropping unused servers is a baseline cut applied to the entire session.",
  },
  8: {
    num: "08",
    kicker: "extended thinking",
    title: <>don&apos;t think when you don&apos;t need to.</>,
    badTitle: "full extended thinking",
    goodTitle: "thinking disabled",
    bad: seq(6, (i) => N(22, 30000 + i * 4000, 600, 3200 + (i % 2) * 400)),
    good: seq(6, (i) => N(22, 30000 + i * 4000, 600, 420)),
    takeaway:
      "Thinking tokens are output tokens — billed at the full output rate ($15/Mtok on Sonnet). Invisible to you, very visible on the invoice.",
  },
  9: {
    num: "09",
    kicker: "cache ttl awareness",
    title: (
      <>
        mind the <em>clock.</em>
      </>
    ),
    badTitle: "pro plan · 5-min TTL",
    goodTitle: "max plan · 1-hour TTL",
    bad: [
      N(18, 28000, 500, 400),
      N(22, 32000, 500, 380),
      N(20, 36000, 600, 440),
      N(25, 40000, 700, 450),
      N(19, 44000, 400, 390),
      N(22, 0, 48000, 420),
      N(20, 12000, 500, 420),
      N(22, 28000, 500, 400),
    ],
    good: [
      N(18, 28000, 500, 400),
      N(22, 32000, 500, 380),
      N(20, 36000, 600, 440),
      N(25, 40000, 700, 450),
      N(19, 44000, 400, 390),
      N(22, 48000, 600, 420),
      N(24, 52000, 500, 420),
      N(22, 55000, 500, 400),
    ],
    takeaway:
      "Same session, same idle gap. On Pro the cache expired during your coffee — call 6 is a full cold rebuild. On Max the cache was still warm.",
  },
  10: {
    num: "10",
    kicker: ".claudeignore",
    title: (
      <>
        tell it what <em>not</em> to read.
      </>
    ),
    badTitle: "no ignore file",
    goodTitle: "with .claudeignore",
    bad: [
      N(20, 28000, 600, 400),
      N(22, 32000, 500, 420),
      N(24, 36000, 42000, 460),
      N(20, 40000, 800, 400),
      N(22, 42000, 600, 420),
      N(20, 44000, 56000, 440),
      N(24, 48000, 700, 400),
      N(22, 52000, 500, 420),
      N(20, 54000, 38000, 440),
      N(22, 58000, 800, 420),
    ],
    good: [
      N(20, 28000, 600, 400),
      N(22, 32000, 500, 420),
      N(24, 34000, 600, 460),
      N(20, 36000, 500, 400),
      N(22, 38000, 600, 420),
      N(20, 40000, 500, 440),
      N(24, 42000, 500, 400),
      N(22, 44000, 600, 420),
      N(20, 46000, 500, 440),
      N(22, 48000, 600, 420),
    ],
    takeaway:
      "The bad days are when Claude grep's a lockfile or wanders into node_modules — each pulls tens of thousands of tokens into cache. Three of those in a session and you've doubled the bill.",
  },
};

function totalOf(d: Datum): number {
  return d.i + d.cr + d.cw + d.o;
}

function fmtCompact(n: number): string {
  if (!n) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3)
    return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.?0+$/, "") + "k";
  return String(Math.round(n));
}

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

function StackedBarsChart({
  data,
  sharedMax,
  colors,
}: {
  data: Datum[];
  sharedMax: number;
  colors: { ink: string; coral: string; blue: string; mint: string };
}) {
  const W = 520;
  const H = 240;
  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = data.length;
  const slot = innerW / Math.max(n, 1);
  const barW = Math.min(28, Math.max(5, slot * 0.72));
  const MIN_H = 2;
  const SERIES: { key: keyof Datum; color: string }[] = [
    { key: "i", color: colors.ink },
    { key: "cr", color: colors.blue },
    { key: "cw", color: colors.coral },
    { key: "o", color: colors.mint },
  ];

  const grid: ReactNode[] = [];
  for (let g = 0; g <= 4; g++) {
    const y = padT + (1 - g / 4) * innerH;
    grid.push(
      <line
        key={`gline-${g}`}
        x1={padL}
        x2={W - padR}
        y1={y}
        y2={y}
        stroke={colors.ink}
        strokeWidth={g === 0 ? 2 : 1}
        strokeDasharray={g === 0 ? undefined : "2 5"}
        opacity={g === 0 ? 1 : 0.22}
      />,
      <text
        key={`gtxt-${g}`}
        x={padL - 8}
        y={y + 3.5}
        textAnchor="end"
        fontFamily="JetBrains Mono, monospace"
        fontSize={10}
        fill={colors.ink}
        opacity={0.75}
        fontWeight={600}
      >
        {fmtCompact((g / 4) * sharedMax)}
      </text>,
    );
  }

  const bars: ReactNode[] = [];
  data.forEach((d, i) => {
    const cx = padL + slot * (i + 0.5);
    const x = cx - barW / 2;
    let cursor = H - padB;
    SERIES.forEach((s, si) => {
      const v = d[s.key];
      if (v <= 0) return;
      let h = (v / sharedMax) * innerH;
      if (h < MIN_H) h = MIN_H;
      cursor -= h;
      const isTop = SERIES.slice(si + 1).every((s2) => (d[s2.key] || 0) <= 0);
      const r = isTop ? 4 : 0;
      bars.push(
        <path
          key={`bar-${i}-${si}`}
          d={roundedTopRect(x, cursor, barW, h, r)}
          fill={s.color}
          stroke={colors.ink}
          strokeWidth={1.25}
          strokeLinejoin="round"
        />,
      );
    });
  });

  const xLabels: ReactNode[] = [];
  const step = Math.max(1, Math.ceil(n / 8));
  for (let i = 0; i < n; i += step) {
    const cx = padL + slot * (i + 0.5);
    xLabels.push(
      <text
        key={`xl-${i}`}
        x={cx}
        y={H - padB + 15}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize={10}
        fill={colors.ink}
        fontWeight={600}
        opacity={0.7}
      >
        {"#" + (i + 1)}
      </text>,
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="modal-chart"
      preserveAspectRatio="xMidYMid meet"
    >
      {grid}
      {bars}
      {xLabels}
    </svg>
  );
}

// Kept in sync with the CSS palette variables in globals.css. The chart needs
// concrete hex values (SVG fills don't read CSS vars during attribute updates),
// so we mirror them here.
const PALETTE_COLORS: Record<
  string,
  { ink: string; coral: string; blue: string; mint: string }
> = {
  workshop: {
    ink: "#1c1814",
    coral: "#e16b3a",
    blue: "#2a5d8a",
    mint: "#6f9656",
  },
  cream: { ink: "#14233f", coral: "#ff6447", blue: "#2d5be0", mint: "#4dc093" },
  sage: { ink: "#1d2f25", coral: "#c25535", blue: "#2b5e7a", mint: "#4f7a3e" },
  plum: { ink: "#2a1834", coral: "#c64a7a", blue: "#4a4d8a", mint: "#6b9656" },
  slate: { ink: "#0e1f37", coral: "#d4543c", blue: "#3573b0", mint: "#5a8d6b" },
};

export default function Guide() {
  const [palette, setPalette] = useState("cream");
  // modal temporarily disabled — cards are display-only for now
  // const [openRuleNum, setOpenRuleNum] = useState<number | null>(null);

  const colors = useMemo(
    () => PALETTE_COLORS[palette] ?? PALETTE_COLORS.workshop,
    [palette],
  );

  useEffect(() => {
    document.body.setAttribute("data-palette", palette);
  }, [palette]);

  // useEffect(() => {
  //   if (openRuleNum === null) {
  //     document.body.style.overflow = "";
  //     return;
  //   }
  //   document.body.style.overflow = "hidden";
  //   const onKey = (e: KeyboardEvent) => {
  //     if (e.key === "Escape") setOpenRuleNum(null);
  //   };
  //   document.addEventListener("keydown", onKey);
  //   return () => {
  //     document.removeEventListener("keydown", onKey);
  //     document.body.style.overflow = "";
  //   };
  // }, [openRuleNum]);

  // const closeModal = useCallback(() => setOpenRuleNum(null), []);
  // const onCardKey = (
  //   e: React.KeyboardEvent<HTMLElement>,
  //   ruleNum: number,
  // ) => {
  //   if (e.key === "Enter" || e.key === " ") {
  //     e.preventDefault();
  //     setOpenRuleNum(ruleNum);
  //   }
  // };

  const chap = (_ruleNum: number, extraClass: string, body: ReactNode) => (
    // modal trigger temporarily disabled — cards are display-only for now
    <article className={`chap ${extraClass}`}>
      {body}
      {/* <span className="open-hint">
        see the chart <span style={{ fontSize: 14 }}>→</span>
      </span> */}
    </article>
  );

  // const rule = openRuleNum !== null ? RULES[openRuleNum] : null;
  // const badTotal = rule ? rule.bad.reduce((a, d) => a + totalOf(d), 0) : 0;
  // const goodTotal = rule ? rule.good.reduce((a, d) => a + totalOf(d), 0) : 0;
  // const sharedMax = rule
  //   ? Math.max(...rule.bad.map(totalOf), ...rule.good.map(totalOf), 1)
  //   : 1;
  // const savedTokens = badTotal - goodTotal;
  // const savedPct = badTotal > 0 ? Math.round((savedTokens / badTotal) * 100) : 0;

  return (
    <div style={{ backgroundColor: "var(--cream)" }}>
      <div className="page">
        <div className="top-bar">
          <Link href="/" className="nav-link" title="back to the ledger">
            <span className="ar">←</span> <span>the ledger</span>
          </Link>
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
        </div>

        <div className="tags">
          <span className="pill coral">
            <span className="star">★</span> token saver
          </span>
          <span className="pill blue">field guide · v1</span>
          <span className="pill">10 rules · 4 min read</span>
        </div>

        <h1 className="hero">
          save the
          <br />
          <span className="line2">
            tokens.
            <span className="arrow" aria-hidden="true">
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
            <em>(the expensive ones.)</em>
          </span>
        </h1>

        <p className="lede">
          a pocket guide to spending less on claude code. ten rules, in order of
          how much they actually move the needle. <em>read it before</em> you
          start a long session — <span className="coral">not after</span> the
          receipts come in.
        </p>

        <section className="tldr">
          <div className="stat coral">
            <div className="icon-tag">★</div>
            <div>
              <div className="label">the headline rule</div>
              <div className="big">don&apos;t switch</div>
              <div className="sub">
                never change models mid-session. each one has its own cache.
              </div>
            </div>
          </div>
          <div className="stat">
            <div className="icon-tag">⏱</div>
            <div>
              <div className="label">cache ttl</div>
              <div className="big">
                5 min <em>/ 1 hr</em>
              </div>
              <div className="sub">
                pro plan vs. max. don&apos;t go idle on pro mid-task.
              </div>
            </div>
          </div>
          <div className="stat mint">
            <div className="icon-tag">⌘</div>
            <div>
              <div className="label">CLAUDE.md cap</div>
              <div className="big">≤ 200 lines</div>
              <div className="sub">loaded every session. essentials only.</div>
            </div>
          </div>
          <div className="stat blue">
            <div className="icon-tag">%</div>
            <div>
              <div className="label">compact early</div>
              <div className="big">at ~70%</div>
              <div className="sub">
                not the default 95. preserve current goal, errors, decisions.
              </div>
            </div>
          </div>
        </section>

        <div className="sec-head">
          <h2>
            the <em>ten</em> rules.
          </h2>
          <div className="note">
            ordered roughly by impact. the cache one matters more than all the
            others combined.
          </div>
        </div>

        <section className="chapters">
          {chap(
            1,
            "full coral",
            <>
              <div className="star-badge">most important</div>
              <div className="ch-head">
                <div className="ch-num">01</div>
                <div className="ch-titles">
                  <div className="ch-kicker">cache preservation</div>
                  <h3 className="ch-title">
                    pick a model. <em>stick with it.</em>
                  </h3>
                </div>
              </div>
              <ul>
                <li>
                  <b>Never switch models mid-session.</b> Each model has its own
                  cache; switching forces a full cold re-read of identical
                  content.
                </li>
                <li>
                  Don&apos;t add or remove MCP servers mid-session — changing
                  the tool list busts the cache.
                </li>
                <li>
                  Decide your model at session start; if a subtask needs a
                  cheaper one, spin a subagent or open a fresh short session —
                  never switch the main one.
                </li>
              </ul>
              <div className="feature-callout">
                rule of thumb: the cache is a coffee that goes cold the second
                you stir it. don&apos;t stir.
              </div>
            </>,
          )}

          {chap(
            2,
            "wide tinted",
            <>
              <div className="ch-head">
                <div className="ch-num">02</div>
                <div className="ch-titles">
                  <div className="ch-kicker">context management</div>
                  <h3 className="ch-title">clear, compact, watch.</h3>
                </div>
              </div>
              <ul>
                <li>
                  Use <code>/clear</code> between unrelated tasks — stale
                  context costs tokens on every message.
                </li>
                <li>
                  Run <code>/compact</code> <b>at ~70%</b>, not the default 95%.
                </li>
                <li>
                  Add custom compact instructions: keep current goal, changed
                  files, errors, decisions. Drop everything else.
                </li>
                <li>
                  Keep <code>/usage</code> open and glance at it.
                </li>
              </ul>
            </>,
          )}

          {chap(
            3,
            "wide mint",
            <>
              <div className="ch-head">
                <div className="ch-num">03</div>
                <div className="ch-titles">
                  <div className="ch-kicker">CLAUDE.md</div>
                  <h3 className="ch-title">
                    under 200 lines. <em>essentials only.</em>
                  </h3>
                </div>
              </div>
              <ul>
                <li>
                  It loads <b>every single session</b> — every line is a tax you
                  pay forever.
                </li>
                <li>
                  Move workflow-specific instructions (PR review, migrations,
                  etc.) into Skills so they load <b>on demand</b>.
                </li>
                <li>
                  If you can&apos;t justify a line to a future you, it
                  shouldn&apos;t be there.
                </li>
              </ul>
            </>,
          )}

          {chap(
            4,
            "",
            <>
              <div className="ch-head">
                <div className="ch-num">04</div>
                <div className="ch-titles">
                  <div className="ch-kicker">model choice</div>
                  <h3 className="ch-title">
                    decide <em>before</em> you start.
                  </h3>
                </div>
              </div>
              <ul>
                <li>
                  Default to <b>Sonnet</b>.
                </li>
                <li>
                  Opus only for genuinely hard architectural / reasoning work.
                </li>
                <li>Haiku for subagents doing simple things.</li>
                <li>
                  Decide upfront — switching mid-session breaks the cache (see
                  Rule 01).
                </li>
              </ul>
            </>,
          )}

          {chap(
            5,
            "",
            <>
              <div className="ch-head">
                <div className="ch-num">05</div>
                <div className="ch-titles">
                  <div className="ch-kicker">prompting</div>
                  <h3 className="ch-title">
                    be <em>specific.</em>
                  </h3>
                </div>
              </div>
              <ul>
                <li>
                  &quot;add input validation to the login function in{" "}
                  <code>auth.ts</code>&quot; — not &quot;improve the
                  codebase&quot;.
                </li>
                <li>
                  Use <b>plan mode</b> (Shift+Tab) before complex tasks so
                  Claude doesn&apos;t burn tokens going down the wrong path.
                </li>
              </ul>
            </>,
          )}

          {chap(
            6,
            "pink",
            <>
              <div className="ch-head">
                <div className="ch-num">06</div>
                <div className="ch-titles">
                  <div className="ch-kicker">subagents</div>
                  <h3 className="ch-title">
                    delegate the <em>noise.</em>
                  </h3>
                </div>
              </div>
              <ul>
                <li>
                  Send verbose operations (test runs, log processing, doc
                  fetching) to a subagent.
                </li>
                <li>
                  The noisy output stays in <b>their</b> context. Only the
                  summary comes back to you.
                </li>
                <li>Pair with Haiku for simple, repetitive subagent work.</li>
              </ul>
            </>,
          )}

          {chap(
            7,
            "wide",
            <>
              <div className="ch-head">
                <div className="ch-num">07</div>
                <div className="ch-titles">
                  <div className="ch-kicker">MCP servers</div>
                  <h3 className="ch-title">
                    trim. <em>then commit.</em>
                  </h3>
                </div>
              </div>
              <ul>
                <li>
                  Disable unused servers — even when deferred they add overhead.
                </li>
                <li>
                  Prefer CLI tools (<code>gh</code>, <code>aws</code>,{" "}
                  <code>gcloud</code>) over their MCP equivalents.
                </li>
                <li>
                  Configure every server you&apos;ll need <b>before</b> a long
                  task. Adding one midway busts the cache.
                </li>
              </ul>
            </>,
          )}

          {chap(
            8,
            "wide gold",
            <>
              <div className="ch-head">
                <div className="ch-num">08</div>
                <div className="ch-titles">
                  <div className="ch-kicker">extended thinking</div>
                  <h3 className="ch-title">
                    don&apos;t think when you don&apos;t need to.
                  </h3>
                </div>
              </div>
              <ul>
                <li>
                  Lower effort with <code>/effort</code> or set{" "}
                  <code>MAX_THINKING_TOKENS=8000</code> for simple tasks.
                </li>
                <li>
                  Disable thinking entirely in <code>/config</code> for
                  straightforward work — it&apos;s invisible spend.
                </li>
              </ul>
            </>,
          )}

          {chap(
            9,
            "full blue",
            <>
              <div className="ch-head">
                <div className="ch-num">09</div>
                <div className="ch-titles">
                  <div className="ch-kicker">cache ttl awareness</div>
                  <h3 className="ch-title">
                    mind the clock.{" "}
                    <em>your plan decides how forgiving it is.</em>
                  </h3>
                </div>
              </div>
              <div className="ttl-table">
                <div className="ttl-cell">
                  <div className="plan">pro plan</div>
                  <div className="val">5-minute TTL</div>
                  <div className="desc">
                    go idle mid-task and the next message pays the full
                    re-upload cost. don&apos;t take long coffee breaks.
                  </div>
                </div>
                <div className="ttl-cell">
                  <div className="plan">max plan</div>
                  <div className="val">1-hour TTL</div>
                  <div className="desc">
                    much more forgiving. you can step away and pick up where you
                    left off without bleeding tokens.
                  </div>
                </div>
              </div>
            </>,
          )}

          {chap(
            10,
            "full",
            <>
              <div className="ch-head">
                <div className="ch-num">10</div>
                <div className="ch-titles">
                  <div className="ch-kicker">.claudeignore</div>
                  <h3 className="ch-title">
                    tell it what <em>not</em> to look at.
                  </h3>
                </div>
              </div>
              <ul>
                <li>
                  Exclude <code>node_modules</code>, build artifacts, generated
                  files — anything Claude shouldn&apos;t read but might pull in
                  by adding it in <code>.claudeignore</code>.
                </li>
                <li>
                  If you&apos;ve ever watched it grep a lockfile, you needed
                  this yesterday.
                </li>
              </ul>
            </>,
          )}
        </section>

        <div className="cta-strip">
          <div>
            <h3>
              now go <em>audit</em> a session.
            </h3>
            <p>
              drop a jsonl into the ledger and see which rule you&apos;ve been
              breaking.
            </p>
          </div>
          <Link className="cta-btn" href="/">
            open the ledger <span className="ar">→</span>
          </Link>
        </div>

        <footer className="foot">
          <em>No tokens were harmed in the making of this guide.</em>
          <span className="right">field guide · 01</span>
        </footer>
      </div>

      {/* modal temporarily disabled — restore alongside the cards' click handler
      {rule && (
        <div
          className="modal-backdrop show"
          aria-hidden={false}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modalTitle"
          >
            <button
              className="modal-close"
              aria-label="close"
              onClick={closeModal}
            >
              ✕
            </button>
            <div className="modal-header">
              <div className="ch-num">{rule.num}</div>
              <div>
                <div className="ch-kicker">{rule.kicker}</div>
                <h3 id="modalTitle">{rule.title}</h3>
              </div>
            </div>
            <div className="compare-grid">
              <div className="compare-pane bad">
                <div className="pane-head">
                  <span className="pane-tag bad">without</span>
                  <span className="pane-total">
                    {fmtCompact(badTotal)} tok
                  </span>
                </div>
                <div className="pane-title">{rule.badTitle}</div>
                <div style={{ marginTop: 6 }}>
                  <StackedBarsChart
                    data={rule.bad}
                    sharedMax={sharedMax}
                    colors={colors}
                  />
                </div>
              </div>
              <div className="compare-pane good">
                <div className="pane-head">
                  <span className="pane-tag good">with the rule</span>
                  <span className="pane-total">
                    {fmtCompact(goodTotal)} tok
                  </span>
                </div>
                <div className="pane-title">{rule.goodTitle}</div>
                <div style={{ marginTop: 6 }}>
                  <StackedBarsChart
                    data={rule.good}
                    sharedMax={sharedMax}
                    colors={colors}
                  />
                </div>
              </div>
            </div>
            <div className="modal-legend">
              <span className="sw">
                <span
                  className="box"
                  style={{ background: colors.ink }}
                />
                input
              </span>
              <span className="sw">
                <span
                  className="box"
                  style={{ background: colors.blue }}
                />
                cache read
              </span>
              <span className="sw">
                <span
                  className="box"
                  style={{ background: colors.coral }}
                />
                cache write
              </span>
              <span className="sw">
                <span
                  className="box"
                  style={{ background: colors.mint }}
                />
                output
              </span>
            </div>
            {savedTokens > 0 && (
              <div className="savings-ribbon">
                <span className="delta">{fmtCompact(savedTokens)} tokens</span>{" "}
                saved across the session <em>· {savedPct}% lighter</em>
              </div>
            )}
            <div className="takeaway">
              <span className="tk-label">takeaway</span>
              <span className="tk-body">{rule.takeaway}</span>
            </div>
          </div>
        </div>
      )}
      */}
    </div>
  );
}
