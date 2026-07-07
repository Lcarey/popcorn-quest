// Streak chip that grows with the streak and shows protective shields.
// Tiers: 0 = gray ember, 1-6 = flame, 7-13 = double flame, 14-29 = triple,
// 30+ = inferno. Long streaks should feel like a trophy worth defending.

import { motion } from "framer-motion";

function tier(streak: number): { flames: string; label?: string; big: boolean } {
  if (streak >= 30) return { flames: "🔥🔥🔥", label: "INFERNO", big: true };
  if (streak >= 14) return { flames: "🔥🔥🔥", big: true };
  if (streak >= 7) return { flames: "🔥🔥", big: true };
  if (streak >= 1) return { flames: "🔥", big: false };
  return { flames: "🪵", big: false };
}

export function StreakBadge({ streak, shields }: { streak: number; shields: number }) {
  const t = tier(streak);
  return (
    <div className="flex items-center gap-2">
      <div className={["chip bg-butter", t.big ? "py-1.5" : ""].join(" ")}>
        <motion.span
          className={t.big ? "text-lg" : ""}
          animate={t.big ? { scale: [1, 1.15, 1] } : undefined}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          {t.flames}
        </motion.span>
        <span>
          Streak: {streak}
          {t.label ? ` · ${t.label}` : ""}
        </span>
      </div>
      {shields > 0 && (
        <div className="chip bg-sky/60" title="Streak shields: each one saves your streak for a missed day">
          {"🛡️".repeat(shields)}
        </div>
      )}
    </div>
  );
}
