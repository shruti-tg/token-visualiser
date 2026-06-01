/* =====================================================================
   REPLAY ENGINE
   Turns a Claude Code .jsonl session into a flat "timeline" of items,
   then scans that timeline for token/cost leaks ("annotations").
   Ported from the design's plain-JS engine to typed TS.
   ===================================================================== */

export type ItemKind =
  | "user"
  | "assistant"
  | "think"
  | "out"
  | "tool"
  | "context";

export interface DiffLine {
  t: "-" | "+";
  text: string;
}

export interface Usage {
  ctx: number;
  cRead: number;
  cWrite: number;
  out: number;
  /** model that produced the turn — used to size the context window for bloat */
  model?: string;
}

/* ---------- map a model id to its context-window size (tokens) ----------
   Claude models are 200k by default; the 1M-context variants (e.g. the
   "[1m]" Opus build) carry that marker in the id. Unknown models fall back
   to the safe 200k floor. */
export function contextWindowForModel(model?: string): number {
  if (!model) return 200_000;
  const m = model.toLowerCase();
  if (m.includes("1m")) return 1_000_000;
  return 200_000;
}

/* ---------- map a raw model id to a short human label ----------
   "claude-opus-4-8[1m]" -> "Opus 4.8". Falls back to the raw id when the
   family/version can't be parsed. Mirrors the ledger's prettyModelName. */
export function prettyModel(id?: string): string {
  if (!id) return "";
  const fam = (id.toLowerCase().match(/opus|sonnet|haiku/) || [])[0];
  if (!fam) return id;
  const Fam = fam[0].toUpperCase() + fam.slice(1);
  const parts = id.toLowerCase().split(fam);
  const after = (parts[1] || "").match(/^[-_]?(\d+(?:[-_.]\d+)?)/);
  const before = (parts[0] || "").match(/(\d+(?:[-_.]\d+)?)[-_]?$/);
  const ver = (
    after && after[1].length <= 5
      ? after[1]
      : before && before[1].length <= 5
        ? before[1]
        : ""
  ).replace(/[-_]/g, ".");
  return ver ? `${Fam} ${ver}` : Fam;
}

export interface TimelineItem {
  kind: ItemKind;
  idx: number;
  id: string;
  text?: string;
  secs?: number | null;
  op?: string;
  file?: string | null;
  lines?: [number, number] | null;
  detail?: string;
  diff?: DiffLine[] | null;
  usage?: Usage;
}

export type Category =
  | "redundant"
  | "repeat"
  | "bloat"
  | "output"
  | "switch"
  | "win";

/** categories that are good things, not leaks — excluded from leak counts */
export const WIN_CATEGORIES: ReadonlySet<Category> = new Set<Category>(["win"]);
export const isWin = (c: Category) => WIN_CATEGORIES.has(c);

export interface Annotation {
  targetIdx: number;
  category: Category;
  title: string;
  body: string;
  tag?: string;
}

export interface SessionFile {
  name: string;
  /** human title pulled from the session's ai-title line, if present */
  title?: string;
  items: TimelineItem[];
  annotations?: Annotation[];
  leakCount?: number;
  winCount?: number;
  calls?: number;
}

export interface Project {
  label: string;
  hint?: string;
  files: SessionFile[];
}

