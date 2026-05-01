// =============================================================================
// Tiny Zustand store: just a parent "session" PIN cached in memory (not
// persisted) for the current parent panel.
// =============================================================================

import { create } from "zustand";

interface AppStore {
  parentPin: string | null; // cached only in memory for this session
  setParentPin(pin: string | null): void;
}

export const useApp = create<AppStore>((set) => ({
  parentPin: null,
  setParentPin(pin) {
    set({ parentPin: pin });
  },
}));
