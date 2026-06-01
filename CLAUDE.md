# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> ⚠️ This is **Next.js 16.2.6** with React 19. APIs and conventions differ from older Next.js. Per AGENTS.md, read the relevant guide in `node_modules/next/dist/docs/` before writing framework code.

## Commands

```bash
npm run dev      # dev server on http://localhost:3000
npm run build    # production build
npm start        # serve production build
npm run lint     # eslint (flat config, eslint-config-next)
npx tsc --noEmit # type check (tsconfig sets noEmit)
```

There is **no test suite** in this repo.

## What this is

"Token Ledger" — a 100% client-side Next.js App Router app that visualizes Claude Code token usage. Users drop a `.jsonl` session log; everything is parsed and rendered in the browser. No backend, no data upload, no database.

## Architecture

All code lives in `app/` (App Router). Every page is a `"use client"` component — there is no server-side data handling.

**Routes** (each a self-contained `page.tsx`, navigation defined in [app/SiteNav.tsx](app/SiteNav.tsx)):

- `/` — [app/page.tsx](app/page.tsx) — the ledger: file drop, JSONL parsing, all charts/stats (~2300 lines, the core of the app)
- `/token-chart` — [app/token-chart/page.tsx](app/token-chart/page.tsx) — static explainer of how the token chart is built
- `/guide` — [app/guide/page.tsx](app/guide/page.tsx) — static token-saving guide
- `/replay` — [app/replay/page.tsx](app/replay/page.tsx) — scrub-through-a-session view, backed by [app/replay/replay-engine.ts](app/replay/replay-engine.ts) (parsing/analysis) and [app/replay/replay-demos.ts](app/replay/replay-demos.ts)

**Core data flow (the ledger, [app/page.tsx](app/page.tsx)):**

1. `parseTranscript(text)` splits JSONL by line, keeps only `message.role === "assistant"` rows with a `usage` block, dedupes by `message.id`, and builds `Turn[]`.
2. Per-turn cost is computed from `usage` token counts × per-model pricing. Pricing is **hardcoded** in `modelPricing()` / `DEFAULT_PRICING`; the model family is inferred from `message.model` via `prettyModelName()`.
3. `detectCompactions()` and `detectCacheBusts()` analyze the `Turn[]` to find where the prompt cache prefix broke (model switch, TTL expiry, tool-block change, cwd/branch change, version bump, `/compact`, rewind, etc. — see the `BustCause` union and `BUST_LABELS`).
4. Results are aggregated into a `Stats` object and rendered by `<Report>`. Charts (`createStackedBarsChart`, `createContextLineChart`, `createCostCompareChart`) are **hand-built SVG** — no chart library.

When changing token math or cost numbers, both `parseTranscript` (actual vs. no-cache cost) and `modelPricing` must stay in sync.

## Theming

- 5 palettes (`workshop`, `cream`, `sage`, `plum`, `slate`) selected in the nav, persisted to `localStorage` under `tokenLedgerPalette`.
- [app/palette.ts](app/palette.ts) exposes `usePalette()` (a `useSyncExternalStore` subscription) and `writePalette()`. The active palette is applied by setting `data-palette` on `<body>`; all colors are CSS variables keyed off that attribute in [app/globals.css](app/globals.css).
- Add a palette in three places: the `PALETTES` array + `PALETTE_COLORS` in [app/SiteNav.tsx](app/SiteNav.tsx), and the `[data-palette="..."]` block in [app/globals.css](app/globals.css).
