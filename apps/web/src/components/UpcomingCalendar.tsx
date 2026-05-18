import type { CalendarEvent } from "@popcorn/shared";

/** Subtle tinted rows per subscribed calendar (cycles if you add many feeds). */
const FEED_ROW_BG = [
  "bg-blue-200/70", // light blue (SportNgin) — `sky-*` is overridden by tailwind.config.js to a single value, so use default-palette `blue-*` here
  "bg-rose-100/50", // grey-red
  "bg-emerald-100/50", // grey-green
  "bg-indigo-100/50", // grey-violet
  "bg-amber-100/55", // grey-amber
  "bg-teal-100/50", // grey-teal
] as const;

function rowBackgroundClass(feedIndex: number): string {
  const i = ((feedIndex % FEED_ROW_BG.length) + FEED_ROW_BG.length) % FEED_ROW_BG.length;
  return FEED_ROW_BG[i]!;
}

function formatWhen(ev: CalendarEvent): string {
  const start = new Date(ev.start);
  if (Number.isNaN(start.getTime())) return "";
  if (ev.allDay) {
    return start.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  return start.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function UpcomingCalendar({
  events,
  loading,
  error,
}: {
  events: CalendarEvent[];
  loading: boolean;
  error: Error | null;
}) {
  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="font-display font-semibold text-lg text-cocoa">Upcoming</h2>
      </div>
      <div className="rounded-2xl border-2 border-white bg-white/90 shadow-chunky-sm overflow-hidden">
        {loading && (
          <div className="px-3 py-4 text-sm text-cocoa/60 text-center">Loading schedule…</div>
        )}
        {!loading && error && (
          <div className="px-3 py-4 text-sm text-cocoa/70 text-center">Couldn&apos;t load calendar.</div>
        )}
        {!loading && !error && events.length === 0 && (
          <div className="px-3 py-4 text-sm text-cocoa/60 text-center">No upcoming events.</div>
        )}
        {!loading && !error && events.length > 0 && (
          <ul className="divide-y divide-cocoa/[0.07]">
            {events.map((ev, i) => (
              <li
                key={`${ev.start}-${ev.title}-${i}`}
                className={["px-3 py-2.5 flex gap-3 text-left", rowBackgroundClass(ev.feedIndex)].join(" ")}
              >
                <div className="shrink-0 w-[7.5rem] text-xs font-semibold text-cocoa/55 tabular-nums leading-snug pt-0.5">
                  {formatWhen(ev)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display font-semibold text-cocoa text-sm leading-snug">{ev.title}</div>
                  {ev.location ? (
                    <div className="text-xs text-cocoa/60 mt-0.5 truncate">{ev.location}</div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
