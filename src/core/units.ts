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
};