/* ---------- small helpers ---------- */
function _basename(p: unknown): string {
  if (!p) return "";
  const parts = String(p).split(/[/\\]/);
  return parts[parts.length - 1] || String(p);
}
function _firstLine(s: unknown, max?: number): string {
  if (s == null) return "";
  const line =
    String(s)
      .split(/\r?\n/)
      .find((l) => l.trim()) || String(s).trim();
  max = max || 64;
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}
function _short(s: unknown, max?: number): string {
  const str = (s == null ? "" : String(s)).replace(/\s+/g, " ").trim();
  max = max || 90;
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

/* ---------- collapse image placeholders ----------
   The harness renders attached images as a text blurb like
   "[Image: original 2750x1122, displayed at ...]". Surface those as a plain
   "image attached" note. Returns null when the text isn't an image placeholder. */
function _imgPlaceholder(text: string): string | null {
  return /^\[Image\b/i.test(text.trim()) ? "image attached" : null;
}

/* ---------- detect IDE context wrappers in a user turn ----------
   Claude Code injects <ide_opened_file> / <ide_selection> blocks into user
   content. They start with "<", so the normal text path skips them as noise —
   but they describe a real file the user surfaced, so we turn them into a slim
   context row instead of dropping them silently. Returns null for other tags. */
function _ideContext(text: unknown): TimelineItem | null {
  const s = String(text == null ? "" : text);
  const sel = s.match(/selected the lines (\d+) to (\d+) from (\S+?):/);
  if (sel) {
    return {
      kind: "context",
      idx: 0,
      id: "",
      op: "selected",
      file: _basename(sel[3]),
      lines: [Number(sel[1]), Number(sel[2])],
    };
  }
  const open = s.match(/opened the file (\S+?) in the IDE/);
  if (open) {
    return { kind: "context", idx: 0, id: "", op: "opened", file: _basename(open[1]) };
  }
  return null;
}

/* ---------- normalize: assign idx + id to every item ---------- */
export function normalizeTimeline(
  items: TimelineItem[],
): TimelineItem[] {
  items.forEach((it, i) => {
    it.idx = i;
    it.id = "i" + i;
  });
  return items;
}

/* ---------- build a tool item from a tool_use block ---------- */
function _toolItem(
  name: string | undefined,
  input: Record<string, unknown> | undefined,
): TimelineItem {
  const inp = (input || {}) as Record<string, unknown>;
  const op = name || "Tool";
  const it: TimelineItem = {
    kind: "tool",
    idx: 0,
    id: "",
    op,
    file: null,
    lines: null,
    detail: "",
    diff: null,
  };

  const fp = (inp.file_path || inp.path || inp.filePath) as string | undefined;
  if (fp) it.file = _basename(fp);

  switch (op) {
    case "Read": {
      if (inp.offset != null) {
        const a = Number(inp.offset);
        const b = inp.limit != null ? a + Number(inp.limit) - 1 : a + 0;
        it.lines = [a, b];
      }
      break;
    }
    case "Edit":
    case "str_replace_edit": {
      it.op = "Edit";
      const minus = _firstLine(inp.old_string || inp.oldString || "", 58);
      const plus = _firstLine(inp.new_string || inp.newString || "", 58);
      if (minus || plus) {
        it.diff = [
          { t: "-", text: minus },
          { t: "+", text: plus },
        ];
      }
      break;
    }
    case "MultiEdit": {
      it.op = "Edit";
      const edits = inp.edits as Array<Record<string, unknown>> | undefined;
      const e = (edits && edits[0]) || {};
      const minus = _firstLine(e.old_string || "", 58);
      const plus = _firstLine(e.new_string || "", 58);
      if (minus || plus) {
        it.diff = [
          { t: "-", text: minus },
          { t: "+", text: plus },
        ];
      }
      it.detail = (edits ? edits.length : 1) + " edits";
      break;
    }
    case "Write":
      it.detail = "wrote file";
      break;
    case "Bash":
      it.detail = _short(inp.command || inp.cmd || "", 70);
      break;
    case "Grep":
      it.detail = _short(inp.pattern || "", 50);
      it.file = inp.path ? _basename(inp.path) : it.file;
      break;
    case "Glob":
      it.detail = _short(inp.pattern || "", 50);
      break;
    case "Task":
      it.detail = _short(inp.description || "", 60);
      break;
    case "WebFetch":
      it.detail = _short(inp.url || "", 60);
      break;
    default: {
      // best-effort: surface a query/description-ish field
      it.detail = _short(
        inp.description || inp.query || inp.prompt || inp.pattern || "",
        56,
      );
    }
  }
  return it;
}

/* ---------- pull the conversation name from a session's ai-title line ----------
   Claude Code writes one or more {"type":"ai-title","aiTitle":"…"} lines as the
   title gets refined; the last one is the most current, so that's what we keep. */
export function parseSessionTitle(text: string): string | undefined {
  let title: string | undefined;
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim() || !raw.includes("ai-title")) continue;
    try {
      const obj = JSON.parse(raw);
      if (obj.type === "ai-title" && typeof obj.aiTitle === "string") {
        const t = obj.aiTitle.trim();
        if (t) title = t;
      }
    } catch {
      continue;
    }
  }
  return title;
}

