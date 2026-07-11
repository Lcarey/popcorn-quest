// =============================================================================
// Popcorn Quest — shared types & XP rules
// =============================================================================

export type Cadence = "daily" | "weekly";

/** Weekly templates: count distinct days vs sum numeric units across the week. */
export type WeeklyTrack = "sessions" | "cumulative";

export interface TaskTemplate {
  id: string;
  title: string;
  emoji: string;
  cadence: Cadence;
  // sessions = times per week (1–7); cumulative = total units (e.g. 500). Daily = 1.
  weeklyTarget: number;
  weeklyTrack?: WeeklyTrack;
  // When true the task can be logged multiple times (shows +/- and earns XP per
  // rep). When false it's a single check. Daily-repeatable requires one per day
  // (e.g. "1 page of Beast Academy") but extra reps still earn XP.
  repeatable: boolean;
  createdAt: string; // ISO
}

export interface AdhocTask {
  id: string;
  title: string;
  emoji: string;
  createdAt: string;
  // ISO date this ad-hoc task is scoped to (yyyy-mm-dd).
  date: string;
  done: boolean;
}

export interface Completion {
  templateId: string;
  // For weekly tasks, multiple completions per week share the templateId but
  // distinct dates. For daily tasks, at most one per date.
  date: string; // yyyy-mm-dd
  completedAt: string; // ISO
  /** Cumulative weekly: units logged that day. Omit = 1 (legacy ticks). */
  amount?: number;
}

export interface PetState {
  name: string;
  // Lifetime XP earned. Drives level and cosmetic unlocks; only spending-neutral
  // (earns raise it, undos lower it) — buying rewards never touches it.
  xp: number;
  // Wallet balance available to spend on rewards / streak shields. Earns raise
  // it, undos lower it, purchases spend it, denied claims refund it. Never
  // affects level.
  spendableXp: number;
  level: number;
  // Cosmetic IDs the kid has unlocked (collar, hat, scene, etc.)
  unlocked: string[];
  // Currently equipped cosmetics: { slot: cosmeticId }
  equipped: Record<string, string>;
  // Mood is computed client-side from today's completion ratio, but we also
  // surface a server-stored "lastMood" snapshot for resilience.
  lastMood?: PetMood;
}

export type PetMood = "sleepy" | "neutral" | "happy" | "ecstatic";

export interface FamilyMeta {
  pet: PetState;
  streak: number; // consecutive days with all daily tasks complete
  lastStreakDate?: string; // yyyy-mm-dd of last all-done day
  // Streak shields: each one auto-covers a single missed day so the streak
  // survives. Bought with XP from the reward shop.
  streakShields?: number;
  createdAt: string;
}

export const STREAK_SHIELD = {
  cost: 30, // XP
  max: 2,
} as const;

// =============================================================================
// Rewards shop
// =============================================================================

export interface Reward {
  id: string;
  title: string;
  emoji: string;
  cost: number; // XP
  createdAt: string;
}

export type RewardClaimStatus = "pending" | "approved" | "denied";

export interface RewardClaim {
  id: string;
  rewardId: string;
  rewardTitle: string;
  rewardEmoji: string;
  cost: number;
  status: RewardClaimStatus;
  claimedAt: string;
  resolvedAt?: string;
}

export interface CreateRewardRequest {
  pin?: string;
  title: string;
  emoji: string;
  cost: number;
}

export interface DeleteRewardRequest {
  pin?: string;
}

export interface ClaimRewardRequest {
  rewardId: string;
}

export interface ResolveClaimRequest {
  pin?: string;
  approve: boolean;
}

// Kid-facing: equip/unequip an unlocked cosmetic (no PIN).
export interface EquipRequest {
  slot: Cosmetic["slot"];
  /** null clears the slot (e.g. take the hat off). */
  cosmeticId: string | null;
}

export interface EquipResponse {
  pet: PetState;
}

export interface BuyShieldResponse {
  family: FamilyMeta;
}

// =============================================================================
// Today view — what /state returns
// =============================================================================

