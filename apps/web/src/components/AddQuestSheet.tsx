import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

const QUICK_EMOJIS = ["✨", "🚲", "🎨", "📖", "🏀", "🎮", "🧹", "🦴", "🎵", "🏊", "🧗", "🎯", "🍎", "💧", "🧠", "💪"];

export function AddQuestSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (title: string, emoji: string) => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("✨");
  const [submitting, setSubmitting] = useState(false);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-cocoa/30 z-40"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="fixed left-0 right-0 bottom-0 z-50 bg-cream rounded-t-3xl p-5 pt-3 shadow-chunky max-w-md mx-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
          >
            <div className="w-12 h-1.5 rounded-full bg-cocoa/20 mx-auto mb-4" />
            <h2 className="text-2xl font-display font-bold mb-4 text-center">New quest!</h2>

            <label className="text-sm font-semibold text-cocoa/70 block mb-1">Title</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
              placeholder="Practice 10 bike jumps"
              className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-white shadow-inner font-display text-lg focus:outline-none focus:border-coral"
            />

            <label className="text-sm font-semibold text-cocoa/70 block mt-4 mb-1">Pick an emoji</label>
            <div className="grid grid-cols-8 gap-2">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={[
                    "h-10 w-10 rounded-xl text-xl flex items-center justify-center transition",
                    emoji === e ? "bg-coral text-white shadow-chunky-sm scale-110" : "bg-white",
                  ].join(" ")}
                >
                  {e}
                </button>
              ))}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="btn-ghost flex-1"
                onClick={() => {
                  setTitle("");
                  setEmoji("✨");
                  onClose();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={!title.trim() || submitting}
                onClick={async () => {
                  if (!title.trim()) return;
                  setSubmitting(true);
                  try {
                    await onAdd(title.trim(), emoji);
                    setTitle("");
                    setEmoji("✨");
                    onClose();
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting ? "Adding…" : "Add quest!"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
