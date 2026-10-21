// =============================================================================
// MCP endpoint (streamable HTTP, stateless) so AI agents like Muse can query
// and drive Popcorn Quest. No auth, matching the rest of the API.
//
// Tools call the existing REST routes in-process via `app.request`, so all
// XP / streak / bonus logic stays in app.ts.
// =============================================================================

import type { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { todayKey } from "@popcorn/shared";
import type {
  AdhocTask,
  CompleteRequest,
  CompleteResponse,
  DaySummaryResponse,
  TaskTemplate,
  TodayState,
  XpLogResponse,
} from "@popcorn/shared";
import { resolveDateKeyword, xpForTask } from "./engine.js";

const DATE = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2}|today|yesterday)$/i)
  .optional()
  .describe('Local date yyyy-mm-dd, "today" or "yesterday" (defaults to today, US Eastern)');

// Resolve "today" / "yesterday" so tools that read and then write agree on the day.
function resolveDay(date: string | undefined): string {
  return date ? (resolveDateKeyword(date) ?? date) : todayKey();
}

function instructions(kid: string): string {
  return [
    `Popcorn Quest is ${kid}'s chore and goal tracker. Finishing tasks earns XP for Popcorn, a virtual dog who levels up.`,
    "Daily tasks reset every day; weekly tasks have a per-week target; side quests are one-off tasks for a single day.",
    "Finishing every daily task earns a bonus and extends the streak. Spendable XP buys rewards (approved by a parent) and streak shields.",
    `To answer "what did ${kid} do today/yesterday" use get_day_summary (date "today" or "yesterday" works). List every line of earnedItems: repeated lines are separate completions, keep them all. Give xpEarned as the total and completions as the number of tasks done.`,
    "For the raw XP log use get_xp_log. In get_history, completed/required counts only distinct daily tasks; completions counts everything.",
    "Dates are local US Eastern days in yyyy-mm-dd form.",
  ].join("\n");
}

type Json = Record<string, unknown>;

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

async function call<T>(app: Hono, path: string, body?: Json): Promise<T> {
  const res = await app.request(
    path,
    body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined,
  );
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

type Match =
  | { kind: "template"; template: TaskTemplate; doneToday: boolean }
  | { kind: "adhoc"; adhoc: AdhocTask };

// Find a task by id, exact title, or unique case-insensitive title substring.
function findTask(state: TodayState, query: string): Match | string {
  const q = query.trim().toLowerCase();
  const all: Match[] = [
    ...state.daily.map((d) => ({ kind: "template" as const, template: d.template, doneToday: d.completedToday })),
    ...state.weekly.map((w) => ({ kind: "template" as const, template: w.template, doneToday: w.completedToday })),
    ...state.adhoc.map((a) => ({ kind: "adhoc" as const, adhoc: a })),
  ];
  const idOf = (m: Match) => (m.kind === "template" ? m.template.id : m.adhoc.id);
  const titleOf = (m: Match) => (m.kind === "template" ? m.template.title : m.adhoc.title).toLowerCase();
  const exact = all.find((m) => idOf(m) === query || titleOf(m) === q);
  if (exact) return exact;
  const partial = all.filter((m) => titleOf(m).includes(q));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) return `"${query}" matches several tasks: ${partial.map(titleOf).join(", ")}. Be more specific or pass the id.`;
  return `No task matches "${query}". Use list_tasks to see task ids and titles.`;
}

function completeResult(r: CompleteResponse) {
  const { pet, streak } = r.state.family;
  return text({
    xpDelta: r.xpDelta,
    leveledUp: r.leveledUp,
    unlocked: r.unlocked,
    pet: { level: pet.level, xp: pet.xp, spendableXp: pet.spendableXp },
    streak,
    todayProgress: Math.round(r.state.todayProgress * 100) + "%",
  });
}

