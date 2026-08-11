// =============================================================================
// Hono router for Popcorn Quest API.
//
// Used by both the Lambda handler and the local dev server.
// =============================================================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import bcrypt from "bcryptjs";
import {
  COSMETICS,
  STREAK_SHIELD,
  XP_PER,
  levelFromXp,
  todayKey,
  weekStartKey,
} from "@popcorn/shared";
import type {
  AdhocRequest,
  AdhocTask,
  BuyShieldResponse,
  ClaimRewardRequest,
  EquipRequest,
  EquipResponse,
  Completion,
  CompleteRequest,
  CompleteResponse,
  CreateRewardRequest,
  CreateTemplateRequest,
  DailyHistoryEntry,
  DeleteRewardRequest,
  DeleteTemplateRequest,
  FamilyMeta,
  PetState,
  ResolveClaimRequest,
  Reward,
  RewardClaim,
  SetupRequest,
  SetupResponse,
  TaskTemplate,
  TodayState,
  UpdateTemplateRequest,
  WeatherToday,
  CalendarEventsResponse,
  XpLogEntry,
  XpLogResponse,
} from "@popcorn/shared";
import {
  deleteCompletion,
  deleteReward,
  deleteTemplate,
  getAdhoc,
  getCompletion,
  getFamily,
  getReward,
  listAdhoc,
  listClaims,
  listCompletions,
  listRewards,
  listTemplates,
  listXpLog,
  listXpLogSince,
  putAdhoc,
  putClaim,
  putCompletion,
  putFamily,
  putReward,
  putTemplate,
  putXpLog,
  updateFamily,
} from "./db.js";
import {
  awardXp,
  buildHistory,
  buildTodayState,
  latestSessionCompletion,
  maybeAwardFullDayBonus,
  priorDate,
  refundXp,
  reverseEarn,
  spendXp,
  xpForTask,
} from "./engine.js";
import { fetchWeatherToday } from "./weather.js";
import { getCalendarEventsCached } from "./calendar.js";

const app = new Hono();

// ------- weather (OpenWeather via env; short-lived Lambda memory cache) ----

let weatherMemCache: { expires: number; body: WeatherToday } | null = null;
const WEATHER_CACHE_MS = 10 * 60 * 1000;

const EMPTY_WEATHER: WeatherToday = {
  currentTempF: null,
  minTempF: null,
  maxTempF: null,
  rainPopPercent: null,
  condition: null,
};
app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

// ------- helpers ---------------------------------------------------------

function newId(): string {
  // 12 chars, url-safe enough for an internal ID.
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-6);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalXp(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const xp = Number(value);
  if (!Number.isInteger(xp) || xp < 1 || xp > 1_000) {
    throw new HttpError(400, "xp must be a whole number between 1 and 1000");
  }
  return xp;
}

// Record an XP change so parents can audit how XP was earned/spent. `balance`
// is the pet's XP after the change. Best-effort: never let logging failures
// break the mutation that triggered them.
async function logXp(
  amount: number,
  reason: string,
  balance?: number,
  date: string = todayKey(),
): Promise<void> {
  if (amount === 0) return;
  const entry: XpLogEntry = {
    id: newId(),
    at: new Date().toISOString(),
    amount,
    reason,
    balance,
    date,
  };
  try {
    await putXpLog(entry);
  } catch (e) {
    console.error("xp-log write failed:", e);
  }
}

type RawFamily = NonNullable<Awaited<ReturnType<typeof getFamily>>>;

