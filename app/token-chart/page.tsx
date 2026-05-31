"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePalette, writePalette } from "../palette";
import "./token-chart.css";

interface SessionStep {
  sub: string;
  userHtml: string;
  think: string;
  bot: string;
  buckets: {
    read: { txt: string; cold?: boolean; meta?: string };
    write: { txt: string; meta?: string };
    inn: { txt: string };
    out: { txt: string };
  };
  note: string;
}

const SESSION: SessionStep[] = [
  {
    sub: "cold start",
    userHtml: "Hi!",
    think: "2s",
    bot: "Hey! What can I help you with today?",
    buckets: {
      read: { txt: "nothing cached yet — cold start", cold: true },
      write: {
        txt: "system prompt + tool defs + skill list",
        meta: "cached now",
      },
      inn: { txt: "Hi!" },
      out: { txt: "thinking + the greeting" },
    },
    note: "First call: nothing to reuse, so the whole system prompt is written to cache. Your “hi” is the only fresh <b>INPUT</b>.",
  },
  {
    sub: "a file gets attached",
    userHtml:
      '<span class="file-ref">@app/guide/page.tsx</span> summarise this',
    think: "11s",
    bot: "React guide page: 10 rules for optimising your apps.",
    buckets: {
      read: {
        txt: "system prompt + tools + skills",
        meta: "cached in T1",
      },
      write: {
        txt: 'turn 1 + <span class="file">the page.tsx FILE</span>',
        meta: "cached now",
      },
      inn: { txt: "summarise this" },
      out: { txt: "thinking + the 10-rule summary" },
    },
    note: "The system prefix is now a cheap <b>READ</b>. The attached file lands fresh in <b>WRITE</b> — attachments are the big spikes.",
  },
  {
    sub: "a follow-up question",
    userHtml: "What are the good practices in this file",
    think: "2s",
    bot: "Type-first design, data-driven UI, memoized colors, a11y baked in…",
    buckets: {
      read: {
        txt: 'turn 1 + <span class="file">the file</span> + turn 2',
        meta: "cached",
      },
      write: {
        txt: "turn 2’s reply (the summary) + turn 2's input",
        meta: "cached now",
      },
      inn: { txt: "What are the good practices in this file?" },
      out: { txt: "thinking + the practices list" },
    },
    note: "Everything so far — including the file — has folded into <b>READ</b>. The file never re-enters WRITE; it just rides along cheap.",
  },
];

interface PayoffCall {
  lab: string;
  sub: string;
  read: number;
  write: number;
  inn: number;
  out: number;
}

const PAYOFF: PayoffCall[] = [
  { lab: "call 1", sub: "“hi”", read: 0, write: 46598, inn: 10, out: 56 },
  {
    lab: "call 2",
    sub: "file",
    read: 46598,
    write: 12772,
    inn: 10,
    out: 774,
  },
  {
    lab: "call 3",
    sub: "ask",
    read: 59370,
    write: 792,
    inn: 10,
    out: 611,
  },
];

interface SegInfo {
  t: string;
  sub: string;
}

const SEG_INFO: Array<Partial<Record<keyof PayoffCall, SegInfo>>> = [
  {
    write: {
      t: "CACHE WRITE",
      sub: "system prompt + tools + skills — being cached now, on the very first call.",
    },
    inn: {
      t: "INPUT",
      sub: "your message — “Hi”.",
    },
    out: {
      t: "OUTPUT",
      sub: "the reply — “Hey! What can I help you with today?”.",
    },
  },
  {
    read: {
      t: "CACHE READ",
      sub: "call 1's payload (system prompt + tools + skills) — replayed at the cache-read discount.",
    },
    write: {
      t: "CACHE WRITE",
      sub: "call 1's input + reply + the file you attached — being cached now.",
    },
    inn: {
      t: "INPUT",
      sub: "your message — “summarise this”.",
    },
    out: {
      t: "OUTPUT",
      sub: "the reply — “React guide page: 10 rules for optimising your apps.”.",
    },
  },
  {
    read: {
      t: "CACHE READ",
      sub: "everything so far + call 1's input + output + the file — replayed cheap.",
    },
    write: {
      t: "CACHE WRITE",
      sub: "call 2's input + output — being cached now so it can be read cheap later.",
    },
    inn: {
      t: "INPUT",
      sub: "your message — “What are the good practices in this file?”.",
    },
    out: {
      t: "OUTPUT",
      sub: "thinking + the reply — “Type-first design, data-driven UI, memoized colors, a11y baked in…”.",
    },
  },
];

