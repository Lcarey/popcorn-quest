import { test } from "node:test";
import assert from "node:assert/strict";
import { todayKey, XP_PER } from "@popcorn/shared";
import type { FamilyMeta, TodayState } from "@popcorn/shared";
import { maybeAwardFullDayBonus, priorDate } from "./engine.js";

function fam(overrides: Partial<FamilyMeta> = {}): FamilyMeta {
  return {
    pet: {
      name: "Popcorn",
      xp: 100,
      level: 2,
      unlocked: [],
      equipped: {},
    },
    streak: 5,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function allDoneState(family: FamilyMeta): TodayState {
  const template = {
    id: "t1",
    title: "x",
    emoji: "✅",
    cadence: "daily" as const,
    weeklyTarget: 1,
    createdAt: new Date().toISOString(),
  };
  return {
    family,
    date: todayKey(),
    weekStart: todayKey(),
    daily: [{ template, completedToday: true }],
    weekly: [],
    adhoc: [],
    todayProgress: 1,
    rewards: [],
    pendingClaims: [],
  };
}

test("streak continues from yesterday without shields", () => {
  const today = todayKey();
  const f = fam({ lastStreakDate: priorDate(today), streakShields: 0 });
  const r = maybeAwardFullDayBonus(f, allDoneState(f), today);
  assert.equal(r.bonus, XP_PER.fullDayBonus);
  assert.equal(r.family.streak, 6);
  assert.equal(r.family.streakShields, 0);
});

test("one missed day consumes one shield and keeps the streak", () => {
  const today = todayKey();
  const f = fam({ lastStreakDate: priorDate(today, 2), streakShields: 1 });
  const r = maybeAwardFullDayBonus(f, allDoneState(f), today);
  assert.equal(r.family.streak, 6);
  assert.equal(r.family.streakShields, 0);
});

test("two missed days with two shields keeps the streak", () => {
  const today = todayKey();
  const f = fam({ lastStreakDate: priorDate(today, 3), streakShields: 2 });
  const r = maybeAwardFullDayBonus(f, allDoneState(f), today);
  assert.equal(r.family.streak, 6);
  assert.equal(r.family.streakShields, 0);
});

test("gap bigger than shields resets streak and keeps shields", () => {
  const today = todayKey();
  const f = fam({ lastStreakDate: priorDate(today, 4), streakShields: 2 });
  const r = maybeAwardFullDayBonus(f, allDoneState(f), today);
  assert.equal(r.family.streak, 1);
  assert.equal(r.family.streakShields, 2);
});

test("missed day with no shields resets streak", () => {
  const today = todayKey();
  const f = fam({ lastStreakDate: priorDate(today, 2), streakShields: 0 });
  const r = maybeAwardFullDayBonus(f, allDoneState(f), today);
  assert.equal(r.family.streak, 1);
});

test("no double credit on the same day", () => {
  const today = todayKey();
  const f = fam({ lastStreakDate: today });
  const r = maybeAwardFullDayBonus(f, allDoneState(f), today);
  assert.equal(r.bonus, 0);
  assert.equal(r.family.streak, 5);
});