export interface DailyTaskView {
  template: TaskTemplate;
  completedToday: boolean;
  /** Repeatable daily only: number of times logged today (>= 1 when done). */
  amountToday?: number;
}

export interface WeeklyTaskView {
  template: TaskTemplate;
  doneThisWeek: number;
  target: number;
  // Whether already completed for this specific date (you can only tick a
  // weekly task once per day, but multiple times per week).
  completedToday: boolean;
  /** Cumulative weekly only: units logged for this view's date. */
  amountToday?: number;
}

export interface TodayState {
  family: FamilyMeta;
  date: string; // yyyy-mm-dd (the date this view is for)
  weekStart: string; // yyyy-mm-dd (Sunday of this week)
  daily: DailyTaskView[];
  weekly: WeeklyTaskView[];
  adhoc: AdhocTask[];
  // Percent of today's required tasks complete (daily 100% + weekly target met).
  // Used for Popcorn's mood.
  todayProgress: number; // 0..1
  rewards: Reward[];
  pendingClaims: RewardClaim[];
  // Optional last-N-days summary for the home heatmap.
  history?: DailyHistoryEntry[];
}

export interface DailyHistoryEntry {
  date: string; // yyyy-mm-dd
  required: number;
  completed: number;
  // 0..1, simple completed/required ratio (rounded to 0 if no required tasks).
  ratio: number;
  // Total XP earned that day (task completions, bonuses, side quests; excludes
  // spends, undos, and refunds).
  xpEarned: number;
}

// =============================================================================
// API request/response shapes
// =============================================================================

export interface SetupRequest {
  pin: string; // 4-digit, validated server-side
  petName: string;
  seedExamples?: boolean;
}

export interface SetupResponse {
  family: FamilyMeta;
}

export interface CompleteRequest {
  templateId?: string;
  adhocId?: string;
  date: string; // yyyy-mm-dd
  // toggle: if currently complete, undo
  toggle?: boolean;
  /** Cumulative weekly: units for this date. */
  amount?: number;
  /** Weekly sessions: +1 adds a check, -1 removes one. */
  delta?: number;
}

export interface CompleteResponse {
  state: TodayState;
  // XP info for celebration animation
  xpDelta: number;
  leveledUp: boolean;
  unlocked?: string;
}

export interface AdhocRequest {
  title: string;
  emoji: string;
  date: string;
}

export interface CreateTemplateRequest {
  pin?: string;
  title: string;
  emoji: string;
  cadence: Cadence;
  weeklyTarget?: number;
  weeklyTrack?: WeeklyTrack;
  repeatable?: boolean;
}

export interface UpdateTemplateRequest {
  pin?: string;
  title?: string;
  emoji?: string;
  cadence?: Cadence;
  weeklyTarget?: number;
  weeklyTrack?: WeeklyTrack;
  repeatable?: boolean;
}

export interface DeleteTemplateRequest {
  pin?: string;
}

// =============================================================================
// Weather (home screen, proxied from OpenWeather via API)
// =============================================================================

/** Rendered as emoji on the kid home screen (sunny / cloudy / rain / snow / windy). */
export type WeatherCondition = "sunny" | "cloudy" | "rain" | "snow" | "windy";

export interface WeatherToday {
  currentTempF: number | null;
  minTempF: number | null;
  maxTempF: number | null;
  /** 0–100, max POP for local calendar day. */
  rainPopPercent: number | null;
  condition: WeatherCondition | null;
}

// =============================================================================
// Calendar (ICS feeds, proxied via API)
// =============================================================================

export interface CalendarEvent {
  /** ISO 8601 start instant */
  start: string;
  end?: string;
  title: string;
  location?: string;
  allDay?: boolean;
  /** 0-based line index in calendar-feeds.txt (which subscribed calendar this came from). */
  feedIndex: number;
}

export interface CalendarEventsResponse {
  events: CalendarEvent[];
  /** Present when one or more feeds failed but others may have succeeded. */
  errors?: string[];
}

// =============================================================================
// XP audit log
// =============================================================================