/** Normalize META record for API / XP logic (handles partial/corrupted pet in DynamoDB). */
function toFamilyMeta(rec: RawFamily): FamilyMeta {
  const { PK: _pk, SK: _sk, type: _t, pinHash: _ph, pet: petIn, streak, lastStreakDate, streakShields, createdAt } =
    rec as RawFamily & Record<string, unknown>;
  const p = (petIn ?? {}) as Partial<PetState>;
  const xp = typeof p.xp === "number" && Number.isFinite(p.xp) ? Math.max(0, p.xp) : 0;
  // Missing spendableXp (pre-split records) normalizes to 0: lifetime xp is
  // preserved as "total earned" while the wallet resets to empty.
  const spendableXp =
    typeof p.spendableXp === "number" && Number.isFinite(p.spendableXp) ? Math.max(0, p.spendableXp) : 0;
  const pet: PetState = {
    name: typeof p.name === "string" && p.name.trim() ? p.name : "Popcorn",
    xp,
    spendableXp,
    level:
      typeof p.level === "number" && p.level >= 1 ? p.level : levelFromXp(xp).level,
    unlocked:
      Array.isArray(p.unlocked) && p.unlocked.length > 0 ? p.unlocked : ["collar-red", "scene-yard"],
    equipped:
      p.equipped && typeof p.equipped === "object" && Object.keys(p.equipped).length > 0
        ? p.equipped
        : { collar: "collar-red", scene: "scene-yard" },
    lastMood: p.lastMood,
  };
  return {
    streak: typeof streak === "number" ? streak : 0,
    lastStreakDate: typeof lastStreakDate === "string" ? lastStreakDate : undefined,
    streakShields:
      typeof streakShields === "number" && streakShields >= 0
        ? Math.min(STREAK_SHIELD.max, Math.floor(streakShields))
        : 0,
    createdAt: typeof createdAt === "string" ? createdAt : new Date().toISOString(),
    pet,
  };
}

async function checkPin(pin: string): Promise<boolean> {
  if (!pin) return false;
  const fam = await getFamily();
  if (!fam) return false;
  return bcrypt.compare(pin, fam.pinHash);
}

function requireString(v: unknown, name: string): string {
  if (typeof v !== "string" || !v.trim()) {
    throw new HttpError(400, `Missing or invalid '${name}'`);
  }
  return v.trim();
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
  console.error("api error:", err);
  return c.json({ error: "Internal error" }, 500);
});

// ------- /health ---------------------------------------------------------

app.get("/health", (c) => c.json({ ok: true, time: new Date().toISOString() }));

app.get("/weather", async (c) => {
  const apiKey = (process.env.OPENWEATHER_API_KEY ?? "").trim();
  const zip = (process.env.WEATHER_ZIP ?? "02474,US").trim();
  if (!apiKey) return c.json(EMPTY_WEATHER);

  const now = Date.now();
  if (weatherMemCache && weatherMemCache.expires > now) {
    return c.json(weatherMemCache.body);
  }
  try {
    const body = await fetchWeatherToday(apiKey, zip);
    if (body.currentTempF !== null) {
      weatherMemCache = { expires: now + WEATHER_CACHE_MS, body };
    }
    return c.json(body);
  } catch (e) {
    console.error("weather fetch:", e);
    return c.json(EMPTY_WEATHER);
  }
});

app.get("/calendar-events", async (c) => {
  try {
    const body = await getCalendarEventsCached();
    return c.json(body satisfies CalendarEventsResponse);
  } catch (e) {
    console.error("calendar-events:", e);
    return c.json({ events: [], errors: ["Internal error"] } satisfies CalendarEventsResponse, 500);
  }
});

app.get("/cosmetics", (c) => c.json({ cosmetics: COSMETICS }));

// ------- GET /xp-log (parent audit) --------------------------------------

app.get("/xp-log", async (c) => {
  const raw = Number(c.req.query("limit"));
  const limit = Number.isFinite(raw) ? Math.max(1, Math.min(1000, Math.floor(raw))) : 200;
  const entries = await listXpLog(limit);
  return c.json({ entries } satisfies XpLogResponse);
});

// ------- POST /setup -----------------------------------------------------

