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
