import { motion } from "framer-motion";

export interface TaskRowProps {
  emoji: string;
  title: string;
  done: boolean;
  subtitle?: string;
  onToggle?: () => void;
  rightSlot?: React.ReactNode;
  disabled?: boolean;
}

export function TaskRow({ emoji, title, done, subtitle, onToggle, rightSlot, disabled }: TaskRowProps) {
  return (
    <motion.button
      type="button"
      onClick={() => !disabled && onToggle?.()}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      className={[
        "w-full flex items-center gap-3 rounded-2xl px-3 py-3 border-2 transition shadow-chunky-sm",
        done ? "bg-mint/60 border-mint" : "bg-white border-white",
        disabled ? "opacity-60" : "",
      ].join(" ")}
    >
      <div
        className={[
          "w-11 h-11 flex items-center justify-center rounded-xl text-2xl shrink-0",
          done ? "bg-white" : "bg-butter",
        ].join(" ")}
      >
        {emoji}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className={["font-display font-semibold truncate", done ? "line-through text-cocoa/60" : "text-cocoa"].join(" ")}>
          {title}
        </div>
        {subtitle && <div className="text-xs text-cocoa/70 mt-0.5 truncate">{subtitle}</div>}
      </div>
      {rightSlot}
      <motion.div
        animate={done ? { scale: [0.5, 1.3, 1], rotate: [0, 8, 0] } : { scale: 0.9 }}
        transition={{ duration: 0.35 }}
        className={[
          "w-9 h-9 rounded-full border-4 flex items-center justify-center shrink-0",
          done ? "bg-coral border-white text-white" : "bg-white border-cocoa/20 text-cocoa/30",
        ].join(" ")}
      >
        {done ? "✓" : ""}
      </motion.div>
    </motion.button>
  );
}
