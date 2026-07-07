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
  XP_PER,
  levelFromXp,
  todayKey,
  weekStartKey,
} from "@popcorn/shared";
import type {
  AdhocRequest,
  AdhocTask,
  ClaimRewardRequest,
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
  putAdhoc,
  putClaim,
  putCompletion,
  putFamily,
  putReward,
  putTemplate,
  updateFamily,
} from "./db.js";
import {
  awardXp,
  buildHistory,
  buildTodayState,
  latestSessionCompletion,
  maybeAwardFullDayBonus,
  priorDate,
  reverseXp,
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

type RawFamily = NonNullable<Awaited<ReturnType<typeof getFamily>>>;

/** Normalize META record for API / XP logic (handles partial/corrupted pet in DynamoDB). */
function toFamilyMeta(rec: RawFamily): FamilyMeta {
  const { PK: _pk, SK: _sk, type: _t, pinHash: _ph, pet: petIn, streak, lastStreakDate, createdAt } =
    rec as RawFamily & Record<string, unknown>;
  const p = (petIn ?? {}) as Partial<PetState>;
  const xp = typeof p.xp === "number" && Number.isFinite(p.xp) ? Math.max(0, p.xp) : 0;
  const pet: PetState = {
    name: typeof p.name === "string" && p.name.trim() ? p.name : "Popcorn",
    xp,
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

// ------- POST /setup -----------------------------------------------------

app.post("/setup", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<SetupRequest>;
  const pin = requireString(body.pin, "pin");
  if (!/^\d{4,6}$/.test(pin)) throw new HttpError(400, "PIN must be 4-6 digits");
  const petName = requireString(body.petName, "petName");
  const pinHash = await bcrypt.hash(pin, 10);
  const family: FamilyMeta = {
    streak: 0,
    pet: {
      name: petName,
      xp: 0,
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
        createdAt: new Date().toISOString(),
      },
      {
        id: newId(),
        title: "Brush teeth (morning + night)",
        emoji: "🪥",
        cadence: "daily",
        weeklyTarget: 1,
        createdAt: new Date().toISOString(),
      },
      {
        id: newId(),
        title: "Practice clarinet",
        emoji: "🎵",
        cadence: "weekly",
        weeklyTarget: 3,
        createdAt: new Date().toISOString(),
      },
      {
        id: newId(),
        title: "Submit RSM math homework",
        emoji: "🧮",
        cadence: "weekly",
        weeklyTarget: 1,
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
    history = buildHistory(templates, byDate, days);
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
    } else {
      const newPet = reverseXp(fam.pet, XP_PER.adhoc);
      await updateFamily({ pet: newPet });
      fam.pet = newPet;
      xpDelta = -XP_PER.adhoc;
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
        }
      } else if (existing) {
        await deleteCompletion(tpl.id, date);
        const newPet = reverseXp(fam.pet, xp);
        await updateFamily({ pet: newPet });
        fam.pet = newPet;
        xpDelta = -xp;
      }
    } else if (tpl.cadence === "weekly") {
      // Weekly sessions: explicit +/- counter. Each +1 adds a check to today
      // (multiple per day allowed, no target cap) and awards XP; each -1
      // removes a check from today if any, else the most recent day, and
      // refunds XP. Nothing to remove = no-op.
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
      } else if (delta < 0) {
        const week = weekStartKey(new Date(date));
        const weekEnd = endOfWeek(week);
        const weekRows = (await listCompletions("SINGLETON", week, weekEnd)).filter(
          (c) => c.templateId === tpl.id,
        );
        const todayRow = weekRows.find((c) => c.date === date && (c.amount ?? 1) > 0);
        const target = todayRow ?? latestSessionCompletion(weekRows, tpl.id);
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
          const newPet = reverseXp(fam.pet, xp);
          await updateFamily({ pet: newPet });
          fam.pet = newPet;
          xpDelta = -xp;
        }
      }
    } else {
      // Daily: check/uncheck toggle for today.
      if (existing) {
        await deleteCompletion(tpl.id, date);
        const newPet = reverseXp(fam.pet, xp);
        await updateFamily({ pet: newPet });
        fam.pet = newPet;
        xpDelta = -xp;
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
      lastStreakDate: bonusResult.family.lastStreakDate,
    });
    state = await loadState(date, false);
    xpDelta += bonusResult.bonus;
    if (bonusResult.family.pet.level > fam.pet.level) leveledUp = true;
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
  const pin = requireString(body.pin, "pin");
  if (!(await checkPin(pin))) throw new HttpError(403, "Wrong PIN");
  const cadence = body.cadence === "weekly" ? "weekly" : "daily";
  const weeklyTrack = cadence === "weekly" && body.weeklyTrack === "cumulative" ? "cumulative" as const : undefined;
  const maxTarget = weeklyTrack === "cumulative" ? 99999 : 7;
  const t: TaskTemplate = {
    id: newId(),
    title: requireString(body.title, "title"),
    emoji: body.emoji || (cadence === "weekly" ? "📅" : "✅"),
    cadence,
    weeklyTarget: cadence === "weekly" ? Math.max(1, Math.min(maxTarget, body.weeklyTarget ?? 1)) : 1,
    weeklyTrack,
    createdAt: new Date().toISOString(),
  };
  await putTemplate(t);
  return c.json(t);
});

