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
      level: newLevel,
      unlocked: newUnlocks,
    },
    xpDelta,
    leveledUp,
    unlocked,
  };
}

export function reverseXp(pet: PetState, xpDelta: number): PetState {
  const newXp = Math.max(0, pet.xp - xpDelta);
  return {
    ...pet,
    xp: newXp,
    level: levelFromXp(newXp).level,
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
      daily.push({
        template: t,
        completedToday: todaysCompletions.has(t.id),
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
// full-day bonus exactly once per day.
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
  const newStreak = family.lastStreakDate === yesterday ? family.streak + 1 : 1;
  const award = awardXp(family.pet, XP_PER.fullDayBonus);
  return {
    family: {
      ...family,
      pet: award.pet,
      streak: newStreak,
      lastStreakDate: date,
    },
    bonus: XP_PER.fullDayBonus,
  };
}

export function priorDate(date: string, daysAgo = 1): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return todayKey(d);
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
