import { motion } from "framer-motion";

export function WeeklyRow({
  emoji,
  title,
  done,
  doneCount,
  target,
  onAdd,
  onRemove,
  disabled,
}: {
  emoji: string;
  title: string;
  done: boolean; // has at least one check today
  doneCount: number;
  target: number;
  onAdd?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const pct = Math.min(1, doneCount / target);
  const completedAll = doneCount >= target;
  const canRemove = !disabled && doneCount > 0;

  return (
    <div
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
          {completedAll ? " • complete!" : done ? " • done today" : ""}
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
      <div className="flex items-center gap-2 shrink-0">
        <motion.button
          type="button"
          aria-label="Remove one"
          onClick={() => canRemove && onRemove?.()}
          disabled={!canRemove}
          whileTap={{ scale: canRemove ? 0.9 : 1 }}
          className={[
            "w-10 h-10 rounded-full border-4 border-white flex items-center justify-center font-display font-bold text-xl shadow-chunky-sm",
            canRemove ? "bg-coral text-white" : "bg-cocoa/10 text-cocoa/30",
          ].join(" ")}
        >
          −
        </motion.button>
        <motion.button
          type="button"
          aria-label="Add one"
          onClick={() => !disabled && onAdd?.()}
          disabled={disabled}
          whileTap={{ scale: disabled ? 1 : 0.9 }}
          className="w-10 h-10 rounded-full border-4 border-white flex items-center justify-center font-display font-bold text-xl shadow-chunky-sm bg-mint text-white"
        >
          +
        </motion.button>
      </div>
    </div>
  );
}
