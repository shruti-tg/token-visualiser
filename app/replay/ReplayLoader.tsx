"use client";

/* ReplayLoader — timeline-scrub loading overlay for the replay screen.
   Metaphor: re-running the session. A playhead sweeps the scrubber (ping-pong),
   the transcript thread reveals turn-by-turn, and leak diamonds light up as the
   head passes them — the replay UI's own vocabulary, on a loop.
   Ported from the "Replay Loader" design (fixed defaults, no tweaks panel). */

import { useEffect, useMemo, useRef, useState } from "react";

/* ---- fixed config (from the design's TWEAK_DEFAULTS) ---- */
const TURNS = 8;
const LEAKS = 3;
const SPEED = 6;
const POP = "snappy";
const LEAK_GLOW = true;

/* witty status lines, in the app's voice */
const STATUS_LINES = [
  "scrubbing the timeline…",
  "lining up every turn…",
  "catching the leaks as we go…",
  "re-running the session…",
  "diffing what actually changed…",
  "marking the cache misses…",
  "syncing the playhead…",
  "reading the receipts, turn by turn…",
];

/* leak-category color vars, cycled across the diamonds for variety */
const LEAK_VARS = ["--coral", "--gold", "--blue", "--pink", "--mint"];
/* turn kinds → dot class, in a believable session rhythm */
const KIND_CYCLE = ["user", "asst", "tool", "tool", "asst", "out"];

interface Row {
  kind: string;
  w: number;
  leak: boolean;
  leakVar: string | null;
}

/* build the thread rows: which kind, how wide the bubble bar, and which are leaks */
function genRows(turns: number, leaks: number): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < turns; i++) {
    const kind = i === 0 ? "user" : KIND_CYCLE[i % KIND_CYCLE.length];
    // bar width by kind, with a little jitter
    const base =
      kind === "user" ? 0.52 : kind === "asst" ? 0.86 : kind === "tool" ? 0.66 : 0.4;
    const w = Math.max(0.28, Math.min(0.96, base + (Math.random() - 0.5) * 0.18));
    rows.push({ kind, w, leak: false, leakVar: null });
  }
  // place leaks on interior rows, evenly spaced, never first/last
  const n = Math.max(0, Math.min(leaks, Math.max(0, turns - 2)));
  for (let k = 0; k < n; k++) {
    const pos = Math.round(((k + 1) / (n + 1)) * (turns - 1));
    const idx = Math.max(1, Math.min(turns - 2, pos));
    rows[idx].leak = true;
    rows[idx].leakVar = LEAK_VARS[k % LEAK_VARS.length];
  }
  return rows;
}

function ReplayScrub({
  turns,
  leaks,
  speed,
  pop,
  glow,
}: {
  turns: number;
  leaks: number;
  speed: number;
  pop: string;
  glow: boolean;
}) {
  const rows = useMemo(() => genRows(turns, leaks), [turns, leaks]);
  const N = Math.max(1, turns - 1);

  const fillRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<HTMLDivElement | null>(null);
  const tallyRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const markRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // leak marks: { frac, leakVar } at the row's position on the track
  const marks = rows
    .map((r, i) => (r.leak ? { frac: i / N, leakVar: r.leakVar } : null))
    .filter((m): m is { frac: number; leakVar: string } => Boolean(m));

  // paints the whole scrubber for a given progress p∈[0,1]
  const apply = (p: number) => {
    const pct = p * 100;
    if (fillRef.current) fillRef.current.style.width = pct + "%";
    if (handleRef.current) handleRef.current.style.left = pct + "%";

    // current row = latest revealed
    const cur = Math.min(turns - 1, Math.round(p * N));
    if (posRef.current) {
      posRef.current.innerHTML = `turn <b>${cur + 1}</b> / ${turns}`;
    }
    let litLeaks = 0;
    rowRefs.current.forEach((el, i) => {
      if (!el) return;
      const on = i / N <= p + 1e-6;
      el.classList.toggle("on", on);
      el.classList.toggle("cur", i === cur);
      if (rows[i].leak) {
        el.classList.toggle("lit", on);
        if (on) litLeaks++;
      }
    });
    markRefs.current.forEach((el, i) => {
      if (!el) return;
      el.classList.toggle("lit", marks[i].frac <= p + 1e-6);
    });
    if (tallyRef.current) tallyRef.current.textContent = String(litLeaks);
  };

  useEffect(() => {
    if (reduce) {
      // static, fully revealed
      apply(1);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    // sweep → hold full → rewind → hold empty, looping (ping-pong)
    const sweep = Math.max(1400, 5200 - speed * 420);
    const hold = 520;
    const cycle = sweep * 2 + hold * 2;

    function progress(elapsed: number) {
      const t = elapsed % cycle;
      if (t < sweep) return t / sweep; // forward
      if (t < sweep + hold) return 1; // hold full
      if (t < sweep * 2 + hold) return 1 - (t - sweep - hold) / sweep; // rewind
      return 0; // hold empty
    }
    function frame(now: number) {
      if (start == null) start = now;
      apply(progress(now - start));
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns, leaks, speed, reduce]);

  return (
    <div className="rl-stage" data-pop={pop} data-glow={glow ? "1" : "0"}>
      {/* scrubber */}
      <div className="rl-scrub">
        <button className="rl-play" aria-hidden="true" tabIndex={-1}>
          ❚❚
        </button>
        <div className="rl-track-wrap">
          <div className="rl-track">
            <div className="rl-fill" ref={fillRef} />
            {marks.map((m, i) => (
              <span
                key={i}
                className="rl-mark"
                ref={(el) => {
                  markRefs.current[i] = el;
                }}
                style={
                  { left: m.frac * 100 + "%", "--cat": `var(${m.leakVar})` } as React.CSSProperties
                }
              />
            ))}
            <div className="rl-handle" ref={handleRef} />
          </div>
        </div>
      </div>
      <div className="rl-pos" ref={posRef}>
        turn <b>1</b> / {turns}
      </div>

      {/* transcript thread */}
      <div className="rl-thread">
        {rows.map((r, i) => (
          <div
            key={i}
            className="rl-row"
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            style={
              r.leak ? ({ "--cat": `var(${r.leakVar})` } as React.CSSProperties) : undefined
            }
          >
            <span className={"rl-dot k-" + r.kind + (r.leak ? " leak" : "")} />
            <span className="rl-bar" style={{ width: r.w * 100 + "%" }} />
          </div>
        ))}
      </div>

      {/* foot: status + tally */}
      <div className="lc-foot">
        <StatusLine />
        <span className="rl-tally">
          <b ref={tallyRef}>0</b> leaks
        </span>
      </div>
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
    }, 2100);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="rl-status">
      <span className="car" />
      <span className="txt" style={{ opacity: vis ? 1 : 0 }}>
        {STATUS_LINES[i]}
      </span>
    </div>
  );
}

export default function ReplayLoader() {
  return (
    <div className="rl-overlay" role="status" aria-live="polite" aria-label="Loading session">
      <div className="loader-card">
        <div className="lc-top">
          <span className="lc-brand">
            <span className="star">★</span> token replay
          </span>
          <span className="lc-chip">
            <span className="blip" /> replaying
          </span>
        </div>

        <div className="lc-head">
          <h1 className="lc-title">
            re-running the <em>session.</em>
          </h1>
          <p className="lc-sub">scrubbing every turn, catching the leaks…</p>
        </div>

        <ReplayScrub turns={TURNS} leaks={LEAKS} speed={SPEED} pop={POP} glow={LEAK_GLOW} />
      </div>
    </div>
  );
}
