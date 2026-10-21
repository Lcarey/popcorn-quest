// =============================================================================
// XP / leveling / streak / mood engine.
//
// Pure functions that take current state + an event and return updated state.
// Kept separate from db.ts so we can unit test without AWS dependencies.
// =============================================================================

import {
  COSMETICS,
  XP_PER,
  cosmeticsUnlockedAt,
  levelFromXp,
  moodFromProgress,
  todayKey,
  weekStartKey,
  xpCompletionDelta,
} from "@popcorn/shared";
import type {
  AdhocTask,
  DaySummaryResponse,
  Completion,
  DailyHistoryEntry,
  DailyTaskView,
  FamilyMeta,
  PetState,
  Reward,
  RewardClaim,
  TaskTemplate,
  TodayState,
  WeeklyTaskView,
  XpDaySummary,
  XpLogEntry,
} from "@popcorn/shared";

export interface AwardResult {
  pet: PetState;
  xpDelta: number;
  leveledUp: boolean;
  unlocked?: string; // cosmetic ID newly unlocked at this level-up
}

// Earn XP: raises both lifetime `xp` (level source) and the spendable wallet.
export function awardXp(pet: PetState, xpDelta: number): AwardResult {
  if (xpDelta <= 0) {
    return { pet, xpDelta: 0, leveledUp: false };
  }
  const oldXp = pet.xp;
  const newXp = oldXp + xpDelta;
  const oldLevel = levelFromXp(oldXp).level;
  const newLevel = levelFromXp(newXp).level;
  const leveledUp = newLevel > oldLevel;

  let unlocked: string | undefined;
  let newUnlocks = [...pet.unlocked];
  if (leveledUp) {
    const all = cosmeticsUnlockedAt(newLevel).map((c) => c.id);
    for (const id of all) {
      if (!newUnlocks.includes(id)) newUnlocks.push(id);
    }
    // Pick the highest-level cosmetic that's new in this jump.
    const fresh = COSMETICS.filter(
      (c) => c.unlocksAtLevel > oldLevel && c.unlocksAtLevel <= newLevel,
    );
    if (fresh.length) unlocked = fresh[fresh.length - 1].id;
  }

  return {
    pet: {
      ...pet,
      xp: newXp,
      spendableXp: pet.spendableXp + xpDelta,
      level: newLevel,
      unlocked: newUnlocks,
    },
    xpDelta,
    leveledUp,
    unlocked,
  };
}

// Undo an earn (e.g. unchecking a task): lowers both counters and recomputes
// level from lifetime `xp`. Both clamp at zero.
export function reverseEarn(pet: PetState, xpDelta: number): PetState {
  const newXp = Math.max(0, pet.xp - xpDelta);
  return {
    ...pet,
    xp: newXp,
    spendableXp: Math.max(0, pet.spendableXp - xpDelta),
    level: levelFromXp(newXp).level,
  };
}

// Spend from the wallet (reward claim, streak shield). Lifetime `xp` and level
// are untouched, so spending never de-levels the pet.
export function spendXp(pet: PetState, cost: number): PetState {
  return {
    ...pet,
    spendableXp: Math.max(0, pet.spendableXp - cost),
  };
}

// Refund to the wallet (parent denies a claim). Does not touch lifetime `xp`,
// level, or cosmetics.
export function refundXp(pet: PetState, cost: number): PetState {
  return {
    ...pet,
    spendableXp: pet.spendableXp + cost,
  };
}

// -------- Today's progress / mood ----------------------------------------

