const LEVELS_KEY = 'rd_levels';
export const MAX_UNIT_LEVEL = 15;
const LEVEL_STAT_GROWTH = 0.06;
const LEVEL_UP_GOLD_STEP = 15;

export function loadLevels(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LEVELS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveLevels(levels: Record<string, number>): void {
  try {
    localStorage.setItem(LEVELS_KEY, JSON.stringify(levels));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}

export function getUnitLevel(unitId: string): number {
  return loadLevels()[unitId] ?? 1;
}

export function setUnitLevel(unitId: string, level: number): void {
  const levels = loadLevels();
  levels[unitId] = level;
  saveLevels(levels);
}

export interface LevelUpCost {
  duplicates: number;
  gold: number;
}

export function levelUpCost(level: number): LevelUpCost {
  return { duplicates: level, gold: level * LEVEL_UP_GOLD_STEP };
}

export function availableDuplicates(ownedCount: number): number {
  return Math.max(0, ownedCount - 1);
}

export function levelStatMultiplier(level: number): number {
  return 1 + (level - 1) * LEVEL_STAT_GROWTH;
}
