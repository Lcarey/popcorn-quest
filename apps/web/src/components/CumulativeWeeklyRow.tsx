import { motion } from "framer-motion";
import { useState } from "react";

export function CumulativeWeeklyRow({
  emoji,
  title,
  doneCount,
  target,
  amountToday,
  onSetAmount,
  disabled,
}: {
  emoji: string;
  title: string;
  doneCount: number;
  target: number;
  amountToday: number;
  onSetAmount: (amount: number) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState(amountToday > 0 ? String(amountToday) : "");
  const left = Math.max(0, target - doneCount);
  const pct = Math.min(1, doneCount / target);
  const completedAll = doneCount >= target;

  const submit = () => {
    const n = Math.max(0, Math.floor(Number(input) || 0));
    if (n !== amountToday) onSetAmount(n);
  };

  return (
    <div
      className={[
        "w-full rounded-2xl px-3 py-3 border-2 transition shadow-chunky-sm",
        completedAll ? "bg-mint/60 border-mint" : amountToday > 0 ? "bg-lilac/40 border-lilac" : "bg-white border-white",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <div className={["w-11 h-11 flex items-center justify-center rounded-xl text-2xl shrink-0", completedAll ? "bg-white" : "bg-lilac/60"].join(" ")}>
          {emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold truncate text-cocoa">{title}</div>
          <div className="text-xs text-cocoa/70 mt-0.5">
            {doneCount} done · {completedAll ? "complete!" : `${left} left`}
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
      </div>
      <div className="flex items-center gap-2 mt-2 ml-14">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={input}
          placeholder="0"
          onChange={(e) => setInput(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          disabled={disabled}
          className="w-20 px-3 py-1.5 rounded-xl bg-white border-2 border-white shadow-inner text-center font-display text-lg focus:outline-none focus:border-coral"
        />
        <span className="text-xs text-cocoa/60">today</span>
      </div>
    </div>
  );
}