/* ---------- parse Claude Code .jsonl text → timeline items ---------- */
export function parseSessionJsonl(text: string): TimelineItem[] {
  const lines = String(text)
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const items: TimelineItem[] = [];
  const seen = new Set<string>();
  let prevTs: number | null = null;

  for (const raw of lines) {
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    const msg = obj.message || obj;
    const role = msg.role || obj.type;
    if (!msg || !role) continue;

    const ts = obj.timestamp || obj.time || msg.timestamp || null;
    const tsMs = ts ? Date.parse(ts) : null;

    /* ---- USER ---- */
    if (role === "user") {
      const c = msg.content;
      if (typeof c === "string") {
        const t = c.trim();
        const ide = _ideContext(t);
        if (ide) items.push(ide);
        else if (t && !t.startsWith("<"))
          items.push({ kind: "user", idx: 0, id: "", text: _imgPlaceholder(t) ?? _short(t, 240) });
      } else if (Array.isArray(c)) {
        // an attached image shows up as a real `image` block AND, in a separate
        // message, a "[Image: ...]" text placeholder. The image block is
        // authoritative — emit "image attached" once for it and drop the
        // placeholder text entirely so the image isn't counted twice.
        let imgPushed = false;
        for (const b of c) {
          if (b.type === "image") {
            if (imgPushed) continue;
            imgPushed = true;
            items.push({ kind: "user", idx: 0, id: "", text: "image attached" });
          } else if (b.type === "text" && b.text && b.text.trim()) {
            const t = b.text.trim();
            if (_imgPlaceholder(t)) continue; // drop placeholder; image block covers it
            const ide = _ideContext(t);
            if (ide) items.push(ide);
            else if (!t.startsWith("<"))
              items.push({
                kind: "user",
                idx: 0,
                id: "",
                text: _short(b.text, 240),
              });
          } else if (b.type === "tool_result") {
            let out = "";
            if (typeof b.content === "string") out = b.content;
            else if (Array.isArray(b.content))
              out = b.content.map((x: { text?: string }) => x.text || "").join(" ");
            out = _short(out.replace(/\s+/g, " "), 70);
            if (out) items.push({ kind: "out", idx: 0, id: "", text: out });
          }
        }
      }
      prevTs = tsMs || prevTs;
      continue;
    }

    /* ---- ASSISTANT ----
       Claude Code splits a single assistant turn across several lines — one
       content block per line — all sharing the same message.id and repeating
       the same usage. So we must NOT skip sibling lines (that would drop the
       text/tool_use that follows a leading thinking block, leaving an empty
       "(no content)" row). Instead, render every line's blocks and count the
       repeated usage only once, on the first line we see for that id. */
    if (role === "assistant") {
      const firstForId = !msg.id || !seen.has(msg.id);
      if (msg.id) seen.add(msg.id);
      const u = msg.usage || {};
      const cWrite = u.cache_creation_input_tokens || 0;
      const cRead = u.cache_read_input_tokens || 0;
      const inTok = u.input_tokens || 0;
      const ctx = inTok + cWrite + cRead;
      const usage: Usage | null =
        firstForId && (ctx || u.output_tokens)
          ? { ctx, cRead, cWrite, out: u.output_tokens || 0, model: msg.model }
          : null;
      let usageAttached = false;

      const blocks = Array.isArray(msg.content)
        ? msg.content
        : [{ type: "text", text: msg.content }];
      let thoughtSecs: number | null =
        tsMs && prevTs ? Math.max(0, Math.round((tsMs - prevTs) / 1000)) : null;

      for (const b of blocks) {
        if (b.type === "thinking" || b.type === "redacted_thinking") {
          const it: TimelineItem = {
            kind: "think",
            idx: 0,
            id: "",
            secs: thoughtSecs,
          };
          if (usage && !usageAttached) {
            it.usage = usage;
            usageAttached = true;
          }
          items.push(it);
          thoughtSecs = null;
        } else if (b.type === "text" && b.text && b.text.trim()) {
          const it: TimelineItem = {
            kind: "assistant",
            idx: 0,
            id: "",
            text: _short(b.text, 220),
          };
          if (usage && !usageAttached) {
            it.usage = usage;
            usageAttached = true;
          }
          items.push(it);
        } else if (b.type === "tool_use") {
          const it = _toolItem(b.name, b.input);
          if (usage && !usageAttached) {
            it.usage = usage;
            usageAttached = true;
          }
          items.push(it);
        }
      }
      // if usage never attached (no renderable block), drop a thin marker so context is tracked
      if (usage && !usageAttached) {
        items.push({
          kind: "assistant",
          idx: 0,
          id: "",
          text: "(no content)",
          usage,
        });
      }
      prevTs = tsMs || prevTs;
      continue;
    }
  }
  return normalizeTimeline(items);
}

/* match an @-mention of a file path in a user prompt, e.g. @app/replay/x.ts */
const _ATMENTION = /(?:^|\s)@([\w./-]+\.\w+)/;

