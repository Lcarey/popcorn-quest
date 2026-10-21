// Item times are formatted in server-local time, which the Lambda pins to the
// family's zone; do the same here so the expected strings are stable.
process.env.TZ = "America/New_York";

import { test } from "node:test";
import assert from "node:assert/strict";
import type { TodayState, XpLogEntry } from "@popcorn/shared";
import { buildDaySummary, daySummaryText, priorDate, resolveDateKeyword, summarizeXpDay } from "./engine.js";
import { todayKey } from "@popcorn/shared";

function entry(amount: number, reason: string, at: string, date?: string): XpLogEntry {
  return { id: reason, at, amount, reason, date };
}

test("summarizeXpDay splits earned, spent, undone and refunded", () => {
  const entries = [
    entry(10, "Completed: Brush teeth", "2026-10-20T12:00:00.000Z", "2026-10-20"),
    entry(30, "Completed: Hard social interaction", "2026-10-20T13:00:00.000Z", "2026-10-20"),
    entry(-10, "Undid: Brush teeth", "2026-10-20T13:05:00.000Z", "2026-10-20"),
    entry(-50, "Reward claimed: Ice cream", "2026-10-20T14:00:00.000Z", "2026-10-20"),
    entry(50, "Refund (denied): Ice cream", "2026-10-20T15:00:00.000Z", "2026-10-20"),
    entry(5, "Side quest: Rake leaves", "2026-10-19T15:00:00.000Z", "2026-10-19"),
  ];
  const s = summarizeXpDay(entries, "2026-10-20");
  assert.equal(s.earned, 40);
  assert.equal(s.undone, 10);
  assert.equal(s.spent, 50);
  assert.equal(s.refunded, 50);
  assert.equal(s.net, 30);
  assert.equal(s.entries.length, 5);
});

test("summarizeXpDay buckets by the local date, not the UTC timestamp", () => {
  // 01:00Z on the 21st is still the evening of the 20th in US Eastern.
  const entries = [entry(15, "Completed: Duolingo", "2026-10-21T01:00:00.000Z", "2026-10-20")];
  assert.equal(summarizeXpDay(entries, "2026-10-20").earned, 15);
  assert.equal(summarizeXpDay(entries, "2026-10-21").earned, 0);
});

test("summarizeXpDay returns entries oldest first", () => {
  const entries = [
    entry(5, "b", "2026-10-20T15:00:00.000Z", "2026-10-20"),
    entry(5, "a", "2026-10-20T11:00:00.000Z", "2026-10-20"),
  ];
  assert.deepEqual(summarizeXpDay(entries, "2026-10-20").entries.map((e) => e.reason), ["a", "b"]);
});

test("summarizeXpDay counts completions, repeats included, net of undos", () => {
  const entries = [
    entry(15, "Completed: 100 XP in Duolingo", "2026-10-19T23:57:59.597Z", "2026-10-19"),
    entry(15, "Completed: 100 XP in Duolingo", "2026-10-19T23:57:59.957Z", "2026-10-19"),
    entry(5, "Side quest: Do 15 push-ups", "2026-10-19T23:58:12.217Z", "2026-10-19"),
    entry(10, "Completed: Easy social interaction", "2026-10-19T23:58:20.000Z", "2026-10-19"),
    entry(-10, "Undid: Easy social interaction", "2026-10-19T23:58:30.000Z", "2026-10-19"),
    entry(25, "All daily tasks done (bonus)", "2026-10-19T23:59:00.000Z", "2026-10-19"),
    entry(-200, "Reward claimed: 15 min screen time", "2026-10-19T23:59:30.000Z", "2026-10-19"),
  ];
  assert.equal(summarizeXpDay(entries, "2026-10-19").completions, 3);
});

function emptyState(): TodayState {
  return {
    daily: [],
    weekly: [],
    adhoc: [],
    pendingClaims: [],
    family: { streak: 2, streakShields: 1, pet: { name: "Popcorn", level: 29, xp: 11672, spendableXp: 1588 } },
  } as unknown as TodayState;
}

test("buildDaySummary lists every earned item in local time, duplicates kept", () => {
  const entries = [
    entry(5, "Completed: pack snacks", "2026-10-19T23:57:49.097Z", "2026-10-19"),
    entry(15, "Completed: 100 XP in Duolingo", "2026-10-19T23:57:59.597Z", "2026-10-19"),
    entry(15, "Completed: 100 XP in Duolingo", "2026-10-19T23:57:59.957Z", "2026-10-19"),
    entry(5, "Side quest: Do 15 push-ups", "2026-10-19T23:58:12.217Z", "2026-10-19"),
    entry(-200, "Reward claimed: 15 min screen time", "2026-10-19T23:58:43.557Z", "2026-10-19"),
  ];
  const s = buildDaySummary(emptyState(), entries, "2026-10-19", "2026-10-20");
  assert.equal(s.xpEarned, 40);
  assert.equal(s.completions, 4);
  assert.deepEqual(s.earnedItems, [
    "7:57 PM  +5  Completed: pack snacks",
    "7:57 PM  +15  Completed: 100 XP in Duolingo",
    "7:57 PM  +15  Completed: 100 XP in Duolingo",
    "7:58 PM  +5  Side quest: Do 15 push-ups",
  ]);
  assert.deepEqual(s.otherItems, ["7:58 PM  -200  Reward claimed: 15 min screen time"]);
  assert.deepEqual(s.tasksDone, ["pack snacks", "100 XP in Duolingo ×2", "Do 15 push-ups (side quest)"]);
  assert.deepEqual(Object.keys(s).slice(0, 4), ["date", "today", "howToAnswer", "xpEarned"]);

  const text = daySummaryText(s);
  assert.match(text, /Earned 40 XP from 4 completions/);
  assert.equal(text.match(/100 XP in Duolingo/g)?.length, 2);
});

test("resolveDateKeyword handles today, yesterday and explicit dates", () => {
  assert.equal(resolveDateKeyword("today"), todayKey());
  assert.equal(resolveDateKeyword("Yesterday"), priorDate(todayKey(), 1));
  assert.equal(resolveDateKeyword("2026-10-19"), "2026-10-19");
  assert.equal(resolveDateKeyword("last week"), undefined);
});
