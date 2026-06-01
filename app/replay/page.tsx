"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import SiteNav from "../SiteNav";
import { usePalette, writePalette } from "../palette";
import {
  buildProjectFromFiles,
  prepareProject,
  CAT_COLORS,
  CAT_LABEL,
  type Annotation,
  type Project,
  type TimelineItem,
} from "./replay-engine";
import { REPLAY_DEMOS } from "./replay-demos";
import "./replay.css";

const INTRO_FAST = 150;
const INTRO_SLOW = 230;
const PLAY_SPEED = 720;

export default function Replay() {
  const palette = usePalette();
  const [project, setProject] = useState<Project | null>(null);
  const [activeFile, setActiveFile] = useState(0);
  const [step, setStepState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [wide, setWide] = useState(true);
  const [nudge, setNudge] = useState(false);

  const stageScrollRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const calloutsRef = useRef<HTMLDivElement | null>(null);
  const connectorsRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const smoothRef = useRef(false);
  const introTokenRef = useRef(0);

  useEffect(() => {
    document.body.setAttribute("data-palette", palette);
  }, [palette]);

  const file = project ? project.files[activeFile] : null;
  const items: TimelineItem[] = useMemo(() => file?.items ?? [], [file]);
  const ann: Annotation[] = useMemo(() => file?.annotations ?? [], [file]);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const annByTarget = useMemo(() => {
    const m = new Map<number, Annotation>();
    ann.forEach((a) => m.set(a.targetIdx, a));
    return m;
  }, [ann]);

  /* webkitdirectory has to be set imperatively (not a valid React prop) */
  useEffect(() => {
    const el = fileInputRef.current;
    if (!el) return;
    el.setAttribute("webkitdirectory", "");
    el.setAttribute("directory", "");
    el.setAttribute("multiple", "");
  }, []);

  /* ---------- step control ---------- */
  const stopPlay = useCallback(() => {
    setPlaying(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const setStep = useCallback((n: number, smooth: boolean) => {
    const len = itemsRef.current.length;
    smoothRef.current = smooth;
    setStepState(Math.max(0, Math.min(len - 1, n)));
  }, []);

  const togglePlay = useCallback(() => {
    if (playing) {
      stopPlay();
      return;
    }
    introTokenRef.current++; // cancel any intro autoplay
    const len = itemsRef.current.length;
    let start = step;
    if (start >= len - 1) start = 0;
    setStep(start, false);
    setPlaying(true);
    timerRef.current = setInterval(() => {
      setStepState((s) => {
        if (s >= itemsRef.current.length - 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          setPlaying(false);
          return s;
        }
        smoothRef.current = true;
        return s + 1;
      });
    }, PLAY_SPEED);
  }, [playing, step, setStep, stopPlay]);

  /* ---------- load a project ---------- */
  const loadProject = useCallback((raw: Project) => {
    const prepared = prepareProject(raw);
    setProject(prepared);
    setActiveFile(0);
    smoothRef.current = false;
    setStepState(0);
    requestAnimationFrame(() => {
      const ws = document.getElementById("workspace");
      if (ws)
        window.scrollTo({
          top: ws.getBoundingClientRect().top + window.scrollY - 24,
          behavior: "smooth",
        });
    });
  }, []);

  const selectFile = useCallback(
    (i: number) => {
      stopPlay();
      setActiveFile(i);
      smoothRef.current = false;
      setStepState(0);
    },
    [stopPlay],
  );

  /* ---------- auto-intro: brisk advance to reveal annotations ---------- */
  useEffect(() => {
    if (!project) return;
    // clear any timer still running from a prior file/play (no setState here)
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const token = ++introTokenRef.current;
    const len = items.length;
    if (len <= 1) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const raf = requestAnimationFrame(() => setStep(len - 1, false));
      return () => cancelAnimationFrame(raf);
    }
    // flip the play indicator once, asynchronously (outside the effect body)
    const raf = requestAnimationFrame(() => setPlaying(true));
    const speed = len > 14 ? INTRO_FAST : INTRO_SLOW;
    const id = setInterval(() => {
      if (token !== introTokenRef.current) {
        clearInterval(id);
        return;
      }
      setStepState((s) => {
        if (s >= itemsRef.current.length - 1) {
          clearInterval(id);
          setPlaying(false);
          return s;
        }
        smoothRef.current = false;
        return s + 1;
      });
    }, speed);
    timerRef.current = id;
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, activeFile]);

  /* ---------- responsive wide/narrow ---------- */
  useLayoutEffect(() => {
    const el = stageScrollRef.current;
    if (!el) return;
    const measure = () => setWide(el.clientWidth >= 760);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [project]);

  /* ---------- layout callouts + connectors + scroll current into view ---------- */
  useLayoutEffect(() => {
    if (!project) return;
    const stageScroll = stageScrollRef.current;
    const transcript = transcriptRef.current;
    const calloutsEl = calloutsRef.current;
    const connectors = connectorsRef.current;
    if (!stageScroll || !transcript) return;

    // position callouts (wide only)
    if (wide && calloutsEl) {
      const baseTop = stageScroll.getBoundingClientRect().top;
      let prevBottom = 0;
      const ordered = [...calloutsEl.children]
        .map((c) => {
          const idx = (c as HTMLElement).dataset.idx;
          const row = transcript.querySelector<HTMLElement>(
            `.ti[data-idx="${idx}"]`,
          );
          const top = row
            ? row.getBoundingClientRect().top -
              baseTop +
              stageScroll.scrollTop
            : 0;
          return { c: c as HTMLElement, top };
        })
        .sort((a, b) => a.top - b.top);
      ordered.forEach(({ c, top }) => {
        // only stack revealed callouts; hidden ones sit at their row so they
        // don't pile up below the content and inflate the scroll height.
        if (!c.classList.contains("show")) {
          c.style.top = top + "px";
          return;
        }
        const y = Math.max(top - 6, prevBottom + 14);
        c.style.top = y + "px";
        prevBottom = y + c.offsetHeight;
      });
    }

    // connectors (wide only)
    if (connectors) {
      if (!wide) {
        connectors.innerHTML = "";
      } else {
        const w = stageScroll.scrollWidth;
        // size to actual content (transcript + revealed callouts), NOT the live
        // scrollHeight — the SVG is position:absolute so feeding scrollHeight
        // back in would ratchet the height up and never shrink.
        let calloutBottom = 0;
        [...(calloutsEl?.children ?? [])].forEach((cEl) => {
          const c = cEl as HTMLElement;
          if (!c.classList.contains("show")) return;
          calloutBottom = Math.max(calloutBottom, c.offsetTop + c.offsetHeight);
        });
        const h = Math.max(transcript.offsetHeight, calloutBottom) + 40;
        connectors.setAttribute("width", String(w));
        connectors.setAttribute("height", String(h));
        connectors.setAttribute("viewBox", `0 0 ${w} ${h}`);
        const base = stageScroll.getBoundingClientRect();
        const tRight = transcript.offsetLeft + transcript.offsetWidth;
        let paths = "";
        [...(calloutsEl?.children ?? [])].forEach((cEl) => {
          const c = cEl as HTMLElement;
          if (!c.classList.contains("show")) return;
          const row = transcript.querySelector<HTMLElement>(
            `.ti[data-idx="${c.dataset.idx}"]`,
          );
          if (!row) return;
          const rr = row.getBoundingClientRect();
          const y1 =
            rr.top -
            base.top +
            stageScroll.scrollTop +
            Math.min(rr.height, 26) / 2 +
            2;
          const x1 = tRight + 6;
          const cr = c.getBoundingClientRect();
          const x2 = c.offsetLeft;
          const y2 =
            cr.top - base.top + stageScroll.scrollTop + Math.min(cr.height, 40) / 2;
          const col = getComputedStyle(c).borderTopColor;
          const dx = x1 - x2, dy = y1 - y2;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const n = Math.max(4, Math.round(len / 28));
          const amp = 7;
          const px = -dy / len, py = dx / len;
          let d = `M ${x2} ${y2}`;
          for (let i = 1; i <= n; i++) {
            const t0 = (i - 0.5) / n;
            const t1 = i / n;
            const sign = i % 2 === 0 ? 1 : -1;
            const cx = x2 + t0 * dx + sign * amp * px;
            const cy = y2 + t0 * dy + sign * amp * py;
            const ex = x2 + t1 * dx;
            const ey = y2 + t1 * dy;
            d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
          }
          paths += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round"/>`;
        });
        connectors.innerHTML = paths;
      }
    }

    // keep current row in view
    const currentEl = transcript.querySelector<HTMLElement>(
      `.ti[data-idx="${step}"]`,
    );
    if (currentEl) {
      const h = stageScroll.clientHeight;
      const target = currentEl.offsetTop - h * 0.42;
      const max = stageScroll.scrollHeight - h;
      stageScroll.scrollTo({
        top: Math.max(0, Math.min(max, target)),
        behavior: smoothRef.current ? "smooth" : "auto",
      });
    }
  }, [step, wide, project, activeFile, palette]);

  /* ---------- track drag ---------- */
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const frac = (clientX: number) => {
    const t = trackRef.current;
    if (!t) return 0;
    const r = t.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  const toStep = (clientX: number) => {
    stopPlay();
    introTokenRef.current++;
    const n = itemsRef.current.length - 1;
    setStep(Math.round(frac(clientX) * n), false);
  };

  /* ---------- folder / file input ---------- */
  const onFolderChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fl = e.target.files;
      if (!fl || !fl.length) return;
      let folderName = "dropped folder";
      const first = fl[0] as File & { webkitRelativePath?: string };
      if (first.webkitRelativePath)
        folderName = first.webkitRelativePath.split("/")[0];
      const proj = await buildProjectFromFiles([...fl], folderName);
      if (proj) loadProject(proj);
    },
    [loadProject],
  );

  const onFilesChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fl = e.target.files;
      if (!fl || !fl.length) return;
      const label =
        fl.length === 1 ? fl[0].name : `${fl.length} selected files`;
      const proj = await buildProjectFromFiles([...fl], label);
      if (proj) loadProject(proj);
    },
    [loadProject],
  );

  const openPicker = useCallback(() => {
    const fi = fileInputRef.current;
    if (!fi) return;
    fi.value = "";
    fi.click();
  }, []);

  /* clicking the field doesn't pick — it points the user at the buttons */
  const flashButtons = useCallback(() => {
    setNudge(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setNudge(true)),
    );
  }, []);

  const openFilePicker = useCallback(() => {
    const fi = filesInputRef.current;
    if (!fi) return;
    fi.value = "";
    fi.click();
  }, []);

  /* ---------- drag-drop folder ---------- */
  useEffect(() => {
    const overlay = document.getElementById("dragOverlay");
    const dz = document.getElementById("dropzone");
    const onEnterOver = (e: Event) => {
      e.preventDefault();
      overlay?.classList.add("show");
      dz?.classList.add("drag");
    };
    const onLeaveDrop = (e: Event) => {
      const de = e as DragEvent;
      if (e.type === "dragleave" && de.relatedTarget) return;
      overlay?.classList.remove("show");
      dz?.classList.remove("drag");
    };
    document.addEventListener("dragenter", onEnterOver);
    document.addEventListener("dragover", onEnterOver);
    document.addEventListener("dragleave", onLeaveDrop);
    document.addEventListener("drop", onLeaveDrop);

    async function walkEntry(
      entry: FileSystemEntry,
      out: File[],
    ): Promise<void> {
      if (entry.isFile) {
        if (/\.jsonl?$/i.test(entry.name)) {
          const fileEntry = entry as FileSystemFileEntry;
          const f = await new Promise<File>((res, rej) =>
            fileEntry.file(res, rej),
          );
          out.push(f);
        }
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        let batch: FileSystemEntry[];
        do {
          batch = await new Promise<FileSystemEntry[]>((res) =>
            reader.readEntries(res, () => res([])),
          );
          for (const e of batch) await walkEntry(e, out);
        } while (batch.length);
      }
    }

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const dt = e.dataTransfer;
      if (!dt) return;
      let folderName = "dropped folder";
      const collected: File[] = [];
      const its = dt.items;
      if (its && its.length && (its[0] as DataTransferItem).webkitGetAsEntry) {
        const entries: FileSystemEntry[] = [];
        for (const it of its) {
          const en = it.webkitGetAsEntry();
          if (en) entries.push(en);
        }
        if (entries[0] && entries[0].isDirectory) folderName = entries[0].name;
        for (const en of entries) await walkEntry(en, collected);
        if (collected.length) {
          const proj = await buildProjectFromFiles(collected, folderName);
          if (proj) loadProject(proj);
          return;
        }
      }
      const fl = [...(dt.files || [])];
      if (fl.length) {
        const proj = await buildProjectFromFiles(fl, folderName);
        if (proj) loadProject(proj);
      }
    };
    document.addEventListener("drop", onDrop);

    return () => {
      document.removeEventListener("dragenter", onEnterOver);
      document.removeEventListener("dragover", onEnterOver);
      document.removeEventListener("dragleave", onLeaveDrop);
      document.removeEventListener("drop", onLeaveDrop);
      document.removeEventListener("drop", onDrop);
    };
  }, [loadProject]);

  /* ---------- demo chips ---------- */
  const loadDemo = useCallback(
    (key: string) => {
      const src = REPLAY_DEMOS[key];
      if (!src) return;
      loadProject({
        label: src.label,
        hint: src.hint,
        files: src.files.map((f) => ({
          name: f.name,
          items: f.items.map((x) => ({ ...x })),
        })),
      });
    },
    [loadProject],
  );

  /* ---------- derived render helpers ---------- */
  const n = Math.max(1, items.length - 1);
  const pct = (step / n) * 100;
  const cats = useMemo(() => [...new Set(ann.map((a) => a.category))], [ann]);

  return (
    <div style={{ backgroundColor: "var(--cream)" }}>
      <div className="drag-overlay" id="dragOverlay">
        drop the folder.
      </div>

      <div className="page">
        <SiteNav active="replay" palette={palette} onPaletteChange={writePalette} />

        {/* HERO */}
        <h1 className="hero">
          where the
          <br />
          tokens <span className="leak">leaked.</span>
        </h1>
        <p className="lede">
          drop a whole project folder. we open every <em>session log</em> inside,
          lay it out as a chat, and{" "}
          <span className="coral">scrub the timeline</span> — leaks annotate
          themselves as you go. all client-side.
        </p>

        {/* DROP */}
        <div className="drop-card" id="dropzone">
          <div
            className="drop-input"
            id="dropInput"
            role="button"
            tabIndex={0}
            aria-label="Use the buttons to choose a folder or .jsonl files"
            onClick={flashButtons}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                flashButtons();
              }
            }}
          >
            <span className="icon">↓</span>
            <span className="ph" id="dropPh">
              drop a project folder or .jsonl files here, or use the buttons →
            </span>
            <span className="tag">.jsonl × many</span>
          </div>
          <button
            className={`cta${nudge ? " nudge" : ""}`}
            type="button"
            onClick={openPicker}
            onAnimationEnd={() => setNudge(false)}
          >
            open folder →
          </button>
          <button
            className={`cta ghost${nudge ? " nudge" : ""}`}
            type="button"
            onClick={openFilePicker}
          >
            choose files →
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="visually-hidden"
          onChange={onFolderChange}
        />
        <input
          ref={filesInputRef}
          type="file"
          accept=".jsonl,.json"
          multiple
          className="visually-hidden"
          onChange={onFilesChange}
        />

        <div className="try-row">
          <span className="label">or try a demo project:</span>
          <button className="chip" onClick={() => loadDemo("checkout-refactor")}>
            <b>checkout-refactor</b>
            <span className="dot"></span>
            <em>3 sessions</em>
          </button>
          <button className="chip" onClick={() => loadDemo("blog-cms")}>
            <b>blog-cms</b>
            <span className="dot"></span>
            <em>2 sessions</em>
          </button>
        </div>

        {/* EMPTY */}
        {!project && (
          <div className="empty-art" id="emptyArt">
            <h3>no folder open yet.</h3>
            <p>
              drop a project, or pick a demo above. the sidebar fills with
              sessions; click one to replay it.
            </p>
          </div>
        )}

        {/* WORKSPACE */}
        <div className={`workspace${project ? " live" : ""}`} id="workspace">
          {project && file && (
            <>
              <aside className="sidebar">
                <div className="sb-head">
                  <div className="sb-folder">
                    <span className="fi"></span>
                    <span>{project.label}</span>
                  </div>
                  <div className="sb-sub">
                    {project.files.length}{" "}
                    {project.files.length === 1
                      ? "session file"
                      : "session files"}
                  </div>
                </div>
                <div className="sb-list">
                  {project.files.map((f, i) => (
                    <button
                      key={f.name + i}
                      className={`file-row${i === activeFile ? " active" : ""}`}
                      onClick={() => selectFile(i)}
                    >
                      <span className="fr-name">{f.title || f.name}</span>
                      <span className="fr-meta">
                        {f.items.length} turns{" "}
                        {f.leakCount ? (
                          <span className="fr-leaks">
                            {f.leakCount} leak{f.leakCount > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="fr-clean">clean</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </aside>

              <section className="stage-col">
                <div className="stage-head">
                  <h2>
                    replaying <em>{file.title || file.name}</em>
                  </h2>
                  <div className="sh-meta">
                    <span className="sh-chip">
                      <span className="n">{items.length}</span> turns
                    </span>
                    {file.leakCount ? (
                      <span className="sh-chip leaks">
                        <span className="n">{file.leakCount}</span> leak
                        {file.leakCount > 1 ? "s" : ""} found
                      </span>
                    ) : (
                      <span className="sh-chip">no leaks flagged</span>
                    )}
                    {file.winCount ? (
                      <span className="sh-chip wins">
                        <span className="n">{file.winCount}</span> good move
                        {file.winCount > 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="scrubber">
                  <div className="scr-top">
                    <button
                      className="play-btn"
                      aria-label="Play replay"
                      onClick={togglePlay}
                    >
                      {playing ? "❚❚" : "▶"}
                    </button>
                    <div className="track-wrap">
                      <div
                        className="track"
                        ref={trackRef}
                        onPointerDown={(e) => {
                          if (
                            (e.target as HTMLElement).classList.contains("mark")
                          )
                            return;
                          draggingRef.current = true;
                          trackRef.current?.setPointerCapture(e.pointerId);
                          toStep(e.clientX);
                        }}
                        onPointerMove={(e) => {
                          if (draggingRef.current) toStep(e.clientX);
                        }}
                        onPointerUp={() => {
                          draggingRef.current = false;
                        }}
                      >
                        <div
                          className="track-fill"
                          style={{ width: pct + "%" }}
                        ></div>
                        <div
                          className="track-handle"
                          tabIndex={0}
                          role="slider"
                          aria-label="Replay position"
                          aria-valuenow={step + 1}
                          aria-valuemin={1}
                          aria-valuemax={items.length}
                          style={{ left: pct + "%" }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowLeft") {
                              stopPlay();
                              introTokenRef.current++;
                              setStep(step - 1, true);
                              e.preventDefault();
                            }
                            if (e.key === "ArrowRight") {
                              stopPlay();
                              introTokenRef.current++;
                              setStep(step + 1, true);
                              e.preventDefault();
                            }
                          }}
                        ></div>
                        {ann.map((a) => (
                          <div
                            key={a.targetIdx}
                            className="mark"
                            title={a.title}
                            style={{
                              left: (a.targetIdx / n) * 100 + "%",
                              background: CAT_COLORS[a.category],
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              stopPlay();
                              introTokenRef.current++;
                              setStep(a.targetIdx, true);
                            }}
                          ></div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="scr-foot">
                    <span className="scr-pos">
                      turn <b>{step + 1}</b> / {items.length}
                    </span>
                    <span className="scr-hint">
                      drag to replay · click a ◆ to jump to a leak
                    </span>
                  </div>
                  <div className="leak-legend">
                    {cats.length ? (
                      cats.map((c) => (
                        <span className="lg" key={c}>
                          <span
                            className="sw"
                            style={{ background: CAT_COLORS[c] }}
                          ></span>
                          {CAT_LABEL[c] || c}
                        </span>
                      ))
                    ) : (
                      <span className="lg" style={{ color: "var(--mint)" }}>
                        no leaks in this session — a tidy run.
                      </span>
                    )}
                  </div>
                </div>

                <div className="stage">
                  <div
                    className={`stage-scroll${wide ? " wide" : ""}`}
                    ref={stageScrollRef}
                  >
                    <svg className="connectors" ref={connectorsRef} />
                    <div className="transcript" ref={transcriptRef}>
                      {items.map((it) => {
                        const flagged = annByTarget.get(it.idx);
                        const rowEls = [
                          <TimelineRow
                            key={it.id}
                            it={it}
                            step={step}
                            flagged={flagged}
                          />,
                        ];
                        if (!wide && flagged) {
                          rowEls.push(
                            <CalloutCard
                              key={"co-" + it.id}
                              a={flagged}
                              step={step}
                              inline
                            />,
                          );
                        }
                        return rowEls;
                      })}
                    </div>
                    <div className="callouts" ref={calloutsRef}>
                      {wide &&
                        ann.map((a) => (
                          <CalloutCard
                            key={"co-" + a.targetIdx}
                            a={a}
                            step={step}
                            onClick={() => {
                              stopPlay();
                              introTokenRef.current++;
                              setStep(a.targetIdx, true);
                            }}
                          />
                        ))}
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        <footer className="foot">
          <em>typeset in bricolage grotesque &amp; instrument serif.</em>
          <span className="right">
            source ·{" "}
            {project
              ? `${project.label} (${project.files.length} files)`
              : "none loaded"}
          </span>
        </footer>
      </div>
    </div>
  );
}

/* ---------- tiny inline-markdown renderer ----------
   Transcript rows are short, frequently mid-string-truncated snippets, so we
   only handle inline marks — `code`, **bold**, *italic*, [links] — and leave
   any unclosed marker as literal text. No block-level parsing: the bubble
   layout is single-paragraph by design. */
const MD_RE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\b_[^_]+_\b)|(\[[^\]]+\]\([^)\s]+\))/g;

function mdInline(text?: string): React.ReactNode {
  if (!text) return text ?? null;
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  MD_RE.lastIndex = 0;
  while ((m = MD_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (m[1]) {
      out.push(
        <code key={k++} className="md-code">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    } else if (m[3] || m[4]) {
      out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    } else if (m[5]) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      out.push(
        link ? (
          <a
            key={k++}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="md-link"
          >
            {link[1]}
          </a>
        ) : (
          tok
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* ---------- transcript row ---------- */
function TimelineRow({
  it,
  step,
  flagged,
}: {
  it: TimelineItem;
  step: number;
  flagged?: Annotation;
}) {
  const future = it.idx > step;
  const current = it.idx === step;
  const lit = flagged && it.idx <= step;
  const cls = [
    "ti",
    future ? "future" : "",
    current ? "current" : "",
    flagged ? "flag" : "",
    lit ? "lit" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = flagged
    ? ({ "--cat": CAT_COLORS[flagged.category] } as React.CSSProperties)
    : undefined;

  if (it.kind === "user") {
    return (
      <div className={cls} data-idx={it.idx} style={style}>
        <span className="gut">
          <span className="dot d-user"></span>
        </span>
        <div className="bubble">
          <span className="who">you</span>
          <p className="msg">{it.text}</p>
        </div>
      </div>
    );
  }
  if (it.kind === "assistant") {
    return (
      <div className={cls} data-idx={it.idx} style={style}>
        <span className="gut">
          <span className="dot d-asst"></span>
        </span>
        <div className="asst">
          <span className="who">claude</span>
          <p className="msg">{mdInline(it.text)}</p>
        </div>
      </div>
    );
  }
  if (it.kind === "think") {
    const t = it.secs == null ? "thinking…" : `thought for ${it.secs}s`;
    return (
      <div className={cls} data-idx={it.idx}>
        <span className="gut">
          <span className="tick"></span>
        </span>
        <span className="think">{t}</span>
      </div>
    );
  }
  if (it.kind === "out") {
    return (
      <div className={cls} data-idx={it.idx}>
        <span className="gut">
          <span className="dot d-out"></span>
        </span>
        <span className="outline">
          <b>OUT</b> &nbsp;{it.text}
        </span>
      </div>
    );
  }
  if (it.kind === "context") {
    const what =
      it.op === "selected" && it.lines
        ? `${it.file} · selected lines ${it.lines[0]}–${it.lines[1]}`
        : `opened ${it.file}`;
    return (
      <div className={cls} data-idx={it.idx}>
        <span className="gut">
          <span className="dot d-ctx"></span>
        </span>
        <span className="ctxline">
          <b>IDE</b> &nbsp;{what}
        </span>
      </div>
    );
  }
  // tool / edit
  return (
    <div className={cls} data-idx={it.idx} style={style}>
      <span className="gut">
        <span className="dot d-tool"></span>
      </span>
      <div className="tool">
        <div className="tline">
          <span className="op">{it.op}</span>
          {it.file && <span className="tfile"> {it.file}</span>}
          {it.lines && (
            <span className="trange">
              {" "}
              lines {it.lines[0]}–{it.lines[1]}
            </span>
          )}
          {it.detail && <span className="tdetail"> {it.detail}</span>}
        </div>
        {it.diff && (
          <div className="diff">
            {it.diff.map((d, di) => (
              <div
                key={di}
                className={`dl ${d.t === "-" ? "minus" : "plus"}`}
              >
                {d.t} {d.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- callout card ---------- */
function CalloutCard({
  a,
  step,
  inline,
  onClick,
}: {
  a: Annotation;
  step: number;
  inline?: boolean;
  onClick?: () => void;
}) {
  const show = a.targetIdx <= step;
  const cls = ["callout", inline ? "inline" : "", show ? "show" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
      data-idx={a.targetIdx}
      data-cat={a.category}
      style={{ "--cat": CAT_COLORS[a.category] } as React.CSSProperties}
      onClick={onClick}
    >
      <span className="co-tag">
        <span className="sq"></span>
        {CAT_LABEL[a.category] || a.category}
        {a.tag && <span className="f"> · {a.tag}</span>}
      </span>
      <h4 className="co-title">{a.title}</h4>
      <p className="co-body" dangerouslySetInnerHTML={{ __html: a.body }} />
    </div>
  );
}
