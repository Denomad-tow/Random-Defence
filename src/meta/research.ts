import { spendGold } from './gold';

const KEY = 'rd_research';
export const MAX_RESEARCH_LEVEL = 10;

// "일반 연구": 모든 유닛에게 공통으로 적용되는 전투 능력치.
export type GeneralResearchKey = 'attack' | 'attackSpeed';
export const GENERAL_RESEARCH_KEYS: GeneralResearchKey[] = ['attack', 'attackSpeed'];

const GENERAL_BONUS_PER_LEVEL: Record<GeneralResearchKey, number> = {
  attack: 0.05, // 레벨당 전체 공격력 +5%
  attackSpeed: 0.04, // 레벨당 전체 공격속도 +4%
};

const GENERAL_LABEL: Record<GeneralResearchKey, string> = {
  attack: '공격력 연구',
  attackSpeed: '공격속도 연구',
};

// "역할 연구": 역할(특성)별로 그 역할의 위력을 강화한다. 공격력뿐 아니라
// 둔화/중독/방어력 감소처럼 값(value)을 가진 상태 효과의 수치도 같이 커진다.
const ROLE_BONUS_PER_LEVEL = 0.06;

interface ResearchState {
  general: Partial<Record<GeneralResearchKey, number>>;
  role: Record<string, number>;
}

function loadState(): ResearchState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { general: {}, role: {} };
    const parsed = JSON.parse(raw) as Partial<ResearchState>;
    return { general: parsed.general ?? {}, role: parsed.role ?? {} };
  } catch {
    return { general: {}, role: {} };
  }
}

function saveState(state: ResearchState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}

export function getGeneralLabel(key: GeneralResearchKey): string {
  return GENERAL_LABEL[key];
}

export function getGeneralLevel(key: GeneralResearchKey): number {
  return loadState().general[key] ?? 0;
}

export function getRoleLevel(role: string): number {
  return loadState().role[role] ?? 0;
}

export function researchCost(level: number): number {
  return 60 + level * 50;
}

export function levelUpGeneral(key: GeneralResearchKey): boolean {
  const state = loadState();
  const level = state.general[key] ?? 0;
  if (level >= MAX_RESEARCH_LEVEL) return false;
  if (!spendGold(researchCost(level))) return false;

  state.general[key] = level + 1;
  saveState(state);
  return true;
}

export function levelUpRole(role: string): boolean {
  const state = loadState();
  const level = state.role[role] ?? 0;
  if (level >= MAX_RESEARCH_LEVEL) return false;
  if (!spendGold(researchCost(level))) return false;

  state.role[role] = level + 1;
  saveState(state);
  return true;
}

export function generalAttackMultiplier(): number {
  return 1 + getGeneralLevel('attack') * GENERAL_BONUS_PER_LEVEL.attack;
}

export function generalAttackSpeedBonus(): number {
  return getGeneralLevel('attackSpeed') * GENERAL_BONUS_PER_LEVEL.attackSpeed;
}

// 역할별 공격력 배율이자, 그 역할이 가진 상태 효과(둔화%, 중독 피해 등)의
// 수치에도 그대로 곱해 쓰는 공용 배율.
export function roleMultiplier(role: string): number {
  return 1 + getRoleLevel(role) * ROLE_BONUS_PER_LEVEL;
}
