export const MAX_ENHANCE_LEVEL = 5;
export const ENHANCE_BASE_COST = 15;
export const ENHANCE_COST_STEP = 15;
export const ENHANCE_BONUS_PER_LEVEL = 0.2;

export function enhanceCost(level: number): number {
  return ENHANCE_BASE_COST + level * ENHANCE_COST_STEP;
}

export function canEnhance(level: number): boolean {
  return level < MAX_ENHANCE_LEVEL;
}

export function statMultiplier(level: number): number {
  return 1 + level * ENHANCE_BONUS_PER_LEVEL;
}
