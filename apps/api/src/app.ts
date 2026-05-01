// =============================================================================
// Hono router for Popcorn's Chore Quest API.
//
// Used by both the Lambda handler and the local dev server.
// =============================================================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import bcrypt from "bcryptjs";
import {
  COSMETICS,
  type AdhocRequest,
  type AdhocTask,
  type ClaimRewardRequest,
  type Completion,
  type CompleteRequest,
  type CompleteResponse,
  type CreateRewardRequest,
  type CreateTemplateRequest,
  type DailyHistoryEntry,
  type DeleteRewardRequest,
  type DeleteTemplateRequest,
  type FamilyMeta,
  type ResolveClaimRequest,
  type Reward,
  type RewardClaim,
  type SetupRequest,
  type SetupResponse,
  type TaskTemplate,
  type TodayState,
  type UpdateTemplateRequest,
  todayKey,
  weekStartKey,
  XP_PER,
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
  maybeAwardFullDayBonus,
  priorDate,
  reverseXp,
  xpForTask,
} from "./engine.js";

const app = new Hono();
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

async function checkPin(familyId: string, pin: string): Promise<boolean> {
  if (!pin) return false;
  const fam = await getFamily(familyId);
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

app.get("/cosmetics", (c) => c.json({ cosmetics: COSMETICS }));

// ------- POST /setup -----------------------------------------------------

app.post("/setup", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<SetupRequest>;
  const pin = requireString(body.pin, "pin");
  if (!/^\d{4,6}$/.test(pin)) throw new HttpError(400, "PIN must be 4-6 digits");
  const petName = requireString(body.petName, "petName");
  const familyId = newId();
  const pinHash = await bcrypt.hash(pin, 10);
  const family: FamilyMeta = {
    familyId,
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
    for (const t of seeds) await putTemplate(familyId, t);
  }

  const resp: SetupResponse = { familyId, family };
  return c.json(resp);
});

// ------- GET /state ------------------------------------------------------

app.get("/state", async (c) => {
  const familyId = requireString(c.req.query("familyId"), "familyId");
  const date = c.req.query("date") || todayKey();
  const includeHistory = c.req.query("history") === "1";
  const state = await loadState(familyId, date, includeHistory);
  return c.json(state satisfies TodayState);
});