/* =====================================================================
   ANALYZER — scan the timeline for leaks (and the occasional good move).
   leak categories: redundant | bloat | output
   win  categories: win
   ===================================================================== */
export function analyzeTimeline(items: TimelineItem[]): Annotation[] {
  const ann: Annotation[] = [];
  const used = new Set<number>(); // targetIdx already annotated (one note per turn)
  const push = (a: Annotation) => {
    if (!used.has(a.targetIdx)) {
      used.add(a.targetIdx);
      ann.push(a);
    }
  };

  /* 0 — win: user pointed Claude straight at a file with @, so it skipped the
         Glob/Grep hunt. flag the prompt before any leak note can claim it. */
  for (const it of items) {
    if (it.kind !== "user" || !it.text) continue;
    const m = _ATMENTION.exec(it.text);
    if (!m) continue;
    const file = _basename(m[1]);
    // look only at what Claude did on this turn — up to the next user prompt.
    const next = items.slice(it.idx + 1, it.idx + 6);
    const stop = next.findIndex((n) => n.kind === "user");
    const window = stop === -1 ? next : next.slice(0, stop);
    // did Claude run an exploratory search anyway? then the @ didn't save the hunt.
    const hunted = window.some(
      (n) => n.kind === "tool" && (n.op === "Glob" || n.op === "Grep"),
    );
    if (hunted || !window.length) continue;
    push({
      targetIdx: it.idx,
      category: "win",
      title: "pointed straight at the file",
      body: `the <b>@${file}</b> mention handed Claude the exact path — no <b>Glob</b>/<b>Grep</b> hunt, no guessing. naming the file up front is the cheapest way to skip exploration.`,
      tag: file || undefined,
    });
  }

  const reads = items.filter(
    (it) => it.kind === "tool" && it.op === "Read" && it.file,
  );

  /* 1 — redundant re-read: same file fully re-read later, no Edit/Write between */
  for (let i = 0; i < reads.length; i++) {
    for (let j = i + 1; j < reads.length; j++) {
      const a = reads[i],
        b = reads[j];
      if (a.file !== b.file) continue;
      if (used.has(b.idx)) continue;
      // was the file edited between the two reads?
      const edited = items.some(
        (it) =>
          it.idx > a.idx &&
          it.idx < b.idx &&
          it.kind === "tool" &&
          (it.op === "Edit" || it.op === "Write") &&
          it.file === a.file,
      );
      const superset =
        a.lines &&
        b.lines &&
        a.lines[0] <= b.lines[0] &&
        a.lines[1] >= b.lines[1];
      const wholeAgain = !a.lines && !b.lines;
      if (!edited && (superset || wholeAgain) && b.idx - a.idx >= 2) {
        push({
          targetIdx: b.idx,
          category: "redundant",
          title: "already in context",
          body: `<b>${a.file}</b> was read earlier and hasn't changed since — it's still cached. this re-read just pays for the same lines again.`,
          tag: a.file || undefined,
        });
        break;
      }
    }
  }

  /* 2 — context bloat: first turn where the model has filled ≥70% of its
         context window. the window is sized from the model that produced the
         turn (200k by default, 1M for the 1M-context builds). */
  const bloatModel = items.find((it) => it.usage)?.usage?.model;
  const windowSize = contextWindowForModel(bloatModel);
  const BLOAT = Math.round(windowSize * 0.7);
  let bloated = false;
  for (const it of items) {
    if (bloated) break;
    if (it.usage && it.usage.ctx >= BLOAT) {
      const pct = Math.round((it.usage.ctx / windowSize) * 100);
      const winK = Math.round(windowSize / 1000);
      push({
        targetIdx: it.idx,
        category: "bloat",
        title: "the context got heavy",
        body: `this turn is already at <b>${pct}%</b> of the model's ${winK}k context window, and from here on the whole conversation is re-read every single turn — the priciest thing in the session. a <b>/compact</b> or a fresh session trims what gets re-sent.`,
        tag: "context",
      });
      bloated = true;
    }
  }

  /* 3 — oversized output */
  for (const it of items) {
    if (it.usage && it.usage.out >= 4000 && !used.has(it.idx)) {
      push({
        targetIdx: it.idx,
        category: "output",
        title: "a very long generation",
        body: `output is billed at 5× the input rate. asking for a tighter answer — or a diff instead of the whole file — is the cheapest lever you have.`,
        tag: "output",
      });
      break;
    }
  }

  /* 4 — repeated IDE context: the same file (or the exact same selection)
         surfaced to Claude more than once. each re-attach re-injects that file
         into the prompt, so the same lines are paid for again. flag the repeat,
         never the first sighting. */
  const seenSel = new Map<string, TimelineItem>(); // file + line-range → first
  const seenFile = new Map<string, TimelineItem>(); // file → first
  for (const it of items) {
    if (it.kind !== "context" || !it.file) continue;
    const range = it.lines ? `${it.lines[0]}-${it.lines[1]}` : "all";
    const selKey = `${it.file}#${range}`;
    const sameSel = seenSel.has(selKey);
    const sameFile = seenFile.has(it.file);
    if (sameSel) {
      const where = it.lines ? ` (lines ${it.lines[0]}–${it.lines[1]})` : "";
      push({
        targetIdx: it.idx,
        category: "repeat",
        title: "same selection, shared again",
        body: `the exact same selection in <b>${it.file}</b>${where} was already attached earlier — and it hasn't changed. re-attaching identical context re-sends those lines to the model when they're already there.`,
        tag: it.file || undefined,
      });
    } else if (sameFile) {
      push({
        targetIdx: it.idx,
        category: "repeat",
        title: "same file, surfaced again",
        body: `<b>${it.file}</b> was already opened or selected earlier this session. surfacing it again re-injects the file into context — once it's in, you don't need to hand it over a second time.`,
        tag: it.file || undefined,
      });
    }
    if (!sameSel) seenSel.set(selKey, it);
    if (!sameFile) seenFile.set(it.file, it);
  }

  /* 5 — model switch: the turn's model id differs from the last model-bearing
         turn. switching models invalidates the prompt cache built up on the old
         model, so the whole conversation so far is re-read at full input price on
         the first turn under the new model. flag that first turn. */
  let prevModel: string | undefined;
  for (const it of items) {
    const model = it.usage?.model;
    if (!model) continue;
    if (prevModel && model !== prevModel) {
      push({
        targetIdx: it.idx,
        category: "switch",
        title: "the model changed",
        body: `this turn switched from <b>${prettyModel(prevModel)}</b> to <b>${prettyModel(model)}</b>. the prompt cache is per-model, so the one built on ${prettyModel(prevModel)} can't be reused — the entire conversation so far is re-read at full input price on the new model before this turn answers.`,
        tag: "model",
      });
    }
    prevModel = model;
  }

  ann.sort((a, b) => a.targetIdx - b.targetIdx);
  return ann;
}

