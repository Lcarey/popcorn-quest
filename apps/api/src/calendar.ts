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
const RRULE_WINDOW_DAYS = 90;

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

type RRuleLike = { between?: (a: Date, b: Date, inc: boolean) => Date[] };

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Exported for tests: parse ICS text into event rows (no fetch; not filtered by time). */
export function eventsFromIcsBody(icsBody: string, feedIndex = 0, now: Date = new Date()): CalendarEvent[] {
  const cal = ical.sync.parseICS(icsBody);
  const rows: CalendarEvent[] = [];
  const windowEnd = new Date(now.getTime() + RRULE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const pushOccurrence = (ev: VEvent, start: Date, end: Date | null) => {
    if (ev.status === "CANCELLED") return;
    const allDay = ev.datetype === "date";
    const title =
      typeof ev.summary === "string" && ev.summary.trim()
        ? ev.summary.trim()
        : "(No title)";
    const location =
      typeof ev.location === "string" && ev.location.trim() ? ev.location.trim() : undefined;

    rows.push({
      start: start.toISOString(),
      end: end ? end.toISOString() : undefined,
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

    const masterStart = toDate(ev.start as Date | undefined);
    if (!masterStart) continue;
    const masterEnd = toDate(ev.end as Date | undefined);
    const duration = masterEnd ? masterEnd.getTime() - masterStart.getTime() : 0;

    const rrule = (ev as VEvent & { rrule?: RRuleLike }).rrule;
    const exdate = (ev as VEvent & { exdate?: Record<string, Date> }).exdate ?? {};
    const overrides = (ev.recurrences ?? {}) as Record<string, VEvent>;

    // Days to skip when expanding RRULE: explicit EXDATEs + dates that have
    // RECURRENCE-ID overrides (we'll push the overrides separately below).
    const skipDays = new Set<string>();
    for (const d of Object.values(exdate)) {
      if (d instanceof Date) skipDays.add(ymd(d));
    }
    for (const [key, sub] of Object.entries(overrides)) {
      const parsed = new Date(key);
      if (!Number.isNaN(parsed.getTime())) skipDays.add(ymd(parsed));
      const subStart = toDate((sub as VEvent | undefined)?.start as Date | undefined);
      if (subStart) skipDays.add(ymd(subStart));
    }

    if (rrule && typeof rrule.between === "function") {
      let occurrences: Date[];
      try {
        occurrences = rrule.between(now, windowEnd, true) ?? [];
      } catch {
        occurrences = [];
      }
      // rrule.between may exclude the dtstart if it predates `now`; if the
      // master itself falls inside the window and isn't on a skipped day,
      // include it too.
      if (masterStart >= now && masterStart <= windowEnd) {
        const masterDay = ymd(masterStart);
        if (!occurrences.some((o) => ymd(o) === masterDay)) {
          occurrences = [masterStart, ...occurrences];
        }
      }
      for (const occ of occurrences) {
        if (skipDays.has(ymd(occ))) continue;
        const occEnd = duration > 0 ? new Date(occ.getTime() + duration) : null;
        pushOccurrence(ev, occ, occEnd);
      }
    } else {
      // Non-recurring single event.
      pushOccurrence(ev, masterStart, masterEnd);
    }

    // Modified instances (RECURRENCE-ID overrides) — push with their override
    // start/title regardless of whether the master is recurring.
    for (const sub of Object.values(overrides)) {
      if (!sub || typeof sub !== "object" || (sub as VEvent).type !== "VEVENT") continue;
      const subStart = toDate((sub as VEvent).start as Date | undefined);
      if (!subStart) continue;
      const subEnd = toDate((sub as VEvent).end as Date | undefined);
      pushOccurrence(sub as VEvent, subStart, subEnd);
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
        const rows = eventsFromIcsBody(text, i, now);
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
