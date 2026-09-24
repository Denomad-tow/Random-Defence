import unitsData from '../data/units.json';

export interface UnitEffect {
  type: string;
  [key: string]: unknown;
}

export interface UnitDef {
  id: string;
  name: string;
  rarity: string;
  role: string;
  attack: number;
  attackSpeed: number;
  range: number;
  effects: UnitEffect[];
}

export const NORMAL_UNITS: UnitDef[] = unitsData as UnitDef[];
export const DECK_SIZE = 5;
export const MAX_STAR = 7;
export const STARTER_COUNT = 5;

// 지금 단계에서 실제로 얻을 수 있는 유닛 풀. 고급 이상 등급은 나중에
// 강화/뽑기 등급 체계가 갖춰지면 연다.
export const OBTAINABLE_UNITS: UnitDef[] = NORMAL_UNITS.filter((u) => u.rarity === 'normal');

export function pickRandomUnit(pool: UnitDef[] = NORMAL_UNITS): UnitDef {
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

// 컬렉션 화면 등에서 보여주는 역할별 짧은 특성 설명.
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  single: '강력한 단일 공격',
  aoe: '범위 내 다중 공격',
  slow: '이동속도 감소',
  stun: '확률로 기절',
  poison: '지속 피해(독)',
  armorBreak: '방어력 감소',
  buff: '공격속도 증가',
  goldGen: '마나 생성',
  pierce: '관통 공격',
  multishot: '다중 사격',
  chain: '사슬 번개',
  execute: '확인사살',
  manaLeech: '마나 흡수',
  frostAura: '냉기 결계',
  critStrike: '치명 강타',
};

// 도감에서 보여주는 역할 분류(공격형/제어형/버프형/자원형).
export const ROLE_CATEGORIES: Record<string, string> = {
  single: '공격형',
  aoe: '공격형',
  pierce: '공격형',
  multishot: '공격형',
  chain: '공격형',
  execute: '공격형',
  critStrike: '공격형',
  poison: '공격형',
  slow: '제어형',
  stun: '제어형',
  armorBreak: '제어형',
  frostAura: '제어형',
  buff: '버프형',
  goldGen: '자원형',
  manaLeech: '자원형',
};

export const ROLE_ATTACK_COLORS: Record<string, number> = {
  single: 0xdfe6f0,
  aoe: 0xff8a3d,
  slow: 0x6fc8ff,
  stun: 0xffe066,
  poison: 0x6fe06f,
  armorBreak: 0xb0b0b8,
  buff: 0xf3c96b,
  pierce: 0x9fd8ff,
  multishot: 0xffb454,
  chain: 0x7ef0ff,
  execute: 0xff4d6d,
  manaLeech: 0x8ee6c0,
  critStrike: 0xffe066,
};
