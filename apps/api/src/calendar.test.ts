import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  eventsFromIcsBody,
  fetchMergedCalendarEvents,
  mergeCapAndSort,
  normalizeCalendarFetchUrl,
} from "./calendar.js";

const REF_NOW = new Date("2030-06-01T12:00:00.000Z");

describe("normalizeCalendarFetchUrl", () => {
  it("maps webcal to https", () => {
    assert.equal(
      normalizeCalendarFetchUrl("webcal://example.com/cal.ics"),
      "https://example.com/cal.ics",
    );
  });
  it("leaves https unchanged", () => {
    assert.equal(normalizeCalendarFetchUrl("https://example.com/x"), "https://example.com/x");
  });
});

describe("eventsFromIcsBody + mergeCapAndSort", () => {
  const icsTwoEvents = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:e2",
    "DTSTAMP:20250101T120000Z",
    "DTSTART:20300715T180000Z",
    "DTEND:20300715T190000Z",
    "SUMMARY:Later event",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:e1",
    "DTSTAMP:20250101T120000Z",
    "DTSTART:20300710T140000Z",
    "SUMMARY:Earlier event",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  it("sorts by start ascending and caps at limit", () => {
    const rows = eventsFromIcsBody(icsTwoEvents);
    const merged = mergeCapAndSort(rows, REF_NOW, 15);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].title, "Earlier event");
    assert.equal(merged[1].title, "Later event");

    const capped = mergeCapAndSort(rows, REF_NOW, 1);
    assert.equal(capped.length, 1);
    assert.equal(capped[0].title, "Earlier event");
  });

  it("marks all-day events", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:day",
      "DTSTAMP:20250101T120000Z",
      "DTSTART;VALUE=DATE:20300801",
      "SUMMARY:All day fun",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const rows = eventsFromIcsBody(ics);
    const merged = mergeCapAndSort(rows, REF_NOW, 10);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].allDay, true);
    assert.equal(merged[0].title, "All day fun");
  });

  it("drops cancelled events", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:x",
      "DTSTAMP:20250101T120000Z",
      "DTSTART:20300901T120000Z",
      "SUMMARY:Nope",
      "STATUS:CANCELLED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const rows = eventsFromIcsBody(ics);
    const merged = mergeCapAndSort(rows, REF_NOW, 10);
    assert.equal(merged.length, 0);
  });
});

describe("fetchMergedCalendarEvents", () => {
  it("merges two feeds and sorts", async () => {
    const feedA = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:a",
      "DTSTAMP:20250101T120000Z",
      "DTSTART:20301120T100000Z",
      "SUMMARY:From A",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const feedB = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:b",
      "DTSTAMP:20250101T120000Z",
      "DTSTART:20301105T100000Z",
      "SUMMARY:From B",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");

    const body = await fetchMergedCalendarEvents(
      ["https://a.test/x.ics", "https://b.test/y.ics"],
      async (url) => {
        if (url.includes("a.test")) return feedA;
        if (url.includes("b.test")) return feedB;
        throw new Error("unexpected url");
      },
      REF_NOW,
    );
    assert.equal(body.events.length, 2);
    assert.equal(body.events[0].title, "From B");
    assert.equal(body.events[0].feedIndex, 1);
    assert.equal(body.events[1].title, "From A");
    assert.equal(body.events[1].feedIndex, 0);
    assert.ok(!body.errors?.length);
  });

  it("records partial errors when a feed fails", async () => {
    const body = await fetchMergedCalendarEvents(
      ["https://ok.test/c.ics", "https://bad.test/d.ics"],
      async (url) => {
        if (url.includes("ok.test")) {
          return [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "BEGIN:VEVENT",
            "UID:ok",
            "DTSTAMP:20250101T120000Z",
            "DTSTART:20301201T120000Z",
            "SUMMARY:OK",
            "END:VEVENT",
            "END:VCALENDAR",
          ].join("\n");
        }
        throw new Error("network");
      },
      REF_NOW,
    );
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0].title, "OK");
    assert.equal(body.events[0].feedIndex, 0);
    assert.ok(body.errors?.length === 1);
    assert.ok(body.errors![0].includes("feed 2"));
  });
});