/* ---------- prepare a project for display (clone + normalize + annotate) ---------- */
export function prepareProject(proj: Project): Project {
  const files = proj.files.map((f) => {
    const items = normalizeTimeline(f.items.map((x) => ({ ...x })));
    const annotations = analyzeTimeline(items);
    return {
      name: f.name,
      title: f.title,
      items,
      annotations,
      leakCount: annotations.filter((a) => !isWin(a.category)).length,
      winCount: annotations.filter((a) => isWin(a.category)).length,
      calls: items.filter(
        (it) =>
          it.kind === "tool" || it.kind === "assistant" || it.kind === "user",
      ).length,
    };
  });
  return { label: proj.label, hint: proj.hint, files };
}

export async function buildProjectFromFiles(
  fileList: File[],
  folderName: string,
): Promise<Project | null> {
  const files: File[] = [];
  for (const f of fileList) {
    if (!/\.jsonl?$/i.test(f.name)) continue;
    files.push(f);
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  const parsed = await Promise.all(
    files.map(async (f) => {
      const text = await f.text();
      const items = parseSessionJsonl(text);
      const title = parseSessionTitle(text);
      const rel = (f as File & { webkitRelativePath?: string })
        .webkitRelativePath;
      return {
        name: rel ? rel.split("/").pop() || f.name : f.name,
        title,
        items,
      } as SessionFile;
    }),
  );
  const usable = parsed.filter((p) => p.items.length);
  if (!usable.length) return null;
  return { label: folderName || "dropped folder", files: usable };
}

export const CAT_COLORS: Record<Category, string> = {
  redundant: "var(--blue)",
  repeat: "var(--blue)",
  bloat: "var(--pink)",
  output: "var(--coral)",
  switch: "var(--gold)",
  win: "var(--mint)",
};

export const CAT_LABEL: Record<Category, string> = {
  redundant: "redundant read",
  repeat: "repeated context",
  bloat: "context bloat",
  output: "big output",
  switch: "model switch",
  win: "scoped with @",
};
