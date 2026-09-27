import { NORMAL_UNITS, type UnitDef } from '../core/units';
import { loadCollection, consumeDuplicates } from './collection';
import { loadGold, spendGold } from './gold';
import { getUnitLevel, setUnitLevel, levelUpCost, availableDuplicates, MAX_UNIT_LEVEL } from './levels';
import { RARITY_ORDER } from './gacha';
import { addStat } from './stats';

// 컬렉션 "일괄 레벨업": 가진 골드와 중복 카드로 올릴 수 있는 유닛을 한꺼번에 올린다.
// 골드가 부족할 때는 덱에 넣은 유닛을 먼저, 그다음 높은 등급 순으로 올리고, 유닛마다 한 단계씩 돌아가며 올려서
// 한 유닛에만 몰리지 않게 한다.

export interface BulkUnitChange {
  unitId: string;
  from: number;
  to: number;
  dups: number;
  gold: number;
}

export interface BulkPlan {
  changes: BulkUnitChange[];
  totalLevels: number;
  totalGold: number;
  totalDups: number;
}

function ownedCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  loadCollection().forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  return counts;
}

// 일괄 레벨업 우선순위: 덱 유닛 → 높은 등급 → 낮은 레벨
function orderedUnits(deckIds: Set<string>, onlyDeck: boolean): UnitDef[] {
  const owned = ownedCounts();
  return NORMAL_UNITS.filter((u) => owned.has(u.id) && (!onlyDeck || deckIds.has(u.id))).sort((a, b) => {
    const deckDiff = Number(deckIds.has(b.id)) - Number(deckIds.has(a.id));
    if (deckDiff !== 0) return deckDiff;
    const rarityDiff = RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
    if (rarityDiff !== 0) return rarityDiff;
    return getUnitLevel(a.id) - getUnitLevel(b.id);
  });
}

// 실제로 바꾸지 않고 "이렇게 올라간다"는 계획만 계산한다.
export function planBulkLevelUp(deckIds: string[], onlyDeck: boolean): BulkPlan {
  const deck = new Set(deckIds);
  const units = orderedUnits(deck, onlyDeck);
  const counts = ownedCounts();

  let gold = loadGold();
  const level = new Map<string, number>(units.map((u) => [u.id, getUnitLevel(u.id)]));
  const dupsLeft = new Map<string, number>(units.map((u) => [u.id, availableDuplicates(counts.get(u.id) ?? 0)]));
  const changes = new Map<string, BulkUnitChange>();

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const unit of units) {
      const current = level.get(unit.id) ?? 1;
      if (current >= MAX_UNIT_LEVEL) continue;
      const cost = levelUpCost(current);
      const left = dupsLeft.get(unit.id) ?? 0;
      if (left < cost.duplicates || gold < cost.gold) continue;

      gold -= cost.gold;
      dupsLeft.set(unit.id, left - cost.duplicates);
      level.set(unit.id, current + 1);
      const change = changes.get(unit.id) ?? { unitId: unit.id, from: current, to: current, dups: 0, gold: 0 };
      change.to = current + 1;
      change.dups += cost.duplicates;
      change.gold += cost.gold;
      changes.set(unit.id, change);
      progressed = true;
    }
  }

  const list = Array.from(changes.values());
  return {
    changes: list,
    totalLevels: list.reduce((sum, c) => sum + (c.to - c.from), 0),
    totalGold: list.reduce((sum, c) => sum + c.gold, 0),
    totalDups: list.reduce((sum, c) => sum + c.dups, 0),
  };
}

// 계획대로 실제로 적용한다. (골드는 한 번에, 중복 카드와 레벨은 유닛별로 한 번씩만 저장한다)
export function applyBulkLevelUp(plan: BulkPlan): boolean {
  if (plan.totalLevels === 0) return false;
  if (!spendGold(plan.totalGold)) return false;
  plan.changes.forEach((change) => {
    consumeDuplicates(change.unitId, change.dups);
    setUnitLevel(change.unitId, change.to);
  });
  addStat('levelUps', plan.totalLevels);
  return true;
}