app.post("/setup", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<SetupRequest>;
  const pin = requireString(body.pin, "pin");
  if (!/^\d{4,6}$/.test(pin)) throw new HttpError(400, "PIN must be 4-6 digits");
  const petName = requireString(body.petName, "petName");
  const pinHash = await bcrypt.hash(pin, 10);
  const family: FamilyMeta = {
    streak: 0,
    streakShields: 0,
    pet: {
      name: petName,
      xp: 0,
      spendableXp: 0,
      level: 1,
      unlocked: ["collar-red", "scene-yard"],
      equipped: { collar: "collar-red", scene: "scene-yard" },
    },
    createdAt: new Date().toISOString(),
  };
  await putFamily(family, pinHash);

  if (body.seedExamples) {
    const seeds: TaskTemplate[] = [
      {
        id: newId(),
        title: "Give Popcorn her medicine",
        emoji: "💊",
        cadence: "daily",
        weeklyTarget: 1,
        repeatable: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: newId(),
        title: "Brush teeth (morning + night)",
        emoji: "🪥",
        cadence: "daily",
        weeklyTarget: 1,
        repeatable: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: newId(),
        title: "1 piece of paper of math (Beast Academy, Kangaroo), 100% correct",
        emoji: "📚",
        cadence: "daily",
        weeklyTarget: 1,
        repeatable: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: newId(),
        title: "Easy social interaction",
        emoji: "👋",
        cadence: "daily",
        weeklyTarget: 1,
        repeatable: false,
        description:
          'Do one small social thing that feels a little uncomfortable. Try: greet a friend by name ("Hey, Alex"), initiate a high-five at frisbee, or ask one simple question.',
        xp: 5,
        createdAt: new Date().toISOString(),
      },
      {
        id: newId(),
        title: "Hard social interaction",
        emoji: "💪",
        cadence: "daily",
        weeklyTarget: 1,
        repeatable: false,
        description:
          "Do one small social thing that feels a little uncomfortable. Try: greet a familiar adult by name, say something to a familiar adult without Dad/Mom prompting, or greet a non-friend kid by name (like a teammate or fellow camper).",
        xp: 20,
        createdAt: new Date().toISOString(),
      },
      {
        id: newId(),
        title: "Practice clarinet",
        emoji: "🎵",
        cadence: "weekly",
        weeklyTarget: 3,
        repeatable: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: newId(),
        title: "Refill Popcorn's medicine (Sunday)",
        emoji: "🗓️",
        cadence: "weekly",
        weeklyTarget: 1,
        repeatable: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: newId(),
        title: "Submit RSM math homework",
        emoji: "🧮",
        cadence: "weekly",
        weeklyTarget: 1,
        repeatable: true,
        createdAt: new Date().toISOString(),
      },
    ];
    for (const t of seeds) await putTemplate(t);
  }

  const resp: SetupResponse = { family };
  return c.json(resp);
});

// ------- GET /state ------------------------------------------------------

app.get("/state", async (c) => {
  const date = c.req.query("date") || todayKey();
  const includeHistory = c.req.query("history") === "1";
  const state = await loadState(date, includeHistory);
  return c.json(state satisfies TodayState);
});

async function loadState(
  date: string,
  includeHistory: boolean,
): Promise<TodayState> {
  const rawFam = await getFamily();
  if (!rawFam) throw new HttpError(404, "Family not found");
  const fam = toFamilyMeta(rawFam);
  const week = weekStartKey(new Date(date));
  const weekEnd = endOfWeek(week);

  // For history we need a wider completion range (last 14 days).
  const HISTORY_DAYS = 14;
  const histStart = includeHistory ? priorDate(date, HISTORY_DAYS - 1) : week;
  const histEnd = weekEnd;

  const [templates, completionsAll, adhoc, rewards, claims] = await Promise.all([
    listTemplates(),
    listCompletions("SINGLETON", histStart, histEnd),
    listAdhoc(date),
    listRewards(),
    listClaims("pending"),
  ]);

  // Filter completions to this week for buildTodayState's progress calc.
  const thisWeek = completionsAll.filter((c) => c.date >= week && c.date <= weekEnd);

  let history: DailyHistoryEntry[] | undefined;
  if (includeHistory) {
    const days: string[] = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i--) days.push(priorDate(date, i));
    const byDate = new Map<string, Completion[]>();
    for (const c of completionsAll) {
      const arr = byDate.get(c.date) ?? [];
      arr.push(c);
      byDate.set(c.date, arr);
    }

    // XP earned per day, from the audit log. Fetch from a day before the window
    // (log `at` is UTC; entries carry a local `date` we bucket by). Only count
    // earns: positive amounts that aren't reward refunds.
    const sinceIso = `${priorDate(days[0], 1)}T00:00:00.000Z`;
    const logs = await listXpLogSince(sinceIso);
    const xpByDate = new Map<string, number>();
    for (const e of logs) {
      if (e.amount <= 0 || e.reason.startsWith("Refund")) continue;
      const d = e.date ?? e.at.slice(0, 10);
      xpByDate.set(d, (xpByDate.get(d) ?? 0) + e.amount);
    }

    history = buildHistory(templates, byDate, days, xpByDate);
  }

  return buildTodayState(
    fam,
    templates,
    thisWeek,
    adhoc,
    rewards,
    claims,
    history,
    date,
  );
}

