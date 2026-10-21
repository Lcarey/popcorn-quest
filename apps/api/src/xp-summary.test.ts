import { test } from "node:test";
import assert from "node:assert/strict";
import type { XpLogEntry } from "@popcorn/shared";
import { summarizeXpDay } from "./engine.js";

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
