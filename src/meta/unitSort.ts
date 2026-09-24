import type { UnitDef } from '../core/units';
import { RARITY_ORDER } from './gacha';
import { getUnitLevel } from './levels';

export function sortByRarityThenLevel(units: UnitDef[]): UnitDef[] {
  return [...units].sort((a, b) => {
    const rarityDiff = RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
    if (rarityDiff !== 0) return rarityDiff;
    return getUnitLevel(b.id) - getUnitLevel(a.id);
  });
}
