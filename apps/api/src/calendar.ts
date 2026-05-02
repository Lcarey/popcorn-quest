// =============================================================================
// ICS / webcal: load feed URLs from calendar-feeds.txt, fetch, parse, merge.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ical from "node-ical";
import type { VEvent } from "node-ical";
import type { CalendarEvent, CalendarEventsResponse } from "@popcorn/shared";

const FEED_FILENAME = "calendar-feeds.txt";
const FETCH_TIMEOUT_MS = 8000;
const UPCOMING_LIMIT = 15;
const CACHE_MS = 12 * 60 * 1000;

let memCache: { expires: number; body: CalendarEventsResponse } | null = null;

export function resolveCalendarFeedsPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, FEED_FILENAME),
    path.join(here, "..", FEED_FILENAME),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function readFeedUrlsFromFile(filePath: string): string[] {
  const text = fs.readFileSync(filePath, "utf8");
  const urls: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    urls.push(t);
  }
  return urls;
}

export function normalizeCalendarFetchUrl(raw: string): string {
  const u = raw.trim();
  if (u.toLowerCase().startsWith("webcal://")) {
    return `https://${u.slice("webcal://".length)}`;
  }
  return u;
}

function toDate(d: Date | undefined): Date | null {
  if (!d) return null;
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return d;
}

/** Exported for tests: parse ICS text into event rows (no fetch; not filtered by time). */
export function eventsFromIcsBody(icsBody: string, feedIndex = 0): CalendarEvent[] {
  const cal = ical.sync.parseICS(icsBody);
  const rows: CalendarEvent[] = [];

  const pushFromVEvent = (ev: VEvent) => {
    if (ev.type !== "VEVENT") return;
    if (ev.status === "CANCELLED") return;
    const start = toDate(ev.start as Date | undefined);
    if (!start) return;

    const endDt = toDate(ev.end as Date | undefined);
    const allDay = ev.datetype === "date";
    const title =
      typeof ev.summary === "string" && ev.summary.trim()
        ? ev.summary.trim()
        : "(No title)";
    const location =
      typeof ev.location === "string" && ev.location.trim() ? ev.location.trim() : undefined;

    rows.push({
      start: start.toISOString(),
      end: endDt ? endDt.toISOString() : undefined,
      title,
      location,
      allDay,
      feedIndex,
    });
  };

  for (const comp of Object.values(cal)) {
    if (!comp || typeof comp !== "object") continue;
    if ((comp as VEvent).type !== "VEVENT") continue;
    const ev = comp as VEvent;
    pushFromVEvent(ev);
    const rec = ev.recurrences;
    if (rec && typeof rec === "object") {
      for (const sub of Object.values(rec)) {
        if (sub && typeof sub === "object" && (sub as VEvent).type === "VEVENT") {
          pushFromVEvent(sub as VEvent);
        }
      }
    }
  }

  return rows;
}

export function mergeCapAndSort(rows: CalendarEvent[], now: Date, limit: number): CalendarEvent[] {
  const future = rows.filter((e) => {
    const t = Date.parse(e.start);
    return !Number.isNaN(t) && t >= now.getTime();
  });
  future.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return future.slice(0, limit);
}

async function fetchIcsText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "PopcornQuest/1.0 (+https://github.com/)",
        Accept: "text/calendar,text/plain,*/*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Used by tests: merge ICS bodies from multiple feeds with a mock fetcher. */
export async function fetchMergedCalendarEvents(
  urls: string[],
  fetchText: (url: string) => Promise<string>,
  now: Date,
): Promise<CalendarEventsResponse> {
  if (urls.length === 0) {
    return { events: [] };
  }

  const errors: string[] = [];
  const allRows: CalendarEvent[] = [];

  await Promise.all(
    urls.map(async (raw, i) => {
      const url = normalizeCalendarFetchUrl(raw);
      try {
        const text = await fetchText(url);
        const rows = eventsFromIcsBody(text, i);
        allRows.push(...rows);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`calendar feed ${i + 1} failed:`, msg);
        errors.push(`feed ${i + 1}: ${msg}`);
      }
    }),
  );

  const events = mergeCapAndSort(allRows, now, UPCOMING_LIMIT);
  return errors.length ? { events, errors } : { events };
}

export async function buildCalendarEventsResponse(now = new Date()): Promise<CalendarEventsResponse> {
  const feedPath = resolveCalendarFeedsPath();
  if (!feedPath) {
    return { events: [], errors: ["calendar-feeds.txt not found"] };
  }

  let urls: string[];
  try {
    urls = readFeedUrlsFromFile(feedPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { events: [], errors: [`read feeds: ${msg}`] };
  }

  return fetchMergedCalendarEvents(urls, fetchIcsText, now);
}

export async function getCalendarEventsCached(): Promise<CalendarEventsResponse> {
  const n = Date.now();
  if (memCache && memCache.expires > n) {
    return memCache.body;
  }
  const body = await buildCalendarEventsResponse();
  memCache = { expires: n + CACHE_MS, body };
  return body;
}
