import { motion } from "framer-motion";

export function WeeklyRow({
  emoji,
  title,
  done,
  doneCount,
  target,
  onTick,
  disabled,
}: {
  emoji: string;
  title: string;
  done: boolean; // already done today
  doneCount: number;
  target: number;
  onTick?: () => void;
  disabled?: boolean;
}) {
  const pct = Math.min(1, doneCount / target);
  const completedAll = doneCount >= target;

  return (
    <motion.button
      type="button"
      onClick={() => !disabled && onTick?.()}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      className={[
        "w-full flex items-center gap-3 rounded-2xl px-3 py-3 border-2 transition shadow-chunky-sm",
        completedAll ? "bg-mint/60 border-mint" : done ? "bg-lilac/40 border-lilac" : "bg-white border-white",
        disabled ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className={["w-11 h-11 flex items-center justify-center rounded-xl text-2xl shrink-0", completedAll ? "bg-white" : "bg-lilac/60"].join(" ")}>
        {emoji}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="font-display font-semibold truncate text-cocoa">{title}</div>
        <div className="text-xs text-cocoa/70 mt-0.5">
          {doneCount} of {target} this week
          {done ? " • done today" : completedAll ? " • tap to undo" : ""}
        </div>
        <div className="mt-1 h-2 bg-white/70 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-lilac to-sky rounded-full"
            initial={false}
            animate={{ width: `${pct * 100}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 18 }}
          />
        </div>
      </div>
      <div
        className={[
          "w-9 h-9 rounded-full border-4 flex items-center justify-center shrink-0 font-display font-bold",
          completedAll
            ? "bg-coral border-white text-white"
            : done
            ? "bg-lilac border-white text-white"
            : "bg-white border-cocoa/20 text-cocoa",
        ].join(" ")}
      >
        {completedAll ? (done ? "✓" : "↩") : done ? "✓" : "+1"}
      </div>
    </motion.button>
  );
}
