// 게임 한 판 동안(합성과 별개로) 유닛을 눌러 올리는 임시 강화. 판이 끝나면 초기화된다.
// 최대 5강 → 10강으로 늘림. 비용은 그대로 선형으로 늘고(15,30,...,150 마나),
// 전투력도 같은 공식(레벨당 +20%)으로 계속 늘어나서 10강이면 공격력이 기본의 3배가 된다.
export const MAX_ENHANCE_LEVEL = 10;
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