function endOfWeek(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const date = new Date(y, m - 1, d + 6);
  return todayKey(date);
}

// ------- POST /complete --------------------------------------------------

app.post("/complete", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<CompleteRequest>;
  const date = body.date || todayKey();

  const rawFam = await getFamily();
  if (!rawFam) throw new HttpError(404, "Family not found");
  let fam = toFamilyMeta(rawFam);

  let xpDelta = 0;
  let leveledUp = false;
  let unlocked: string | undefined;

  // Branch: ad-hoc vs template completion.
  if (body.adhocId) {
    const adhoc = await getAdhoc(date, body.adhocId);
    if (!adhoc) throw new HttpError(404, "Ad-hoc task not found");
    const wasDone = adhoc.done;
    await putAdhoc({ ...adhoc, done: !wasDone });
    if (!wasDone) {
      const r = awardXp(fam.pet, XP_PER.adhoc);
      await updateFamily({ pet: r.pet });
      fam.pet = r.pet;
      xpDelta = r.xpDelta;
      leveledUp = r.leveledUp;
      unlocked = r.unlocked;
      await logXp(r.xpDelta, `Side quest: ${adhoc.title}`, fam.pet.spendableXp, date);
    } else {
      const newPet = reverseEarn(fam.pet, XP_PER.adhoc);
      await updateFamily({ pet: newPet });
      fam.pet = newPet;
      xpDelta = -XP_PER.adhoc;
      await logXp(-XP_PER.adhoc, `Undid side quest: ${adhoc.title}`, fam.pet.spendableXp, date);
    }
  } else if (body.templateId) {
    const templates = await listTemplates();
    const tpl = templates.find((t) => t.id === body.templateId);
    if (!tpl) throw new HttpError(404, "Template not found");
    const existing = await getCompletion(tpl.id, date);
    const xp = xpForTask(tpl);

    if (tpl.weeklyTrack === "cumulative") {
      // Cumulative: set amount for this day (0 or missing = remove).
      const amount = Math.max(0, Math.floor(Number(body.amount) || 0));
      if (amount > 0) {
        const isNew = !existing;
        const week = weekStartKey(new Date(date));
        const weekEnd = endOfWeek(week);
        const weekRows = (await listCompletions("SINGLETON", week, weekEnd)).filter(
          (c) => c.templateId === tpl.id,
        );
        let otherSum = 0;
        for (const c of weekRows) {
          if (c.date === date) continue;
          otherSum += c.amount ?? 1;
        }
        const oldTodayContrib = existing ? (existing.amount ?? 1) : 0;
        const oldTotal = otherSum + oldTodayContrib;
        const newTotal = otherSum + amount;
        const crossesTarget =
          tpl.weeklyTarget > 0 &&
          oldTotal < tpl.weeklyTarget &&
          newTotal >= tpl.weeklyTarget;
        const shouldAwardXp = (isNew && amount > 0) || crossesTarget;

        await putCompletion({
          templateId: tpl.id,
          date,
          completedAt: existing?.completedAt ?? new Date().toISOString(),
          amount,
        });
        if (shouldAwardXp) {
          const r = awardXp(fam.pet, xp);
          await updateFamily({ pet: r.pet });
          fam.pet = r.pet;
          xpDelta = r.xpDelta;
          leveledUp = r.leveledUp;
          unlocked = r.unlocked;
          await logXp(r.xpDelta, `Completed: ${tpl.title}`, fam.pet.spendableXp, date);
        }
      } else if (existing) {
        await deleteCompletion(tpl.id, date);
        const newPet = reverseEarn(fam.pet, xp);
        await updateFamily({ pet: newPet });
        fam.pet = newPet;
        xpDelta = -xp;
        await logXp(-xp, `Undid: ${tpl.title}`, fam.pet.spendableXp, date);
      }
    } else if (tpl.repeatable) {
      // Repeatable +/- counter (daily "extra pages" and weekly "N times/week").
      // Each +1 adds a check to today (multiple per day allowed, no cap) and
      // awards XP; each -1 removes a check and refunds XP. For weekly, undo
      // walks back to the most recent day if today has none; daily undo is
      // scoped to today. Nothing to remove = no-op.
      const delta = Number(body.delta) || 0;
      if (delta > 0) {
        const oldAmount = existing ? (existing.amount ?? 1) : 0;
        await putCompletion({
          templateId: tpl.id,
          date,
          completedAt: existing?.completedAt ?? new Date().toISOString(),
          amount: oldAmount + 1,
        });
        const r = awardXp(fam.pet, xp);
        await updateFamily({ pet: r.pet });
        fam.pet = r.pet;
        xpDelta = r.xpDelta;
        leveledUp = r.leveledUp;
        unlocked = r.unlocked;
        await logXp(r.xpDelta, `Completed: ${tpl.title}`, fam.pet.spendableXp, date);
      } else if (delta < 0) {
        let target = existing && (existing.amount ?? 1) > 0 ? existing : undefined;
        if (!target && tpl.cadence === "weekly") {
          const week = weekStartKey(new Date(date));
          const weekEnd = endOfWeek(week);
          const weekRows = (await listCompletions("SINGLETON", week, weekEnd)).filter(
            (cc) => cc.templateId === tpl.id,
          );
          target = latestSessionCompletion(weekRows, tpl.id);
        }
        if (target) {
          const cur = target.amount ?? 1;
          if (cur <= 1) {
            await deleteCompletion(tpl.id, target.date);
          } else {
            await putCompletion({
              templateId: tpl.id,
              date: target.date,
              completedAt: target.completedAt,
              amount: cur - 1,
            });
          }
          const newPet = reverseEarn(fam.pet, xp);
          await updateFamily({ pet: newPet });
          fam.pet = newPet;
          xpDelta = -xp;
          await logXp(-xp, `Undid: ${tpl.title}`, fam.pet.spendableXp, date);
        }
      }
    } else {
      // Single check/uncheck toggle for today (daily-once and weekly-once).
      if (existing) {
        await deleteCompletion(tpl.id, date);
        const newPet = reverseEarn(fam.pet, xp);
        await updateFamily({ pet: newPet });
        fam.pet = newPet;
        xpDelta = -xp;
        await logXp(-xp, `Undid: ${tpl.title}`, fam.pet.spendableXp, date);
      } else {
        await putCompletion({
          templateId: tpl.id,
          date,
          completedAt: new Date().toISOString(),
        });
        const r = awardXp(fam.pet, xp);
        await updateFamily({ pet: r.pet });
        fam.pet = r.pet;
        xpDelta = r.xpDelta;
        leveledUp = r.leveledUp;
        unlocked = r.unlocked;
        await logXp(r.xpDelta, `Completed: ${tpl.title}`, fam.pet.spendableXp, date);
      }
    }
  } else {
    throw new HttpError(400, "Provide either templateId or adhocId");
  }

  // Re-load state and check full-day bonus.
  let state = await loadState(date, false);
  const bonusResult = maybeAwardFullDayBonus(state.family, state, date);
  if (bonusResult.bonus > 0) {
    await updateFamily({
      pet: bonusResult.family.pet,
      streak: bonusResult.family.streak,
      streakShields: bonusResult.family.streakShields ?? 0,
      lastStreakDate: bonusResult.family.lastStreakDate,
    });
    state = await loadState(date, false);
    xpDelta += bonusResult.bonus;
    if (bonusResult.family.pet.level > fam.pet.level) leveledUp = true;
    await logXp(bonusResult.bonus, "All daily tasks done (bonus)", bonusResult.family.pet.spendableXp, date);
  }

  const resp: CompleteResponse = { state, xpDelta, leveledUp, unlocked };
  return c.json(resp);
});

