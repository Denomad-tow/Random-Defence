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
