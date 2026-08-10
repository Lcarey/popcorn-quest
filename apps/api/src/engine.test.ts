import { test } from "node:test";
import assert from "node:assert/strict";
import { todayKey, XP_PER } from "@popcorn/shared";
import type { FamilyMeta, PetState, TodayState } from "@popcorn/shared";
import {
  awardXp,
  maybeAwardFullDayBonus,
  priorDate,
  refundXp,
  reverseEarn,
  spendXp,
  xpForTask,
} from "./engine.js";

function pet(overrides: Partial<PetState> = {}): PetState {
  return { name: "Popcorn", xp: 100, spendableXp: 40, level: 3, unlocked: [], equipped: {}, ...overrides };
}

function fam(overrides: Partial<FamilyMeta> = {}): FamilyMeta {
  return {
    pet: {
      name: "Popcorn",
      xp: 100,
      spendableXp: 100,
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
    repeatable: false,
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

test("awardXp raises both total earned and spendable", () => {
  const r = awardXp(pet({ xp: 100, spendableXp: 40 }), 15);
  assert.equal(r.pet.xp, 115);
  assert.equal(r.pet.spendableXp, 55);
});

test("reverseEarn lowers both counters, clamped at zero", () => {
  const p = reverseEarn(pet({ xp: 10, spendableXp: 5 }), 8);
  assert.equal(p.xp, 2);
  assert.equal(p.spendableXp, 0);
});

test("spendXp lowers only spendable and leaves total/level", () => {
  const p = spendXp(pet({ xp: 100, spendableXp: 40, level: 3 }), 30);
  assert.equal(p.spendableXp, 10);
  assert.equal(p.xp, 100);
  assert.equal(p.level, 3);
});

test("spendXp clamps spendable at zero", () => {
  const p = spendXp(pet({ xp: 100, spendableXp: 20 }), 50);
  assert.equal(p.spendableXp, 0);
  assert.equal(p.xp, 100);
});

test("refundXp raises only spendable, not total or level", () => {
  const p = refundXp(pet({ xp: 100, spendableXp: 5, level: 3 }), 30);
  assert.equal(p.spendableXp, 35);
  assert.equal(p.xp, 100);
  assert.equal(p.level, 3);
});

test("a task can override its default XP", () => {
  const template = {
    id: "social-hard",
    title: "Hard social practice",
    emoji: "💪",
    cadence: "daily" as const,
    weeklyTarget: 1,
    repeatable: false,
    xp: 20,
    createdAt: new Date().toISOString(),
  };
  assert.equal(xpForTask(template), 20);
});