// ------- POST /adhoc -----------------------------------------------------

app.post("/adhoc", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<AdhocRequest>;
  const title = requireString(body.title, "title");
  const emoji = body.emoji || "✨";
  const date = body.date || todayKey();
  const a: AdhocTask = {
    id: newId(),
    title,
    emoji,
    createdAt: new Date().toISOString(),
    date,
    done: false,
  };
  await putAdhoc(a);
  return c.json(a);
});

// ------- /templates ------------------------------------------------------

app.post("/templates", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateTemplateRequest>;
  const cadence = body.cadence === "weekly" ? "weekly" : "daily";
  const repeatable = body.repeatable === true;
  // A cumulative track is inherently repeatable; a non-repeatable weekly is a
  // single once-per-week check (target forced to 1, sessions track).
  const weeklyTrack =
    cadence === "weekly" && repeatable && body.weeklyTrack === "cumulative"
      ? ("cumulative" as const)
      : undefined;
  const maxTarget = weeklyTrack === "cumulative" ? 99999 : 7;
  const weeklyTarget =
    cadence === "weekly"
      ? repeatable
        ? Math.max(1, Math.min(maxTarget, body.weeklyTarget ?? 1))
        : 1
      : 1;
  const t: TaskTemplate = {
    id: newId(),
    title: requireString(body.title, "title"),
    emoji: body.emoji || (cadence === "weekly" ? "📅" : "✅"),
    description: optionalText(body.description),
    xp: optionalXp(body.xp),
    cadence,
    weeklyTarget,
    weeklyTrack,
    repeatable,
    createdAt: new Date().toISOString(),
  };
  await putTemplate(t);
  return c.json(t);
});