async function loadState(
  familyId: string,
  date: string,
  includeHistory: boolean,
): Promise<TodayState> {
  const fam = await getFamily(familyId);
  if (!fam) throw new HttpError(404, "Family not found");
  const week = weekStartKey(new Date(date));
  const weekEnd = endOfWeek(week);

  // For history we need a wider completion range (last 14 days).
  const HISTORY_DAYS = 14;
  const histStart = includeHistory ? priorDate(date, HISTORY_DAYS - 1) : week;
  const histEnd = weekEnd;

  const [templates, completionsAll, adhoc, rewards, claims] = await Promise.all([
    listTemplates(familyId),
    listCompletions(familyId, histStart, histEnd),
    listAdhoc(familyId, date),
    listRewards(familyId),
    listClaims(familyId, "pending"),
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
    stripPinHash(fam),
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
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return todayKey(d);
}

function stripPinHash(rec: FamilyMeta & { pinHash?: string }): FamilyMeta {
  const { pinHash, ...rest } = rec as FamilyMeta & { pinHash?: string };
  return rest as FamilyMeta;
}

// ------- POST /complete --------------------------------------------------

app.post("/complete", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<CompleteRequest>;
  const familyId = requireString(body.familyId, "familyId");
  const date = body.date || todayKey();

  const fam = await getFamily(familyId);
  if (!fam) throw new HttpError(404, "Family not found");

  let xpDelta = 0;
  let leveledUp = false;
  let unlocked: string | undefined;

  // Branch: ad-hoc vs template completion.
  if (body.adhocId) {
    const adhoc = await getAdhoc(familyId, date, body.adhocId);
    if (!adhoc) throw new HttpError(404, "Ad-hoc task not found");
    const wasDone = adhoc.done;
    await putAdhoc(familyId, { ...adhoc, done: !wasDone });
    if (!wasDone) {
      const r = awardXp(fam.pet, XP_PER.adhoc);
      await updateFamily(familyId, { pet: r.pet });
      fam.pet = r.pet;
      xpDelta = r.xpDelta;
      leveledUp = r.leveledUp;
      unlocked = r.unlocked;
    } else {
      const newPet = reverseXp(fam.pet, XP_PER.adhoc);
      await updateFamily(familyId, { pet: newPet });
      fam.pet = newPet;
      xpDelta = -XP_PER.adhoc;
    }
  } else if (body.templateId) {
    const templates = await listTemplates(familyId);
    const tpl = templates.find((t) => t.id === body.templateId);
    if (!tpl) throw new HttpError(404, "Template not found");
    const existing = await getCompletion(familyId, tpl.id, date);
    const xp = xpForTask(tpl);
    if (existing) {
      await deleteCompletion(familyId, tpl.id, date);
      const newPet = reverseXp(fam.pet, xp);
      await updateFamily(familyId, { pet: newPet });
      fam.pet = newPet;
      xpDelta = -xp;
    } else {
      await putCompletion(familyId, {
        templateId: tpl.id,
        date,
        completedAt: new Date().toISOString(),
      });
      const r = awardXp(fam.pet, xp);
      await updateFamily(familyId, { pet: r.pet });
      fam.pet = r.pet;
      xpDelta = r.xpDelta;
      leveledUp = r.leveledUp;
      unlocked = r.unlocked;
    }
  } else {
    throw new HttpError(400, "Provide either templateId or adhocId");
  }

  // Re-load state and check full-day bonus.
  let state = await loadState(familyId, date, false);
  const bonusResult = maybeAwardFullDayBonus(state.family, state, date);
  if (bonusResult.bonus > 0) {
    await updateFamily(familyId, {
      pet: bonusResult.family.pet,
      streak: bonusResult.family.streak,
      lastStreakDate: bonusResult.family.lastStreakDate,
    });
    state = await loadState(familyId, date, false);
    xpDelta += bonusResult.bonus;
    if (bonusResult.family.pet.level > fam.pet.level) leveledUp = true;
  }

  const resp: CompleteResponse = { state, xpDelta, leveledUp, unlocked };
  return c.json(resp);
});

// ------- POST /adhoc -----------------------------------------------------

app.post("/adhoc", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<AdhocRequest>;
  const familyId = requireString(body.familyId, "familyId");
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
  await putAdhoc(familyId, a);
  return c.json(a);
});

// ------- /templates ------------------------------------------------------

app.post("/templates", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateTemplateRequest>;
  const familyId = requireString(body.familyId, "familyId");
  const pin = requireString(body.pin, "pin");
  if (!(await checkPin(familyId, pin))) throw new HttpError(403, "Wrong PIN");
  const cadence = body.cadence === "weekly" ? "weekly" : "daily";
  const t: TaskTemplate = {
    id: newId(),
    title: requireString(body.title, "title"),
    emoji: body.emoji || (cadence === "weekly" ? "📅" : "✅"),
    cadence,
    weeklyTarget: cadence === "weekly" ? Math.max(1, Math.min(7, body.weeklyTarget ?? 1)) : 1,
    createdAt: new Date().toISOString(),
  };
  await putTemplate(familyId, t);
  return c.json(t);
});

app.patch("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Partial<UpdateTemplateRequest>;
  const familyId = requireString(body.familyId, "familyId");
  const pin = requireString(body.pin, "pin");
  if (!(await checkPin(familyId, pin))) throw new HttpError(403, "Wrong PIN");
  const templates = await listTemplates(familyId);
  const existing = templates.find((t) => t.id === id);
  if (!existing) throw new HttpError(404, "Template not found");
  const updated: TaskTemplate = {
    ...existing,
    title: body.title?.trim() || existing.title,
    emoji: body.emoji || existing.emoji,
    cadence: body.cadence ?? existing.cadence,
    weeklyTarget:
      body.cadence === "weekly" || (body.cadence === undefined && existing.cadence === "weekly")
        ? Math.max(1, Math.min(7, body.weeklyTarget ?? existing.weeklyTarget))
        : 1,
  };
  await putTemplate(familyId, updated);
  return c.json(updated);
});

