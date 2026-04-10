export const KARABINER_CORE_MODULES = [
  "notes",
  "ai",
  "extensions",
  "search",
  "settings",
] as const;

export type KarabinerCoreModule = (typeof KARABINER_CORE_MODULES)[number];

export type CorePerformanceBudget = {
  startupMs: number;
  firstPaintMs: number;
  noteOpenMs: number;
  aiFirstTokenMs: number;
};

export const DEFAULT_PERFORMANCE_BUDGET: CorePerformanceBudget = {
  startupMs: 450,
  firstPaintMs: 150,
  noteOpenMs: 40,
  aiFirstTokenMs: 900,
};