app.patch("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Partial<UpdateTemplateRequest>;
  const templates = await listTemplates();
  const existing = templates.find((t) => t.id === id);
  if (!existing) throw new HttpError(404, "Template not found");
  const cadence = body.cadence ?? existing.cadence;
  const repeatable = body.repeatable ?? existing.repeatable;
  const isCumulative =
    cadence === "weekly" &&
    repeatable &&
    (body.weeklyTrack ?? existing.weeklyTrack) === "cumulative";
  const updated: TaskTemplate = {
    ...existing,
    title: body.title?.trim() || existing.title,
    emoji: body.emoji || existing.emoji,
    description: body.description === undefined ? existing.description : optionalText(body.description),
    xp: body.xp === undefined ? existing.xp : optionalXp(body.xp),
    cadence,
    repeatable,
    weeklyTrack: isCumulative ? "cumulative" : undefined,
    weeklyTarget:
      cadence === "weekly" && repeatable
        ? Math.max(1, Math.min(isCumulative ? 99999 : 7, body.weeklyTarget ?? existing.weeklyTarget))
        : 1,
  };
  await putTemplate(updated);
  return c.json(updated);
});

app.delete("/templates/:id", async (c) => {
  const id = c.req.param("id");
  await deleteTemplate(id);
  return c.json({ ok: true });
});

// ------- /rewards --------------------------------------------------------

app.post("/rewards", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateRewardRequest>;
  const cost = Math.max(1, Math.min(10000, Number(body.cost) || 50));
  const r: Reward = {
    id: newId(),
    title: requireString(body.title, "title"),
    emoji: body.emoji || "🎁",
    cost,
    createdAt: new Date().toISOString(),
  };
  await putReward(r);
  return c.json(r);
});

app.delete("/rewards/:id", async (c) => {
  const id = c.req.param("id");
  await deleteReward(id);
  return c.json({ ok: true });
});

// Kid taps a reward to claim it. Spends pet.xp immediately (so they can't
// double-claim). Goes "pending" until parent approves with PIN; deny = refund.
app.post("/claims", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<ClaimRewardRequest>;
  const rewardId = requireString(body.rewardId, "rewardId");
  const rawFam = await getFamily();
  if (!rawFam) throw new HttpError(404, "Family not found");
  const fam = toFamilyMeta(rawFam);
  const reward = await getReward(rewardId);
  if (!reward) throw new HttpError(404, "Reward not found");
  if (fam.pet.spendableXp < reward.cost) {
    throw new HttpError(400, `Not enough XP. Need ${reward.cost}, have ${fam.pet.spendableXp}.`);
  }
  const newPet = spendXp(fam.pet, reward.cost);
  await updateFamily({ pet: newPet });
  await logXp(-reward.cost, `Reward claimed: ${reward.title}`, newPet.spendableXp);
  const claim: RewardClaim = {
    id: newId(),
    rewardId: reward.id,
    rewardTitle: reward.title,
    rewardEmoji: reward.emoji,
    cost: reward.cost,
    status: "pending",
    claimedAt: new Date().toISOString(),
  };
  await putClaim(claim);
  return c.json(claim);
});