export function buildTodayState(
  family: FamilyMeta,
  templates: TaskTemplate[],
  completionsThisWeek: Completion[],
  adhoc: AdhocTask[],
  rewards: Reward[],
  pendingClaims: RewardClaim[],
  history?: DailyHistoryEntry[],
  date: string = todayKey(),
): TodayState {
  const weekStart = weekStartKey(new Date(date));
  const weeklyDoneByTemplate = new Map<string, Completion[]>();
  const todaysCompletions = new Set<string>();
  for (const c of completionsThisWeek) {
    if (c.date === date) todaysCompletions.add(c.templateId);
    const arr = weeklyDoneByTemplate.get(c.templateId) ?? [];
    arr.push(c);
    weeklyDoneByTemplate.set(c.templateId, arr);
  }

  const daily: DailyTaskView[] = [];
  const weekly: WeeklyTaskView[] = [];

  for (const t of templates) {
    if (t.cadence === "daily") {
      // Repeatable daily tasks can be logged multiple times/day; surface the
      // count so the +/- row can show it. Legacy check rows default to 1.
      const todayCompletion = (weeklyDoneByTemplate.get(t.id) ?? []).find(
        (c) => c.date === date,
      );
      daily.push({
        template: t,
        completedToday: todaysCompletions.has(t.id),
        amountToday: todayCompletion ? (todayCompletion.amount ?? 1) : 0,
      });
    } else {
      const completions = weeklyDoneByTemplate.get(t.id) ?? [];
      const isCumulative = t.weeklyTrack === "cumulative";
      // Both cumulative and sessions now sum per-day amounts (sessions default
      // legacy rows to 1). Sessions can log multiple checks in a single day.
      const doneThisWeek = completions.reduce((sum, c) => sum + (c.amount ?? 1), 0);
      const todayCompletion = completions.find((c) => c.date === date);
      const amountToday = todayCompletion ? (todayCompletion.amount ?? 1) : 0;
      weekly.push({
        template: t,
        target: t.weeklyTarget,
        doneThisWeek,
        completedToday: todaysCompletions.has(t.id),
        amountToday: isCumulative ? (todayCompletion?.amount ?? 0) : amountToday,
      });
    }
  }

  // Progress: ratio of "required ticks today" that are done.
  // Daily counts as 1 unit each. Weekly counts toward target across the week,
  // but each individual day's contribution is bounded by remaining target.
  const dailyTotal = daily.length;
  const dailyDone = daily.filter((d) => d.completedToday).length;
  let weeklyTotal = 0;
  let weeklyDone = 0;
  for (const w of weekly) {
    weeklyTotal += w.target;
    weeklyDone += Math.min(w.doneThisWeek, w.target);
  }
  const total = dailyTotal + weeklyTotal;
  const done = dailyDone + weeklyDone;
  const todayProgress = total > 0 ? done / total : 0;

  return {
    family: { ...family, pet: { ...family.pet, lastMood: moodFromProgress(todayProgress) } },
    date,
    weekStart,
    daily,
    weekly,
    adhoc,
    todayProgress,
    rewards,
    pendingClaims,
    history,
  };
}

// Build last-N-days history given the same templates + completions over a
// wider date range. Used for the home heatmap.
export function buildHistory(
  templates: TaskTemplate[],
  completionsByDate: Map<string, Completion[]>,
  days: string[],
  xpEarnedByDate?: Map<string, number>,
  xpCompletionsByDate?: Map<string, number>,
): DailyHistoryEntry[] {
  // Daily required = number of daily templates.
  const dailyTemplates = templates.filter((t) => t.cadence === "daily");
  return days.map((date) => {
    const completions = completionsByDate.get(date) ?? [];
    const completedTplIds = new Set(completions.map((c) => c.templateId));
    const required = dailyTemplates.length;
    const completed = dailyTemplates.filter((t) => completedTplIds.has(t.id)).length;
    return {
      date,
      required,
      completed,
      ratio: required === 0 ? 0 : completed / required,
      xpEarned: xpEarnedByDate?.get(date) ?? 0,
      completions: xpCompletionsByDate?.get(date) ?? 0,
    };
  });
}

// -------- Streak update --------------------------------------------------

