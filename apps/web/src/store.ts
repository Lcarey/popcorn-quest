// =============================================================================
// Tiny Zustand store: just the familyId we picked up at setup, plus a parent
// "session" PIN cached in memory (not persisted) for the current parent panel.
// =============================================================================

import { create } from "zustand";

const FAMILY_KEY = "popcorn.familyId";

interface AppStore {
  familyId: string | null;
  parentPin: string | null; // cached only in memory for this session
  setFamilyId(id: string | null): void;
  setParentPin(pin: string | null): void;
  hydrate(): void;
}

export const useApp = create<AppStore>((set) => ({
  familyId: null,
  parentPin: null,
  setFamilyId(id) {
    if (id) localStorage.setItem(FAMILY_KEY, id);
    else localStorage.removeItem(FAMILY_KEY);
    set({ familyId: id });
  },
  setParentPin(pin) {
    set({ parentPin: pin });
  },
  hydrate() {
    const stored = localStorage.getItem(FAMILY_KEY);
    if (stored) set({ familyId: stored });
  },
}));
