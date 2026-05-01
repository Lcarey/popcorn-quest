import type { DailyHistoryEntry } from "@popcorn/shared";

export function HistoryHeatmap({ history }: { history: DailyHistoryEntry[] }) {
  if (!history || history.length === 0) return null;
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="font-display font-semibold text-base text-cocoa">Last 14 days</h3>
        <Legend />
      </div>
      <div className="flex gap-1 items-end justify-between">
        {history.map((d) => (
          <Cell key={d.date} entry={d} />
        ))}
      </div>
    </div>
  );
}

function Cell({ entry }: { entry: DailyHistoryEntry }) {
  const dayName = new Date(`${entry.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
  })[0];
  const ratio = entry.required > 0 ? entry.ratio : 0;
  let bg = "bg-white/60";
  let label = `${entry.completed}/${entry.required}`;
  if (entry.required === 0) {
    bg = "bg-white/40";
    label = "—";
  } else if (ratio >= 1) bg = "bg-mint";
  else if (ratio >= 0.66) bg = "bg-mint/70";
  else if (ratio >= 0.33) bg = "bg-butter";
  else if (ratio > 0) bg = "bg-peach/70";
  else bg = "bg-white";

  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
      <div
        title={`${entry.date} • ${label}`}
        className={`w-full aspect-square rounded-lg border-2 border-white shadow-chunky-sm ${bg} flex items-center justify-center text-[10px] font-bold text-cocoa/70`}
      >
        {ratio >= 1 ? "★" : ""}
      </div>
      <div className="text-[10px] text-cocoa/60 font-semibold">{dayName}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-1 text-[10px] text-cocoa/60">
      <span className="w-3 h-3 rounded bg-white" />
      <span className="w-3 h-3 rounded bg-peach/70" />
      <span className="w-3 h-3 rounded bg-butter" />
      <span className="w-3 h-3 rounded bg-mint/70" />
      <span className="w-3 h-3 rounded bg-mint" />
    </div>
  );
}