/** A single XP change, recorded so a parent can audit how XP was earned/spent. */
export interface XpLogEntry {
  id: string;
  at: string; // ISO timestamp
  amount: number; // signed: +earned, -spent/undone
  reason: string; // e.g. "Completed: Beast Academy page"
  balance?: number; // pet.xp after this change
  // Local day (yyyy-mm-dd) this change is attributed to. Used to bucket XP per
  // day for the history heatmap (at is UTC and can cross the local date line).
  date?: string;
}

export interface XpLogResponse {
  entries: XpLogEntry[];
}

// =============================================================================
// XP / leveling rules
// =============================================================================

export const XP_PER = {
  daily: 5,
  weekly: 15,
  adhoc: 5,
  fullDayBonus: 10,
} as const;

// XP required to reach level N from level N-1.
// Linear-ish curve: 50, 75, 100, 125, ...
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 25 + 25 * level;
}

// Total cumulative XP at start of `level`.
export function totalXpAtLevel(level: number): number {
  let total = 0;
  for (let l = 2; l <= level; l++) total += xpForLevel(l);
  return total;
}

export function levelFromXp(xp: number): { level: number; intoLevel: number; nextLevelXp: number } {
  let level = 1;
  let total = 0;
  // safety cap at 100
  while (level < 100) {
    const need = xpForLevel(level + 1);
    if (total + need > xp) break;
    total += need;
    level++;
  }
  return {
    level,
    intoLevel: xp - total,
    nextLevelXp: xpForLevel(level + 1),
  };
}

// =============================================================================
// Cosmetic catalog
// =============================================================================

export interface Cosmetic {
  id: string;
  slot: "collar" | "hat" | "scene" | "treat";
  name: string;
  emoji: string;
  unlocksAtLevel: number;
}

export const COSMETICS: Cosmetic[] = [
  { id: "collar-red", slot: "collar", name: "Red Collar", emoji: "🔴", unlocksAtLevel: 1 },
  { id: "scene-yard", slot: "scene", name: "Sunny Yard", emoji: "🌻", unlocksAtLevel: 1 },
  { id: "treat-bone", slot: "treat", name: "Bone Treat", emoji: "🦴", unlocksAtLevel: 2 },
  { id: "collar-rainbow", slot: "collar", name: "Rainbow Collar", emoji: "🌈", unlocksAtLevel: 3 },
  { id: "hat-party", slot: "hat", name: "Party Hat", emoji: "🎉", unlocksAtLevel: 4 },
  { id: "scene-park", slot: "scene", name: "Dog Park", emoji: "🏞️", unlocksAtLevel: 5 },
  { id: "hat-crown", slot: "hat", name: "Royal Crown", emoji: "👑", unlocksAtLevel: 7 },
  { id: "scene-beach", slot: "scene", name: "Beach Day", emoji: "🏖️", unlocksAtLevel: 9 },
  { id: "hat-graduation", slot: "hat", name: "Graduation Cap", emoji: "🎓", unlocksAtLevel: 12 },
  { id: "scene-space", slot: "scene", name: "Outer Space", emoji: "🚀", unlocksAtLevel: 15 },
];

export function cosmeticsUnlockedAt(level: number): Cosmetic[] {
  return COSMETICS.filter((c) => c.unlocksAtLevel <= level);
}

/** The next cosmetic the kid will unlock by leveling, if any remain. */
export function nextCosmeticUnlock(level: number): Cosmetic | undefined {
  return COSMETICS.filter((c) => c.unlocksAtLevel > level).sort(
    (a, b) => a.unlocksAtLevel - b.unlocksAtLevel,
  )[0];
}

// =============================================================================
// Date helpers
// =============================================================================

export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Returns yyyy-mm-dd of Sunday (local) for the week containing `d`.
export function weekStartKey(d: Date = new Date()): string {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun..6=Sat
  date.setDate(date.getDate() - day);
  return todayKey(date);
}

export function moodFromProgress(p: number): PetMood {
  if (p >= 1) return "ecstatic";
  if (p >= 0.6) return "happy";
  if (p >= 0.2) return "neutral";
  return "sleepy";
}