// Parent approves or denies a pending claim. Approve = nothing (XP already
// spent). Deny = refund XP via awardXp (re-applies level/cosmetic logic).
app.post("/claims/:id/resolve", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Partial<ResolveClaimRequest>;

  const claims = await listClaims();
  const claim = claims.find((cl) => cl.id === id);
  if (!claim) throw new HttpError(404, "Claim not found");
  if (claim.status !== "pending") throw new HttpError(400, "Claim already resolved");

  await putClaim({
    ...claim,
    status: body.approve ? "approved" : "denied",
    resolvedAt: new Date().toISOString(),
  });

  if (!body.approve) {
    const rawFam = await getFamily();
    if (rawFam) {
      const fam = toFamilyMeta(rawFam);
      const newPet = refundXp(fam.pet, claim.cost);
      await updateFamily({ pet: newPet });
      await logXp(claim.cost, `Refund (denied): ${claim.rewardTitle}`, newPet.spendableXp);
    }
  }
  return c.json({ ok: true });
});

// ------- POST /equip (kid-facing wardrobe, no PIN) ------------------------

app.post("/equip", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<EquipRequest>;
  const slot = body.slot;
  if (slot !== "collar" && slot !== "hat" && slot !== "scene" && slot !== "treat") {
    throw new HttpError(400, "Invalid slot");
  }
  const rawFam = await getFamily();
  if (!rawFam) throw new HttpError(404, "Family not found");
  const fam = toFamilyMeta(rawFam);

  const equipped = { ...fam.pet.equipped };
  if (body.cosmeticId == null || body.cosmeticId === "") {
    delete equipped[slot];
  } else {
    const cosmetic = COSMETICS.find((cm) => cm.id === body.cosmeticId);
    if (!cosmetic || cosmetic.slot !== slot) throw new HttpError(400, "Invalid cosmetic");
    const unlockedByLevel = cosmetic.unlocksAtLevel <= levelFromXp(fam.pet.xp).level;
    if (!fam.pet.unlocked.includes(cosmetic.id) && !unlockedByLevel) {
      throw new HttpError(403, "Cosmetic not unlocked yet");
    }
    equipped[slot] = cosmetic.id;
  }
  const pet: PetState = { ...fam.pet, equipped };
  await updateFamily({ pet });
  const resp: EquipResponse = { pet };
  return c.json(resp);
});

// ------- POST /streak-shield/buy (kid-facing, spends XP) ------------------

app.post("/streak-shield/buy", async (c) => {
  const rawFam = await getFamily();
  if (!rawFam) throw new HttpError(404, "Family not found");
  const fam = toFamilyMeta(rawFam);
  const shields = fam.streakShields ?? 0;
  if (shields >= STREAK_SHIELD.max) {
    throw new HttpError(400, `You can only hold ${STREAK_SHIELD.max} shields`);
  }
  if (fam.pet.spendableXp < STREAK_SHIELD.cost) {
    throw new HttpError(400, `Not enough XP. Need ${STREAK_SHIELD.cost}, have ${fam.pet.spendableXp}.`);
  }
  const pet = spendXp(fam.pet, STREAK_SHIELD.cost);
  await updateFamily({ pet, streakShields: shields + 1 });
  await logXp(-STREAK_SHIELD.cost, "Bought streak shield", pet.spendableXp);
  const resp: BuyShieldResponse = {
    family: { ...fam, pet, streakShields: shields + 1 },
  };
  return c.json(resp);
});

// ------- POST /verify-pin (used by parent panel gate) --------------------

app.post("/verify-pin", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { pin?: string };
  const pin = requireString(body.pin, "pin");
  const ok = await checkPin(pin);
  if (!ok) throw new HttpError(403, "Wrong PIN");
  return c.json({ ok: true });
});

export default app;
