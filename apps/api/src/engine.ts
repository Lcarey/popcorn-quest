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
} from "@popcorn/shared";
import type {
  AdhocTask,
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
  return template.cadence === "daily" ? XP_PER.daily : XP_PER.weekly;
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
