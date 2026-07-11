import { test } from "node:test";
import assert from "node:assert/strict";
import { todayKey } from "@popcorn/shared";
import type { Completion, FamilyMeta, TaskTemplate } from "@popcorn/shared";
import { buildTodayState } from "./engine.js";

function fam(): FamilyMeta {
  return {
    pet: { name: "Popcorn", xp: 0, spendableXp: 0, level: 1, unlocked: [], equipped: {} },
    streak: 0,
    createdAt: new Date().toISOString(),
  };
}

function tpl(overrides: Partial<TaskTemplate>): TaskTemplate {
  return {
    id: "t",
    title: "x",
    emoji: "✅",
    cadence: "daily",
    weeklyTarget: 1,
    repeatable: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test("repeatable daily surfaces amountToday from the day's completion", () => {
  const date = todayKey();
  const t = tpl({ id: "beast", cadence: "daily", repeatable: true });
  const completions: Completion[] = [
    { templateId: "beast", date, completedAt: new Date().toISOString(), amount: 3 },
  ];
  const state = buildTodayState(fam(), [t], completions, [], [], [], undefined, date);
  assert.equal(state.daily.length, 1);
  assert.equal(state.daily[0].completedToday, true);
  assert.equal(state.daily[0].amountToday, 3);
});

test("daily check with no completion reports amountToday 0", () => {
  const date = todayKey();
  const t = tpl({ id: "meds", cadence: "daily", repeatable: false });
  const state = buildTodayState(fam(), [t], [], [], [], [], undefined, date);
  assert.equal(state.daily[0].completedToday, false);
  assert.equal(state.daily[0].amountToday, 0);
});

test("weekly-once counts a single completion toward the week", () => {
  const date = todayKey();
  const t = tpl({ id: "refill", cadence: "weekly", repeatable: false, weeklyTarget: 1 });
  const completions: Completion[] = [
    { templateId: "refill", date, completedAt: new Date().toISOString() },
  ];
  const state = buildTodayState(fam(), [t], completions, [], [], [], undefined, date);
  assert.equal(state.weekly.length, 1);
  assert.equal(state.weekly[0].doneThisWeek, 1);
  assert.equal(state.weekly[0].target, 1);
});