app.patch("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Partial<UpdateTemplateRequest>;
  const pin = requireString(body.pin, "pin");
  if (!(await checkPin(pin))) throw new HttpError(403, "Wrong PIN");
  const templates = await listTemplates();
  const existing = templates.find((t) => t.id === id);
  if (!existing) throw new HttpError(404, "Template not found");
  const updated: TaskTemplate = {
    ...existing,
    title: body.title?.trim() || existing.title,
    emoji: body.emoji || existing.emoji,
    cadence: body.cadence ?? existing.cadence,
    weeklyTrack:
      (body.cadence ?? existing.cadence) === "weekly"
        ? (body.weeklyTrack ?? existing.weeklyTrack) === "cumulative" ? "cumulative" : undefined
        : undefined,
    weeklyTarget:
      body.cadence === "weekly" || (body.cadence === undefined && existing.cadence === "weekly")
        ? Math.max(1, Math.min(
            ((body.weeklyTrack ?? existing.weeklyTrack) === "cumulative" ? 99999 : 7),
            body.weeklyTarget ?? existing.weeklyTarget,
          ))
        : 1,
  };
  await putTemplate(updated);
  return c.json(updated);
});

app.delete("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Partial<DeleteTemplateRequest>;
  const pin = requireString(body.pin, "pin");
  if (!(await checkPin(pin))) throw new HttpError(403, "Wrong PIN");
  await deleteTemplate(id);
  return c.json({ ok: true });
});

// ------- /rewards --------------------------------------------------------

app.post("/rewards", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateRewardRequest>;
  const pin = requireString(body.pin, "pin");
  if (!(await checkPin(pin))) throw new HttpError(403, "Wrong PIN");
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
  const body = (await c.req.json().catch(() => ({}))) as Partial<DeleteRewardRequest>;
  const pin = requireString(body.pin, "pin");
  if (!(await checkPin(pin))) throw new HttpError(403, "Wrong PIN");
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
  if (fam.pet.xp < reward.cost) {
    throw new HttpError(400, `Not enough XP. Need ${reward.cost}, have ${fam.pet.xp}.`);
  }
  const newPet = reverseXp(fam.pet, reward.cost);
  await updateFamily({ pet: newPet });
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
  const pin = requireString(body.pin, "pin");
  if (!(await checkPin(pin))) throw new HttpError(403, "Wrong PIN");

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
      const r = awardXp(fam.pet, claim.cost);
      await updateFamily({ pet: r.pet });
    }
  }
  return c.json({ ok: true });
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