// After a completion, if every daily task is now done for `date` AND the date
// is today, bump the streak (carrying over from yesterday) and award the
// full-day bonus exactly once per day. Streak shields auto-cover missed days:
// one shield per missed day, consumed only if they cover the whole gap.
export function maybeAwardFullDayBonus(
  family: FamilyMeta,
  state: TodayState,
  date: string,
): { family: FamilyMeta; bonus: number } {
  if (date !== todayKey()) return { family, bonus: 0 };
  // Only if there ARE daily tasks and all are done.
  if (state.daily.length === 0) return { family, bonus: 0 };
  const allDone = state.daily.every((d) => d.completedToday);
  if (!allDone) return { family, bonus: 0 };
  if (family.lastStreakDate === date) return { family, bonus: 0 }; // already credited

  const yesterday = priorDate(date);
  let shields = family.streakShields ?? 0;
  let newStreak: number;
  if (family.lastStreakDate === yesterday) {
    newStreak = family.streak + 1;
  } else if (family.lastStreakDate && shields > 0) {
    // Walk back from yesterday to lastStreakDate, counting missed days.
    // Bounded by shield count so an ancient lastStreakDate can't loop long.
    let missed = 0;
    let cursor = yesterday;
    while (cursor !== family.lastStreakDate && missed <= shields) {
      missed++;
      cursor = priorDate(cursor);
    }
    if (cursor === family.lastStreakDate && missed <= shields) {
      newStreak = family.streak + 1;
      shields -= missed;
    } else {
      newStreak = 1;
    }
  } else {
    newStreak = 1;
  }
  const award = awardXp(family.pet, XP_PER.fullDayBonus);
  return {
    family: {
      ...family,
      pet: award.pet,
      streak: newStreak,
      streakShields: shields,
      lastStreakDate: date,
    },
    bonus: XP_PER.fullDayBonus,
  };
}

export function priorDate(date: string, daysAgo = 1): string {
  // Pure local-date arithmetic: parsing as UTC and formatting local (the old
  // approach) drifts by a day on non-UTC machines and isn't self-consistent
  // when chained (priorDate(priorDate(x)) !== priorDate(x, 2)).
  const [y, m, d] = date.split("-").map(Number);
  return todayKey(new Date(y, m - 1, d - daysAgo));
}

export function xpForTask(template: TaskTemplate): number {
  return template.xp ?? (template.cadence === "daily" ? XP_PER.daily : XP_PER.weekly);
}

/** Most recent session completion for a template within a week (for undo). */
export function latestSessionCompletion(
  completions: Completion[],
  templateId: string,
): Completion | undefined {
  const rows = completions.filter((c) => c.templateId === templateId);
  if (!rows.length) return undefined;
  return rows.sort(
    (a, b) => b.date.localeCompare(a.date) || b.completedAt.localeCompare(a.completedAt),
  )[0];
}

/** Local day an XP log entry belongs to (older entries lack `date`). */
export function xpLogDate(entry: XpLogEntry): string {
  return entry.date ?? todayKey(new Date(entry.at));
}