export function buildMcpServer(app: Hono): McpServer {
  const kid = process.env.KID_NAME || "Manu";
  const server = new McpServer(
    { name: "popcorn-quest", version: "1.0.0" },
    { instructions: instructions(kid) },
  );
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    "get_day_summary",
    {
      description: `What ${kid} did on a day: XP earned, number of completions, one line per XP item (earnedItems), tasks done and remaining, streak, level and pending reward claims.`,
      inputSchema: { date: DATE },
      annotations: readOnly,
    },
    async ({ date }) => text(await call<DaySummaryResponse>(app, `/summary?date=${resolveDay(date)}`)),
  );

  server.registerTool(
    "get_xp_log",
    {
      description:
        "Itemised XP log (each entry: time, signed amount, reason, balance after). Pass date for one day, from/to for a range, or neither for the most recent entries.",
      inputSchema: {
        date: DATE,
        from: DATE.describe("Range start yyyy-mm-dd"),
        to: DATE.describe("Range end yyyy-mm-dd (defaults to today)"),
        limit: z.number().int().min(1).max(1000).optional(),
      },
      annotations: readOnly,
    },
    async ({ date, from, to, limit }) => {
      const qs = new URLSearchParams();
      if (date) qs.set("date", resolveDay(date));
      if (from) qs.set("from", resolveDay(from));
      if (to) qs.set("to", resolveDay(to));
      if (limit) qs.set("limit", String(limit));
      return text(await call<XpLogResponse>(app, `/xp-log?${qs}`));
    },
  );

  server.registerTool(
    "get_status",
    {
      description: "Popcorn's level and XP, the streak, streak shields, the reward shop (with whether each is affordable) and pending reward claims.",
      inputSchema: {},
      annotations: readOnly,
    },
    async () => {
      const s = await call<TodayState>(app, `/state?date=${todayKey()}`);
      const { pet } = s.family;
      return text({
        pet: { name: pet.name, level: pet.level, xp: pet.xp, spendableXp: pet.spendableXp },
        streak: s.family.streak,
        streakShields: s.family.streakShields ?? 0,
        rewards: s.rewards.map((r) => ({ title: `${r.emoji} ${r.title}`, cost: r.cost, affordable: pet.spendableXp >= r.cost })),
        pendingClaims: s.pendingClaims.map((c) => ({ reward: c.rewardTitle, cost: c.cost, claimedAt: c.claimedAt })),
      });
    },
  );

  server.registerTool(
    "list_tasks",
    {
      description: "All tasks for a day with ids, XP value and whether they're done (daily, weekly progress, side quests).",
      inputSchema: { date: DATE },
      annotations: readOnly,
    },
    async ({ date }) => {
      const s = await call<TodayState>(app, `/state?date=${resolveDay(date)}`);
      return text({
        date: s.date,
        daily: s.daily.map((d) => ({
          id: d.template.id,
          title: `${d.template.emoji} ${d.template.title}`,
          xp: xpForTask(d.template),
          repeatable: d.template.repeatable,
          done: d.completedToday,
          timesToday: d.amountToday,
        })),
        weekly: s.weekly.map((w) => ({
          id: w.template.id,
          title: `${w.template.emoji} ${w.template.title}`,
          xp: xpForTask(w.template),
          doneThisWeek: w.doneThisWeek,
          target: w.target,
          cumulative: w.template.weeklyTrack === "cumulative",
          doneToday: w.completedToday,
        })),
        sideQuests: s.adhoc.map((a) => ({ id: a.id, title: `${a.emoji} ${a.title}`, done: a.done })),
      });
    },
  );

  server.registerTool(
    "get_history",
    {
      description: "Per day for up to the last 14 days: XP earned, completions (every task and side quest done), and completed/required (distinct daily tasks only).",
      inputSchema: { days: z.number().int().min(1).max(14).optional() },
      annotations: readOnly,
    },
    async ({ days }) => {
      const s = await call<TodayState>(app, `/state?date=${todayKey()}&history=1`);
      return text((s.history ?? []).slice(-(days ?? 7)));
    },
  );

  server.registerTool(
    "complete_task",
    {
      description:
        "Mark a task (or side quest) done and award XP. Repeatable tasks add one more each call. For cumulative weekly tasks pass amount (units for that day).",
      inputSchema: {
        task: z.string().describe("Task id or title (partial titles OK if unique)"),
        date: DATE,
        amount: z.number().int().min(1).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ task, date, amount }) => {
      const day = resolveDay(date);
      const m = findTask(await call<TodayState>(app, `/state?date=${day}`), task);
      if (typeof m === "string") return fail(m);
      let body: CompleteRequest;
      if (m.kind === "adhoc") {
        if (m.adhoc.done) return fail(`"${m.adhoc.title}" is already done.`);
        body = { adhocId: m.adhoc.id, date: day };
      } else if (m.template.weeklyTrack === "cumulative") {
        if (!amount) return fail(`"${m.template.title}" is cumulative; pass amount.`);
        body = { templateId: m.template.id, date: day, amount };
      } else if (m.template.repeatable) {
        body = { templateId: m.template.id, date: day, delta: 1 };
      } else {
        if (m.doneToday) return fail(`"${m.template.title}" is already done for ${day}.`);
        body = { templateId: m.template.id, date: day };
      }
      return completeResult(await call<CompleteResponse>(app, "/complete", { ...body }));
    },
  );

  server.registerTool(
    "undo_task",
    {
      description: "Undo a task completion (removes one for repeatable tasks) and take back its XP.",
      inputSchema: { task: z.string().describe("Task id or title"), date: DATE },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ task, date }) => {
      const day = resolveDay(date);
      const m = findTask(await call<TodayState>(app, `/state?date=${day}`), task);
      if (typeof m === "string") return fail(m);
      let body: CompleteRequest;
      if (m.kind === "adhoc") {
        if (!m.adhoc.done) return fail(`"${m.adhoc.title}" isn't done.`);
        body = { adhocId: m.adhoc.id, date: day };
      } else if (m.template.weeklyTrack === "cumulative") {
        body = { templateId: m.template.id, date: day, amount: 0 };
      } else if (m.template.repeatable) {
        body = { templateId: m.template.id, date: day, delta: -1 };
      } else {
        if (!m.doneToday) return fail(`"${m.template.title}" isn't done for ${day}.`);
        body = { templateId: m.template.id, date: day };
      }
      return completeResult(await call<CompleteResponse>(app, "/complete", { ...body }));
    },
  );

  server.registerTool(
    "add_side_quest",
    {
      description: "Add a one-off side quest for a day (worth 5 XP when completed with complete_task).",
      inputSchema: {
        title: z.string().min(1),
        emoji: z.string().optional(),
        date: DATE,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ title, emoji, date }) =>
      text(await call<AdhocTask>(app, "/adhoc", { title, emoji, date: resolveDay(date) })),
  );

  return server;
}

// Stateless: a fresh server + transport per request (fits Lambda), JSON
// responses instead of SSE (the Function URL is BUFFERED).
export async function handleMcp(req: Request, app: Hono): Promise<Response> {
  const server = buildMcpServer(app);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}
