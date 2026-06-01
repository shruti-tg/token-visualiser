/* =====================================================================
   REPLAY DEMOS
   Hand-authored sample "project folders" — each is a set of session
   files (pre-built timelines). The page runs the SAME analyzer on them
   that it runs on real dropped folders, so the leaks are not faked.
   Ported from the design's plain-JS demos.
   ===================================================================== */
import type { Project, TimelineItem, Usage } from "./replay-engine";

type Partial = Omit<TimelineItem, "idx" | "id">;

function ctxUsage(ctx: number, out?: number, model?: string): Usage {
  return {
    ctx,
    cRead: Math.round(ctx * 0.9),
    cWrite: Math.round(ctx * 0.1),
    out: out || 280,
    ...(model ? { model } : {}),
  };
}
const U = (t: string): Partial => ({ kind: "user", text: t });
const A = (t: string, usage?: Usage): Partial =>
  usage ? { kind: "assistant", text: t, usage } : { kind: "assistant", text: t };
const TH = (s: number): Partial => ({ kind: "think", secs: s });
const O = (t: string): Partial => ({ kind: "out", text: t });
const RD = (
  file: string,
  a: number | null,
  b: number | null,
  ctx?: number,
  model?: string,
): Partial => {
  const it: Partial = {
    kind: "tool",
    op: "Read",
    file,
    lines: a != null && b != null ? [a, b] : null,
    detail: "",
    diff: null,
  };
  if (ctx) it.usage = ctxUsage(ctx, undefined, model);
  return it;
};
const ED = (file: string, minus: string, plus: string): Partial => ({
  kind: "tool",
  op: "Edit",
  file,
  lines: null,
  detail: "",
  diff: [
    { t: "-", text: minus },
    { t: "+", text: plus },
  ],
});
const BASH = (cmd: string, ctx?: number, model?: string): Partial => {
  const it: Partial = {
    kind: "tool",
    op: "Bash",
    file: null,
    lines: null,
    detail: cmd,
    diff: null,
  };
  if (ctx) it.usage = ctxUsage(ctx, undefined, model);
  return it;
};
const WR = (file: string): Partial => ({
  kind: "tool",
  op: "Write",
  file,
  lines: null,
  detail: "wrote file",
  diff: null,
});
const ASK = (q: string): Partial => ({
  kind: "tool",
  op: "AskUserQuestion",
  file: null,
  lines: null,
  detail: q,
  diff: null,
});

/* ---------------- project 1: checkout-refactor (3 sessions) ---------------- */
const payment: Partial[] = [
  U("open the pricing page and tell me what the hero says right now."),
  TH(4),
  RD("page.tsx", 1, 60, 12000),
  A("the hero reads “where did the tokens go?” with a subhead about token count."),
  U("the hero line doesn't land — make it about cost, not token count."),
  U("and “save the tokens” → “save the bill.” punchier."),
  TH(13),
  ASK("title direction — cost-forward or token-forward?"),
  O("user answered: go cost-forward, “save the bill”"),
  RD("page.tsx", 509, 543, 31000),
  RD("page.tsx", 541, 550, 33000),
  TH(0),
  ED("page.tsx", "<em>(the expensive ones.)</em>", "<em>save the bill.</em>"),
  A("done — hero now reads “save the bill”, and the subhead is tightened to match."),
];
const OPUS = "claude-opus-4-5";
const SONNET = "claude-sonnet-4-6";
const cart: Partial[] = [
  U("the cart total is wrong when a coupon is applied. dig in and fix it."),
  TH(7),
  RD("cart.ts", 1, 140, 16000, OPUS),
  RD("coupon.ts", 1, 90, 22000, OPUS),
  A("found it — coupon.ts subtracts the discount from the post-tax total, not the subtotal.", ctxUsage(24000, 180, OPUS)),
  TH(3),
  RD("coupon.ts", 1, 90, 41000, OPUS),
  ED(
    "coupon.ts",
    "const total = afterTax - coupon",
    "const sub = subtotal - coupon; // tax recomputed after",
  ),
  U("now add a test for stacked coupons."),
  TH(5),
  RD("cart.test.ts", 1, 200, 58000, SONNET),
  WR("cart.test.ts"),
  BASH("npm test -- cart", 72000, SONNET),
  O("Tests: 7 passed, 0 failed"),
  A("fixed the coupon math and added a stacked-coupon regression test. all green.", ctxUsage(74000, 240, SONNET)),
];
const receipts: Partial[] = [
  U("draft the order-confirmation email template as plain inline-styled HTML."),
  TH(6),
  RD("mailer.ts", 1, 80, 14000),
  A(
    "here's the full template — header, line-items table, totals block, footer, and a plain-text fallback…",
    ctxUsage(15000, 5200),
  ),
  WR("receipt.html"),
  U("good. now wire it into the checkout success handler."),
  TH(4),
  RD("checkout.ts", 40, 120, 21000),
  ED("checkout.ts", "// TODO: send receipt", "await sendReceipt(order, user.email)"),
  A("wired the receipt email into the checkout success handler."),
];

/* ---------------- project 2: blog-cms (2 sessions) ---------------- */
const postsApi: Partial[] = [
  U("add cursor pagination to the posts API."),
  TH(5),
  RD("posts.ts", 200, 260, 18000),
  RD("posts.ts", 255, 300, 19000),
  TH(2),
  ED("posts.ts", "return posts.slice(0, limit)", "return paginate(posts, cursor, limit)"),
  A("added cursor-based pagination with a nextCursor in the response envelope."),
];
const seoMeta: Partial[] = [
  U("add an og:image and twitter:card meta tag to @app/blog/layout.tsx."),
  TH(3),
  RD("layout.tsx", 1, 60, 13000),
  ED(
    "layout.tsx",
    '<meta name="description" …',
    '<meta property="og:image" … + twitter:card',
  ),
  A("added og:image and summary_large_image twitter:card to the post layout head."),
];

export const REPLAY_DEMOS: Record<string, Project> = {
  "checkout-refactor": {
    label: "checkout-refactor",
    hint: "a pricing-page polish + a coupon bug + a receipt email",
    files: [
      { name: "payment-flow.jsonl", items: payment as TimelineItem[] },
      { name: "cart-bugfix.jsonl", items: cart as TimelineItem[] },
      { name: "email-receipts.jsonl", items: receipts as TimelineItem[] },
    ],
  },
  "blog-cms": {
    label: "blog-cms",
    hint: "two short, mostly-tidy sessions",
    files: [
      { name: "posts-api.jsonl", items: postsApi as TimelineItem[] },
      { name: "seo-meta.jsonl", items: seoMeta as TimelineItem[] },
    ],
  },
};