/** "today" / "yesterday" / yyyy-mm-dd → yyyy-mm-dd; undefined if unrecognised. */
export function resolveDateKeyword(v: string): string | undefined {
  const s = v.trim().toLowerCase();
  if (s === "today") return todayKey();
  if (s === "yesterday") return priorDate(todayKey(), 1);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

/** "7:57 PM  +15  Completed: Submit RSM" in server-local (family) time. */
export function formatXpItem(e: XpLogEntry): string {
  const time = new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${time}  ${e.amount > 0 ? "+" : ""}${e.amount}  ${e.reason}`;
}

/**
 * Tasks done on a day, from the XP log (net of undos), oldest first. Repeats
 * become "Title ×n". The log is the source of truth: side quest records
 * expire after a couple of days but their log entries don't.
 */
export function tasksDoneFromLog(dayEntries: XpLogEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const e of dayEntries) {
    const delta = xpCompletionDelta(e);
    if (delta === 0) continue;
    const m = /^(?:Completed|Undid): (.*)$/.exec(e.reason);
    const sq = /^(?:Side quest|Undid side quest): (.*)$/.exec(e.reason);
    const name = sq ? `${sq[1]} (side quest)` : m?.[1];
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + delta);
  }
  return [...counts]
    .filter(([, n]) => n > 0)
    .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name));
}

/**
 * Roll up one local day of XP log entries. "Earned" matches the heatmap rule
 * in loadState: positive amounts that aren't reward refunds.
 */
export function summarizeXpDay(entries: XpLogEntry[], date: string): XpDaySummary {
  const day = entries
    .filter((e) => xpLogDate(e) === date)
    .sort((a, b) => a.at.localeCompare(b.at));
  let earned = 0;
  let spent = 0;
  let undone = 0;
  let refunded = 0;
  let net = 0;
  let completions = 0;
  for (const e of day) {
    net += e.amount;
    completions += xpCompletionDelta(e);
    if (e.amount > 0) {
      if (e.reason.startsWith("Refund")) refunded += e.amount;
      else earned += e.amount;
    } else if (e.reason.startsWith("Undid")) {
      undone -= e.amount;
    } else {
      spent -= e.amount;
    }
  }
  return { date, earned, spent, undone, refunded, net, completions: Math.max(0, completions), entries: day };
}

/**
 * One-call day recap for agents (GET /summary, get_day_summary). Done tasks
 * and counts come from the XP log; remaining tasks from that day's state.
 */
export function buildDaySummary(
  state: TodayState,
  logs: XpLogEntry[],
  date: string,
  today: string = todayKey(),
): DaySummaryResponse {
  const xp = summarizeXpDay(logs, date);
  const label = (title: string, emoji: string) => `${emoji} ${title}`;
  const tasksRemaining: string[] = [];
  for (const d of state.daily) {
    if (!d.completedToday) tasksRemaining.push(label(d.template.title, d.template.emoji));
  }
  for (const w of state.weekly) {
    if (!w.completedToday && w.doneThisWeek < w.target) {
      tasksRemaining.push(`${label(w.template.title, w.template.emoji)} (${w.doneThisWeek}/${w.target} this week)`);
    }
  }
  for (const a of state.adhoc) {
    if (!a.done) tasksRemaining.push(`${label(a.title, a.emoji)} (side quest)`);
  }
  const { pet } = state.family;
  return {
    date,
    today,
    howToAnswer:
      "To say how XP was earned, list every line of earnedItems (repeated lines are separate completions; keep them all) and give xpEarned as the total. completions is the number of tasks and side quests done, repeats included. Mention otherItems (spending, undos) separately.",
    xpEarned: xp.earned,
    completions: xp.completions,
    earnedItems: xp.entries.filter((e) => e.amount > 0 && !e.reason.startsWith("Refund")).map(formatXpItem),
    otherItems: xp.entries.filter((e) => e.amount <= 0 || e.reason.startsWith("Refund")).map(formatXpItem),
    tasksDone: tasksDoneFromLog(xp.entries),
    tasksRemaining,
    pet: { name: pet.name, level: pet.level, xp: pet.xp, spendableXp: pet.spendableXp },
    streak: state.family.streak,
    streakShields: state.family.streakShields ?? 0,
    pendingClaims: state.pendingClaims.map((cl) => ({
      rewardTitle: cl.rewardTitle,
      cost: cl.cost,
      claimedAt: cl.claimedAt,
    })),
    xp,
  };
}

/** Plain-text day recap (GET /summary?format=text) for browser-only agents. */
export function daySummaryText(s: DaySummaryResponse): string {
  const lines = [
    `Popcorn Quest XP for ${s.date}${s.date === s.today ? " (today)" : ""}`,
    `Earned ${s.xpEarned} XP from ${s.completions} completions. Each line below is one completion; repeated lines mean the task was done more than once.`,
    "",
    "Earned:",
    ...(s.earnedItems.length ? s.earnedItems.map((l) => `  ${l}`) : ["  (nothing)"]),
    `  Total: +${s.xpEarned} XP`,
  ];
  if (s.otherItems.length) lines.push("", "Spent / undone:", ...s.otherItems.map((l) => `  ${l}`));
  if (s.tasksRemaining.length) lines.push("", "Not done:", ...s.tasksRemaining.map((t) => `  ${t}`));
  lines.push("", `${s.pet.name}: level ${s.pet.level}, ${s.pet.spendableXp} XP to spend. Streak: ${s.streak} days.`);
  return lines.join("\n") + "\n";
}
