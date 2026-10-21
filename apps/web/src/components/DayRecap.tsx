import { useQuery } from "@tanstack/react-query";
import { FAMILY_TZ, isXpEarn, todayKey } from "@popcorn/shared";
import { api } from "../api";

// Itemised recap of one day's XP ("How did he earn XP yesterday?"), one row
// per XP log entry so repeats show up as separate lines.
export function DayRecap({ date, title }: { date: string; title: string }) {
  const summaryQuery = useQuery({
    // todayKey() so "yesterday" refetches after midnight.
    queryKey: ["summary", date, todayKey()],
    queryFn: () => api.summary(date),
    staleTime: 5 * 60 * 1000,
  });
  const s = summaryQuery.data;
  if (!s) return null;
  const earned = s.xp.entries.filter(isXpEarn);

  return (
    <section aria-label={`${title}'s XP`}>
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="font-display font-semibold text-lg text-cocoa">{title}</h2>
      </div>
      <div className="card">
        {earned.length === 0 ? (
          <div className="text-sm text-cocoa/60 text-center py-2">No XP earned {title.toLowerCase()}.</div>
        ) : (
          <>
            <ul className="divide-y divide-cocoa/10 text-sm">
              {earned.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 py-1.5">
                  <span className="text-cocoa/60 whitespace-nowrap w-16 shrink-0">
                    {new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: FAMILY_TZ })}
                  </span>
                  <span className="font-display font-bold text-green-600 w-10 shrink-0 text-right">+{e.amount}</span>
                  <span className="text-cocoa min-w-0">{e.reason}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 pt-2 border-t-2 border-cocoa/15 text-sm font-semibold text-cocoa flex justify-between">
              <span>
                {s.completions} {s.completions === 1 ? "completion" : "completions"}
              </span>
              <span>Total +{s.xpEarned} XP</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
