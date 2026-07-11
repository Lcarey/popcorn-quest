import { motion } from "framer-motion";

// A daily task that must be done at least once per day but can be repeated for
// extra XP (e.g. "1 page of Beast Academy"). Shows a check for the required
// first rep plus +/- to log extras.
export function RepeatableDailyRow({
  emoji,
  title,
  count,
  onAdd,
  onRemove,
  disabled,
}: {
  emoji: string;
  title: string;
  count: number; // times logged today
  onAdd?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const done = count >= 1;
  const extra = Math.max(0, count - 1);
  const canRemove = !disabled && count > 0;

  return (
    <div
      className={[
        "w-full flex items-center gap-3 rounded-2xl px-3 py-3 border-2 transition shadow-chunky-sm",
        done ? "bg-mint/60 border-mint" : "bg-white border-white",
        disabled ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className={["w-11 h-11 flex items-center justify-center rounded-xl text-2xl shrink-0", done ? "bg-white" : "bg-butter"].join(" ")}>
        {emoji}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="font-display font-semibold truncate text-cocoa">{title}</div>
        <div className="text-xs text-cocoa/70 mt-0.5">
          {done
            ? extra > 0
              ? `Done + ${extra} extra today • +5 each`
              : "Done today • extra pages earn +5"
            : "1 required today • extra pages earn +5"}
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
        <div className="min-w-[1.75rem] text-center font-display font-bold text-cocoa">{count}</div>
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
