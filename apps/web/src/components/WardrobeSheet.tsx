import { AnimatePresence, motion } from "framer-motion";
import { COSMETICS, levelFromXp, type Cosmetic, type PetState } from "@popcorn/shared";

const SLOT_LABELS: Record<Cosmetic["slot"], string> = {
  hat: "Hats 🎩",
  collar: "Collars 🐕",
  scene: "Scenes 🖼️",
  treat: "Treats 🍖",
};

const SLOT_ORDER: Cosmetic["slot"][] = ["hat", "collar", "scene", "treat"];

export function WardrobeSheet({
  open,
  onClose,
  pet,
  onEquip,
}: {
  open: boolean;
  onClose: () => void;
  pet: PetState;
  onEquip: (slot: Cosmetic["slot"], cosmeticId: string | null) => void;
}) {
  const level = levelFromXp(pet.xp).level;

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
            className="fixed left-0 right-0 bottom-0 z-50 bg-cream rounded-t-3xl p-5 pt-3 shadow-chunky max-w-md mx-auto max-h-[80vh] overflow-y-auto no-scrollbar"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
          >
            <div className="w-12 h-1.5 rounded-full bg-cocoa/20 mx-auto mb-4" />
            <h2 className="text-2xl font-display font-bold mb-1 text-center">
              Dress {pet.name}! 👗
            </h2>
            <p className="text-sm text-cocoa/60 text-center mb-4">
              Level up to unlock more looks
            </p>

            {SLOT_ORDER.map((slot) => {
              const items = COSMETICS.filter((c) => c.slot === slot);
              if (items.length === 0) return null;
              return (
                <div key={slot} className="mb-4">
                  <div className="font-display font-semibold text-cocoa mb-2">
                    {SLOT_LABELS[slot]}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {items.map((c) => {
                      const unlocked =
                        pet.unlocked.includes(c.id) || c.unlocksAtLevel <= level;
                      const equipped = pet.equipped[slot] === c.id;
                      return (
                        <motion.button
                          key={c.id}
                          type="button"
                          whileTap={{ scale: unlocked ? 0.93 : 1 }}
                          onClick={() =>
                            unlocked && onEquip(slot, equipped ? null : c.id)
                          }
                          className={[
                            "rounded-2xl p-2 flex flex-col items-center gap-1 border-2 transition",
                            equipped
                              ? "bg-mint/60 border-mint shadow-chunky-sm"
                              : unlocked
                              ? "bg-white border-white shadow-chunky-sm"
                              : "bg-white/50 border-white/50",
                          ].join(" ")}
                        >
                          <div
                            className={[
                              "text-3xl",
                              unlocked ? "" : "grayscale opacity-40",
                            ].join(" ")}
                          >
                            {c.emoji}
                          </div>
                          <div
                            className={[
                              "text-[11px] font-semibold leading-tight text-center",
                              unlocked ? "text-cocoa" : "text-cocoa/50",
                            ].join(" ")}
                          >
                            {c.name}
                          </div>
                          {equipped ? (
                            <div className="chip bg-mint text-[10px] px-2 py-0">
                              Wearing ✓
                            </div>
                          ) : !unlocked ? (
                            <div className="chip bg-white/70 text-[10px] px-2 py-0">
                              🔒 Level {c.unlocksAtLevel}
                            </div>
                          ) : null}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <button type="button" className="btn-primary w-full mt-1" onClick={onClose}>
              Done
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