app.delete("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Partial<DeleteTemplateRequest>;
  const familyId = requireString(body.familyId, "familyId");
  const pin = requireString(body.pin, "pin");
  if (!(await checkPin(familyId, pin))) throw new HttpError(403, "Wrong PIN");
  await deleteTemplate(familyId, id);
  return c.json({ ok: true });
});

// ------- /rewards --------------------------------------------------------

app.post("/rewards", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateRewardRequest>;
  const familyId = requireString(body.familyId, "familyId");
  const pin = requireString(body.pin, "pin");
  if (!(await checkPin(familyId, pin))) throw new HttpError(403, "Wrong PIN");
  const cost = Math.max(1, Math.min(10000, Number(body.cost) || 50));
  const r: Reward = {
    id: newId(),
    title: requireString(body.title, "title"),
    emoji: body.emoji || "🎁",
    cost,
    createdAt: new Date().toISOString(),
  };
  await putReward(familyId, r);
  return c.json(r);
});

app.delete("/rewards/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Partial<DeleteRewardRequest>;
  const familyId = requireString(body.familyId, "familyId");
  const pin = requireString(body.pin, "pin");
  if (!(await checkPin(familyId, pin))) throw new HttpError(403, "Wrong PIN");
  await deleteReward(familyId, id);
  return c.json({ ok: true });
});

// Kid taps a reward to claim it. Spends pet.xp immediately (so they can't
// double-claim). Goes "pending" until parent approves with PIN; deny = refund.
app.post("/claims", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<ClaimRewardRequest>;
  const familyId = requireString(body.familyId, "familyId");
  const rewardId = requireString(body.rewardId, "rewardId");
  const fam = await getFamily(familyId);
  if (!fam) throw new HttpError(404, "Family not found");
  const reward = await getReward(familyId, rewardId);
  if (!reward) throw new HttpError(404, "Reward not found");
  if (fam.pet.xp < reward.cost) {
    throw new HttpError(400, `Not enough XP. Need ${reward.cost}, have ${fam.pet.xp}.`);
  }
  const newPet = reverseXp(fam.pet, reward.cost);
  await updateFamily(familyId, { pet: newPet });
  const claim: RewardClaim = {
    id: newId(),
    rewardId: reward.id,
    rewardTitle: reward.title,
    rewardEmoji: reward.emoji,
    cost: reward.cost,
    status: "pending",
    claimedAt: new Date().toISOString(),
  };
  await putClaim(familyId, claim);
  return c.json(claim);
});

// Parent approves or denies a pending claim. Approve = nothing (XP already
// spent). Deny = refund XP via awardXp (re-applies level/cosmetic logic).
app.post("/claims/:id/resolve", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Partial<ResolveClaimRequest>;
  const familyId = requireString(body.familyId, "familyId");
  const pin = requireString(body.pin, "pin");
  if (!(await checkPin(familyId, pin))) throw new HttpError(403, "Wrong PIN");

  const claims = await listClaims(familyId);
  const claim = claims.find((cl) => cl.id === id);
  if (!claim) throw new HttpError(404, "Claim not found");
  if (claim.status !== "pending") throw new HttpError(400, "Claim already resolved");

  await putClaim(familyId, {
    ...claim,
    status: body.approve ? "approved" : "denied",
    resolvedAt: new Date().toISOString(),
  });

  if (!body.approve) {
    const fam = await getFamily(familyId);
    if (fam) {
      const r = awardXp(fam.pet, claim.cost);
      await updateFamily(familyId, { pet: r.pet });
    }
  }
  return c.json({ ok: true });
});

// ------- POST /verify-pin (used by parent panel gate) --------------------

app.post("/verify-pin", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { familyId?: string; pin?: string };
  const familyId = requireString(body.familyId, "familyId");
  const pin = requireString(body.pin, "pin");
  const ok = await checkPin(familyId, pin);
  if (!ok) throw new HttpError(403, "Wrong PIN");
  return c.json({ ok: true });
});

export default app;