const RAIL_SECTIONS: Array<{ id: string; label: string }> = [
  { id: "s1", label: "no memory" },
  { id: "s3", label: "one call" },
  { id: "s4", label: "chaining" },
  { id: "s5", label: "the session" },
  { id: "s6", label: "gotchas" },
];

interface TooltipContent {
  call: number;
  seg: keyof PayoffCall;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function clampTipPos(
  e: MouseEvent,
  w: number,
  h: number,
): { x: number; y: number } {
  const pad = 16;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  if (x + w > window.innerWidth - 10) x = e.clientX - w - pad;
  if (y + h > window.innerHeight - 10) y = e.clientY - h - pad;
  return { x, y };
}

function buildChainArrowsSvg(
  grid: HTMLElement,
  color: string,
): { paths: string; viewBox: string } | null {
  const gr = grid.getBoundingClientRect();
  if (!gr.width) return null;
  const viewBox = `0 0 ${gr.width} ${gr.height}`;
  function center(sel: string) {
    const node = grid.querySelector(sel);
    if (!node) return null;
    const el = node.getBoundingClientRect();
    return {
      l: el.left - gr.left,
      r: el.right - gr.left,
      t: el.top - gr.top,
      b: el.bottom - gr.top,
    };
  }
  const pairs: Array<[string, string]> = [
    ["w1", "r2"],
    ["w2", "r3"],
  ];
  let paths = "";
  pairs.forEach(([from, to]) => {
    const f = center(`[data-cell="${from}"]`);
    const t = center(`[data-cell="${to}"]`);
    if (!f || !t) return;
    const x1 = f.l + (f.r - f.l) * 0.18;
    const y1 = f.b;
    const x2 = t.r - (t.r - t.l) * 0.18;
    const y2 = t.t;
    const my = (y1 + y2) / 2;
    paths += `<path d="M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}" stroke="${color}"/>`;
  });
  return { paths, viewBox };
}

function buildMiniChartSvg(step: number, outShown: boolean): string {
  if (typeof document === "undefined") return "";
  const cs = getComputedStyle(document.body);
  const C = {
    inn: cs.getPropertyValue("--ink").trim(),
    read: cs.getPropertyValue("--blue").trim(),
    write: cs.getPropertyValue("--coral").trim(),
    out: cs.getPropertyValue("--mint").trim(),
    ink: cs.getPropertyValue("--ink").trim(),
    muted: cs.getPropertyValue("--muted").trim(),
  };
  const W = 760,
    H = 200,
    padL = 58,
    padR = 20,
    padT = 16,
    padB = 38;
  const innerW = W - padL - padR,
    innerH = H - padT - padB;
  const axisMax = 64000;
  const ticks = [0, 32000, 64000];
  const sc = innerH / axisMax;
  const base = padT + innerH;
  const n = PAYOFF.length;
  const slot = innerW / n;
  const barW = Math.min(120, slot * 0.5);
  let s = `<svg class="payoff-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`;
  ticks.forEach((t) => {
    const y = base - t * sc;
    s += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(28,24,20,.14)" stroke-width="1"/>`;
    s += `<text class="axis-t" x="${padL - 10}" y="${y + 4}" text-anchor="end">${t ? t / 1000 + "k" : "0"}</text>`;
  });
  PAYOFF.forEach((d, i) => {
    const cx = padL + slot * i + slot / 2;
    const x = cx - barW / 2;
    if (i > step) {
      s += `<rect x="${x}" y="${base - 26}" width="${barW}" height="26" rx="5" fill="none" stroke="${C.muted}" stroke-width="1.5" stroke-dasharray="4 4" opacity=".45"/>`;
      s += `<text class="x-lab" x="${cx}" y="${base + 22}" text-anchor="middle" opacity=".4">call ${i + 1}</text>`;
      return;
    }
    const showOut = i < step || outShown;
    const segs: Array<[keyof PayoffCall, number]> = [
      ["read", d.read],
      ["write", d.write],
      ["inn", d.inn],
    ];
    if (showOut) segs.push(["out", d.out]);
    let yc = base;
    segs.forEach(([k, v]) => {
      if (v <= 0) return;
      const hh = Math.max(
        v * sc,
        k === "inn" || k === "out" ? 13 : k === "write" ? 26 : 2,
      );
      const y = yc - hh;
      const fill = C[k as keyof typeof C];
      s += `<rect data-call="${i}" data-seg="${k}" x="${x}" y="${y}" width="${barW}" height="${hh}" style="fill:${fill};stroke:${C.ink};stroke-width:2"/>`;
      yc -= hh;
    });
    const total = d.read + d.write + d.inn + (showOut ? d.out : 0);
    const newest = i === step;
    s += `<text class="bar-total" x="${cx}" y="${yc - 9}" text-anchor="middle"${newest ? ' style="font-weight:800"' : ""}>${fmt(total)}</text>`;
    s += `<text class="x-lab" x="${cx}" y="${base + 22}" text-anchor="middle"${newest ? ` style="font-weight:800;fill:${C.ink}"` : ""}>call ${i + 1}${newest ? "  ←" : ""}</text>`;
  });
  s += "</svg>";
  return s;
}

export default function TokenChartPage() {
  const palette = usePalette();
  const [reqN, setReqN] = useState(1);
  const [sStep, setSStep] = useState(0);
  const [outShown, setOutShown] = useState(false);
  const [autoOn, setAutoOn] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("s1");
  const [tooltip, setTooltip] = useState<{
    content: TooltipContent;
    x: number;
    y: number;
  } | null>(null);

  const tooltipRef = useRef<HTMLDivElement>(null);
  const chainSvgRef = useRef<SVGSVGElement>(null);
  const chainGridRef = useRef<HTMLDivElement>(null);
  const chainSectionRef = useRef<HTMLElement>(null);
  const miniChartRef = useRef<HTMLDivElement>(null);
  const bkRowsRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<HTMLDivElement>(null);
  const miniWrapRef = useRef<HTMLDivElement>(null);
  const chatFeedRef = useRef<HTMLDivElement>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainPlayedRef = useRef(false);

  useEffect(() => {
    document.body.setAttribute("data-palette", palette);
  }, [palette]);

  const drawChain = useCallback(() => {
    const grid = chainGridRef.current;
    const svg = chainSvgRef.current;
    if (!grid || !svg) return;
    const color = getComputedStyle(document.body)
      .getPropertyValue("--gold")
      .trim();
    const built = buildChainArrowsSvg(grid, color);
    if (!built) return;
    svg.setAttribute("viewBox", built.viewBox);
    svg.innerHTML = built.paths;
  }, []);

  const animateChain = useCallback(() => {
    drawChain();
    const svg = chainSvgRef.current;
    if (!svg) return;
    const paths = svg.querySelectorAll<SVGPathElement>("path");
    paths.forEach((p, i) => {
      const len = p.getTotalLength();
      p.style.transition = "none";
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
      // force reflow so the dash setup takes hold before transitioning
      p.getBoundingClientRect();
      p.style.transition = `stroke-dashoffset .7s ease ${Math.floor(i / 2) * 0.5}s`;
      p.style.strokeDashoffset = "0";
    });
  }, [drawChain]);

  useEffect(() => {
    drawChain();
    const onResize = () => drawChain();
    window.addEventListener("resize", onResize);
    const t = setTimeout(drawChain, 300);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
  }, [drawChain, palette]);

  useEffect(() => {
    const host = miniChartRef.current;
    if (!host) return;
    host.innerHTML = buildMiniChartSvg(sStep, outShown);
  }, [sStep, outShown, palette]);

  useEffect(() => {
    const sec = chainSectionRef.current;
    if (!sec) return;
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting && !chainPlayedRef.current) {
            chainPlayedRef.current = true;
            setTimeout(animateChain, 150);
          }
        });
      },
      { threshold: 0.3 },
    );
    io.observe(sec);
    return () => io.disconnect();
  }, [animateChain]);

  useEffect(() => {
    const targets = RAIL_SECTIONS.map((s) => document.getElementById(s.id));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) setActiveSection(en.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    targets.forEach((t) => t && io.observe(t));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const feed = chatFeedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [sStep, outShown]);

  const stopAuto = useCallback(() => {
    setAutoOn(false);
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, []);

  const showSegTip = useCallback(
    (call: number, seg: keyof PayoffCall, e: MouseEvent) => {
      const info = SEG_INFO[call] && SEG_INFO[call][seg];
      if (!info) return;
      const node = tooltipRef.current;
      const w = node?.offsetWidth ?? 240;
      const h = node?.offsetHeight ?? 80;
      const pos = clampTipPos(e, w, h);
      setTooltip({ content: { call, seg }, x: pos.x, y: pos.y });
    },
    [],
  );

  const updateTipPos = useCallback((e: MouseEvent) => {
    const node = tooltipRef.current;
    const w = node?.offsetWidth ?? 240;
    const h = node?.offsetHeight ?? 80;
    const pos = clampTipPos(e, w, h);
    setTooltip((t) => (t ? { ...t, x: pos.x, y: pos.y } : t));
  }, []);

  useEffect(() => {
    if (!autoOn) return;
    const seq: Array<() => void> = [];
    const pop = (el: Element | null) => {
      if (!el) return;
      el.classList.remove("zoom-pop");
      void (el as HTMLElement).offsetWidth;
      el.classList.add("zoom-pop");
    };
    for (let i = 0; i < SESSION.length; i++) {
      seq.push(() => {
        setSStep(i);
        setOutShown(false);
        // pop targets are rendered after state flush; defer slightly
        setTimeout(() => pop(sessionRef.current), 0);
      });
      seq.push(() => {
        setOutShown(true);
        setTimeout(() => {
          pop(bkRowsRef.current?.lastElementChild ?? null);
          pop(miniWrapRef.current);
        }, 0);
      });
    }
    let k = 0;
    const tick = () => {
      if (k >= seq.length) {
        stopAuto();
        return;
      }
      seq[k++]();
      autoTimerRef.current = setTimeout(tick, 1350);
    };
    tick();
    return () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [autoOn, stopAuto]);

  useEffect(() => {
    const host = miniChartRef.current;
    if (!host) return;
    const onEnter = (e: Event) => {
      const target = e.currentTarget as SVGElement;
      const call = Number(target.getAttribute("data-call"));
      const seg = target.getAttribute("data-seg") as keyof PayoffCall;
      const me = e as unknown as MouseEvent;
      showSegTip(call, seg, me);
    };
    const onMove = (e: Event) => {
      const me = e as unknown as MouseEvent;
      updateTipPos(me);
    };
    const onLeave = () => setTooltip(null);
    const nodes = host.querySelectorAll<SVGElement>("[data-seg]");
    nodes.forEach((n) => {
      n.style.cursor = "help";
      n.addEventListener("mouseenter", onEnter);
      n.addEventListener("mousemove", onMove);
      n.addEventListener("mouseleave", onLeave);
    });
    return () => {
      nodes.forEach((n) => {
        n.removeEventListener("mouseenter", onEnter);
        n.removeEventListener("mousemove", onMove);
        n.removeEventListener("mouseleave", onLeave);
      });
    };
  }, [sStep, outShown, palette, showSegTip, updateTipPos]);

  function renderReqLine() {
    const msgs: string[] = [];
    for (let i = 1; i <= reqN; i++) {
      if (i === reqN) msgs.push(`<span class="new">input${i}</span>`);
      else msgs.push(`<span class="msg">input${i}+output${i}</span>`);
    }
    const html =
      '<span class="k">request = [ </span><span class="sys">system + tools + skills</span><span class="k"> ]</span>' +
      '<br><span class="k">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; + [ </span>' +
      msgs.join('<span class="k">, </span>') +
      '<span class="k"> ]</span>';
    return html;
  }

  const reqLabelHtml =
    "Call <b>" +
    reqN +
    "</b> ships " +
    reqN +
    " message" +
    (reqN > 1 ? "s" : "") +
    ". The newest (highlighted) is the only fresh <b>INPUT</b>; the rest is cached history.";

  const sessionStep = SESSION[sStep];

  function renderBkRow(tag: "read" | "write" | "inn" | "out", o: {
    txt: string;
    cold?: boolean;
    meta?: string;
  }) {
    const cold = o.cold ? " cold" : "";
    const label = tag === "inn" ? "input" : tag;
    const cls = tag === "inn" ? "in" : tag;
    return (
      <div key={tag} className={`bk-row${cold} bk-anim`}>
        <span className={`bk-tag ${cls}`}>{label}</span>
        <span className="bk-txt" dangerouslySetInnerHTML={{ __html: o.txt }} />
        {o.meta && <span className="bk-meta">{o.meta}</span>}
      </div>
    );
  }

  const slNoteHtml = outShown
    ? sessionStep.note
    : "Your message is queued as fresh <b>INPUT</b>, on top of the cached <b>READ</b> and <b>WRITE</b> — nothing’s generated yet. Hit <b>run</b> to add the OUTPUT.";

  const tooltipContent = (() => {
    if (!tooltip) return null;
    const c = tooltip.content;
    const info = SEG_INFO[c.call]?.[c.seg];
    const v = (PAYOFF[c.call]?.[c.seg] as number) || 0;
    if (!info) return null;
    return (
      <>
        <div className="ttl">{info.t}</div>
        <div className="tt-row">
          <span className="l">tokens</span>
          <span className="v">{fmt(v)}</span>
        </div>
        <div className="tt-sub">{info.sub}</div>
      </>
    );
  })();

  return (
    <>
      <div
        ref={tooltipRef}
        className={`tooltip${tooltip ? " show" : ""}`}
        style={tooltip ? { left: tooltip.x, top: tooltip.y } : undefined}
      >
        {tooltipContent}
      </div>

      <div className="top-bar">
        <Link href="/" className="back-link" title="back to the ledger">
          <span>←</span> <span>the ledger</span>
        </Link>
        <div className="palette-switcher">
          <span className="ps-label">palette</span>
          {["workshop", "cream", "sage", "plum", "slate"].map((p) => (
            <button
              key={p}
              className={`ps-swatch ${palette === p ? "active" : ""}`}
              data-pal={p}
              title={p}
              aria-label={`${p} palette`}
              onClick={() => writePalette(p)}
            />
          ))}
        </div>
      </div>

      <nav className="rail" aria-label="section navigation">
        {RAIL_SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={activeSection === s.id ? "active" : ""}
          >
            <span className="dot"></span>
            <span className="rl">{s.label}</span>
          </a>
        ))}
      </nav>

      <div className="page">
        <div className="tags">
          <span className="pill coral">
            <span className="star">★</span> how it&apos;s built
          </span>
        </div>

        <h1 className="hero">
          how the token
          <br />
          <span className="l2">
            chart is built
            <span className="arrow" aria-hidden="true">
              <svg width="96" height="84" viewBox="0 0 96 84" fill="none">
                <path
                  d="M 9 11 Q 54 19 80 76"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <path
                  d="M 65 65 L 80 76 L 82 57"
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
          the ledger turns a raw session log into a stack of bars —{" "}
          <em>one bar per API call.</em> this page walks the exact path it
          takes: split each call into four{" "}
          <span className="coral">token buckets</span>, follow how this turn&apos;s
          reply becomes next turn&apos;s cheap history, then watch the numbers line
          up. the chart is just… drawing them.
        </p>

        <section id="s1">
          <div className="sec-head">
            <div className="snum">1</div>
            <div className="stxt">
              <div className="kick">the one rule</div>
              <h2>
                The API has <em>no memory</em>
              </h2>
            </div>
          </div>
          <div className="card">
            <p className="lead-txt">
              Each call resends the <b>whole</b> conversation: the system
              prompt, your tools and skills, then every turn so far — and
              every prior turn carries both your <b>input</b> and the
              model&apos;s <b>output</b>. <b>Call&nbsp;3</b> ships{" "}
              <span className="u">input1+output1</span>,{" "}
              <span className="u">input2+output2</span>, and the fresh{" "}
              <span className="u">input3</span> — not just{" "}
              <span className="u">input3</span>. Nothing is remembered
              server-side; the transcript <em>is</em> the memory, and you pay
              to ship it every time.
            </p>
            <div
              className="codeblock"
              aria-live="polite"
              dangerouslySetInnerHTML={{ __html: renderReqLine() }}
            />
            <div className="stepper">
              <div className="step-btns">
                <button
                  className="sbtn"
                  aria-label="previous call"
                  disabled={reqN <= 1}
                  onClick={() => setReqN((n) => Math.max(1, n - 1))}
                >
                  −
                </button>
                <button
                  className="sbtn"
                  aria-label="next call"
                  disabled={reqN >= 6}
                  onClick={() => setReqN((n) => Math.min(6, n + 1))}
                >
                  +
                </button>
              </div>
              <div
                className="step-label"
                dangerouslySetInnerHTML={{ __html: reqLabelHtml }}
              />
            </div>
          </div>
        </section>

        <section id="s3">
          <div className="sec-head">
            <div className="snum">2</div>
            <div className="stxt">
              <div className="kick">one call = one bar</div>
              <h2>
                Anatomy of a <em>single</em> call
              </h2>
            </div>
          </div>
          <div className="card">
            <p className="lead-txt" style={{ marginBottom: 18 }}>
              Resending the whole transcript every call would be brutal at full
              price — so providers let you mark the stable prefix as{" "}
              <b>cacheable</b>. The first time the provider sees a chunk, they
              store it (a small one-time surcharge: a{" "}
              <span className="mono">CACHE WRITE</span>). Every later call that
              resends the same prefix gets billed at a fraction of the normal
              rate (a <span className="mono">CACHE READ</span>). The full
              transcript still gets shipped every time — it&apos;s just billed
              at different rates depending on whether the provider has already
              seen it. So every call splits into <b>four token buckets</b>:
            </p>
            <div className="lanes">
              <div className="lane l-read">
                <div className="lname">Cache read</div>
                <div className="ldesc">
                  settled history the provider already has on file — cheapest
                  lane
                </div>
              </div>
              <div className="lane l-write">
                <div className="lname">Cache write</div>
                <div className="ldesc">
                  material being stored for the first time — usually the
                  previous turn, now stable
                </div>
              </div>
              <div className="lane l-in">
                <div className="lname">in</div>
                <div className="ldesc">
                  genuinely new tokens this call — your latest message, full
                  input price
                </div>
              </div>
              <div className="lane-arrow">→</div>
              <div className="lane l-out">
                <div className="lname">output</div>
                <div className="ldesc">
                  thinking + reply — the most expensive lane per token
                </div>
              </div>
            </div>
            <p className="tip">
              Widths ≈ token volume. The cache breakpoint slides forward each
              turn, promoting yesterday&apos;s{" "}
              <span className="mono">WRITE</span> into today&apos;s{" "}
              <span className="mono">READ</span> — so most of every resend
              rides in the cheap <span className="mono">READ</span> lane while
              only your new message pays full input price.{" "}
              <b>
                Stack these four on top of each other and you have one bar
              </b>{" "}
              in the chart.
            </p>
          </div>
        </section>

        <section id="s4" ref={chainSectionRef}>
          <div className="sec-head">
            <div className="snum">3</div>
            <div className="stxt">
              <div className="kick">the chain</div>
              <h2>
                This turn&apos;s WRITE = <em>next turn&apos;s READ</em>
              </h2>
            </div>
          </div>
          <div className="card">
            <div className="chain-wrap">
              <svg
                ref={chainSvgRef}
                className="chain-svg"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              ></svg>
              <div ref={chainGridRef} className="chain-grid">
                <div className="turn-lab">Turn 1</div>
                <div className="cbox read cold" data-cell="r1">
                  Cache read: cold
                </div>
                <div className="cbox write" data-cell="w1">
                  Cache write: turn 1
                </div>
                <div className="turn-lab">Turn 2</div>
                <div className="cbox read" data-cell="r2">
                  Cache read: turn 1
                </div>
                <div className="cbox write" data-cell="w2">
                  Cache write: turn 2
                </div>
                <div className="turn-lab">Turn 3</div>
                <div className="cbox read" data-cell="r3">
                  Cache read: turns 1–2
                </div>
                <div className="cbox write" data-cell="w3">
                  Cache write: turn 3
                </div>
              </div>
            </div>
            <p className="chain-note" style={{ marginTop: 18 }}>
              History keeps accruing in the cheap READ lane — each turn just
              hands its WRITE down to the next.
            </p>
          </div>
        </section>

        <section id="s5">
          <div className="sec-head">
            <div className="snum">4</div>
            <div className="stxt">
              <div className="kick">walk it through</div>
              <h2>
                A real session, <em>step by step</em>
              </h2>
            </div>
          </div>
          <div className="card">
            <div className="session-top">
              <div className="we-tabs" role="tablist">
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    className={`we-tab ${sStep === i ? "active" : ""}`}
                    onClick={() => {
                      stopAuto();
                      setSStep(i);
                      setOutShown(false);
                    }}
                  >
                    Turn {i + 1}
                  </button>
                ))}
              </div>
              <button
                className={`auto-btn${autoOn ? " playing" : ""}`}
                onClick={() => {
                  if (autoOn) stopAuto();
                  else setAutoOn(true);
                }}
              >
                <span className="tri">{autoOn ? "⏸" : "▶"}</span>{" "}
                {autoOn ? "stop" : "autoplay the session"}
              </button>
            </div>
            <div ref={sessionRef} className="session">
              <div className="session-left">
                <div className="sl-head">
                  <span className="sl-turn">Turn {sStep + 1}</span>
                  <span className="sl-sub">{sessionStep.sub}</span>
                </div>
                <div className="sl-cap">what this one API call carries</div>
                <div ref={bkRowsRef} className="bk-rows">
                  {renderBkRow("read", sessionStep.buckets.read)}
                  {renderBkRow("write", sessionStep.buckets.write)}
                  {renderBkRow("inn", sessionStep.buckets.inn)}
                  {outShown && renderBkRow("out", sessionStep.buckets.out)}
                </div>
                <div className="play-row">
                  {!outShown ? (
                    <button
                      className="play-btn"
                      onClick={() => {
                        stopAuto();
                        setOutShown(true);
                      }}
                    >
                      <span className="tri">▶</span> run the model
                    </button>
                  ) : (
                    <span className="gen-tag">
                      <span className="ck"></span> reply generated
                    </span>
                  )}
                </div>
                <p
                  className="sl-note"
                  dangerouslySetInnerHTML={{ __html: slNoteHtml }}
                />
              </div>
              <div className="session-right">
                <div className="chat-head">
                  <span className="dot-r"></span> session transcript
                </div>
                <div ref={chatFeedRef} className="chat-feed">
                  {(() => {
                    const nodes: React.ReactNode[] = [];
                    for (let i = 0; i <= sStep; i++) {
                      const s = SESSION[i];
                      const cur = i === sStep;
                      const show = !cur || outShown;
                      const a = cur ? " in-new" : "";
                      nodes.push(
                        <div
                          key={`u-${i}`}
                          className={`cmsg user${a}`}
                          dangerouslySetInnerHTML={{ __html: s.userHtml }}
                        />,
                      );
                      if (show) {
                        nodes.push(
                          <div key={`t-${i}`} className={`cthink${a}`}>
                            thought {s.think}
                          </div>,
                        );
                        nodes.push(
                          <div key={`b-${i}`} className={`cmsg bot${a}`}>
                            {s.bot}
                          </div>,
                        );
                      } else {
                        nodes.push(
                          <div key={`p-${i}`} className="cpending">
                            ▍ generating reply…
                          </div>,
                        );
                      }
                    }
                    return nodes;
                  })()}
                </div>
                <div className="chat-key">
                  <span>
                    <span className="ck blue"></span> you = input
                  </span>
                  <span>
                    <span className="ck pink"></span> reply = output
                  </span>
                </div>
              </div>
            </div>
            <div ref={miniWrapRef} className="mini-wrap">
              <div className="mini-head">
                the chart, building{" "}
                <span>— one stacked bar per call, growing as you step</span>
              </div>
              <div ref={miniChartRef} id="miniChart"></div>
              <div className="we-legend mini-legend">
                <span className="sw">
                  <span className="bx in"></span> input
                </span>
                <span className="sw">
                  <span className="bx read"></span> cache read
                </span>
                <span className="sw">
                  <span className="bx write"></span> cache write
                </span>
                <span className="sw">
                  <span className="bx out"></span> output
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="s6">
          <div className="sec-head">
            <div className="snum">5</div>
            <div className="stxt">
              <div className="kick">fine print</div>
              <h2>
                Gotchas worth <em>remembering</em>
              </h2>
            </div>
          </div>
          <div className="card">
            <ul className="gotchas">
              <li>
                <b>Attachments</b> (files, tool results) land in{" "}
                <span className="mono">CACHE WRITE</span>directly, not{" "}
                <span className="mono">INPUT</span> — they&apos;re the big
                spikes.
              </li>
              <li>
                <b>Thinking blocks</b> are carried forward into later turns and
                cached too, not just the output text.
              </li>
              <li>
                One API response = several transcript lines sharing{" "}
                <b>
                  one <span className="mono">message.id</span>
                </b>{" "}
                and one usage record. Dedup by{" "}
                <span className="mono">message.id</span> before summing, or you
                double-count.
              </li>
              <li>
                A <b>new session</b> does <em>not</em> mean a cold cache —
                caching is keyed on the content prefix, not the session.
              </li>
            </ul>
          </div>
        </section>

        <footer className="foot">
          <em>No tokens were harmed in the making of this guide.</em>
          <span className="right">how it works · turn by turn</span>
        </footer>
      </div>
    </>
  );
}
