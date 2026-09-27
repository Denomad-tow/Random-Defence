import { DECK_SIZE, type UnitDef } from './units';
import { RARITY_ORDER } from '../meta/gacha';
import { getUnitLevel } from '../meta/levels';
import { ROLE_SIGILS } from './graphics/sigils';

// 덱 추천: 가진 유닛 중에서 역할이 잘 어울리는 5종 조합을 여러 가지 만들어 보여준다.
// 각 추천은 "슬롯"(어떤 역할을 넣을지)의 목록이고, 슬롯마다 가진 유닛 중 가장 강한 것(등급 → 레벨 순)을 고른다.

export interface DeckRecommendation {
  id: string;
  title: string;
  desc: string;
  units: UnitDef[];
}

interface Template {
  id: string;
  title: string;
  desc: string;
  slots: string[][]; // 슬롯마다 "이 중 하나"인 역할 목록
  sameRarity?: boolean; // 한 등급으로만 맞추는 합성 특화형
}

const TEMPLATES: Template[] = [
  {
    id: 'balanced',
    title: '균형형',
    desc: '딜러 + 광역 + 제어 + 버프 + 보조. 처음 쓰기 좋은 무난한 조합',
    slots: [
      ['single', 'critStrike', 'execute'],
      ['aoe', 'chain', 'pierce', 'multishot'],
      ['slow', 'stun', 'frostAura'],
      ['buff'],
      ['goldGen', 'armorBreak', 'poison'],
    ],
  },
  {
    id: 'firepower',
    title: '화력 집중형',
    desc: '공격 유닛 위주에 공속 버프. 몬스터를 빨리 녹이는 조합',
    slots: [
      ['single', 'critStrike'],
      ['execute', 'multishot'],
      ['aoe', 'chain'],
      ['buff'],
      ['armorBreak'],
    ],
  },
  {
    id: 'swarm',
    title: '광역 몰이형',
    desc: '몬스터가 뭉쳐서 올 때 강함. 광역·관통·둔화로 한꺼번에 처리',
    slots: [['aoe'], ['chain', 'pierce'], ['slow', 'frostAura'], ['buff'], ['poison', 'multishot']],
  },
  {
    id: 'boss',
    title: '보스 킬러형',
    desc: '체력 높은 보스에 강함. 처형·치명타·방어 감소로 큰 피해',
    slots: [['execute', 'critStrike'], ['single'], ['armorBreak'], ['buff'], ['stun', 'slow']],
  },
  {
    id: 'economy',
    title: '성장·마나형',
    desc: '마나를 많이 벌어 더 빨리 소환·강화. 초반 성장이 빠름',
    slots: [['goldGen'], ['manaLeech'], ['buff'], ['single', 'critStrike'], ['aoe', 'chain']],
  },
  {
    id: 'merge',
    title: '합성 특화형',
    desc: '같은 등급끼리만 골라서, 합성해도 덱 안의 유닛(같은 등급)으로만 바뀌어요',
    sameRarity: true,
    slots: [
      ['single', 'critStrike', 'execute'],
      ['aoe', 'chain', 'pierce', 'multishot'],
      ['slow', 'stun', 'frostAura'],
      ['buff'],
      ['goldGen', 'armorBreak', 'poison', 'manaLeech'],
    ],
  },
];

function score(unit: UnitDef): number {
  const rarity = RARITY_ORDER.indexOf(unit.rarity);
  return rarity * 100 + getUnitLevel(unit.id) * 4 + Math.min(20, (unit.attack * unit.attackSpeed) / 10);
}

function pickBySlots(pool: UnitDef[], slots: string[][]): UnitDef[] {
  const picked: UnitDef[] = [];
  const used = new Set<string>();

  slots.forEach((roles) => {
    const best = pool
      .filter((u) => roles.includes(u.role) && !used.has(u.id))
      .sort((a, b) => score(b) - score(a))[0];
    if (best) {
      picked.push(best);
      used.add(best.id);
    }
  });

  // 비는 슬롯(그 역할 유닛이 없을 때)은 남은 유닛 중 가장 강한 것으로 채운다.
  pool
    .filter((u) => !used.has(u.id))
    .sort((a, b) => score(b) - score(a))
    .slice(0, Math.max(0, DECK_SIZE - picked.length))
    .forEach((u) => picked.push(u));

  return picked.slice(0, DECK_SIZE);
}

// 같은 등급끼리 역할을 가장 넓게 채울 수 있는 등급을 찾는다(높은 등급 우선).
function bestSingleRarityPool(owned: UnitDef[], slots: string[][]): UnitDef[] {
  let best: UnitDef[] = [];
  let bestKey = -1;
  RARITY_ORDER.forEach((rarity, index) => {
    const pool = owned.filter((u) => u.rarity === rarity);
    if (pool.length < 2) return;
    const covered = slots.filter((roles) => pool.some((u) => roles.includes(u.role))).length;
    const key = covered * 100 + index;
    if (key > bestKey) {
      bestKey = key;
      best = pool;
    }
  });
  return best;
}

export function recommendDecks(owned: UnitDef[]): DeckRecommendation[] {
  const result: DeckRecommendation[] = [];
  const seen = new Set<string>();

  TEMPLATES.forEach((template) => {
    const pool = template.sameRarity ? bestSingleRarityPool(owned, template.slots) : owned;
    if (pool.length === 0) return;
    let units = pickBySlots(pool, template.slots);
    // 같은 등급 유닛이 5종보다 적으면 부족한 만큼만 채운다(덱은 5종 미만이어도 저장·시작 가능).
    if (units.length === 0) return;

    const key = units
      .map((u) => u.id)
      .sort()
      .join(',');
    if (seen.has(key)) return;
    seen.add(key);

    units = [...units];
    result.push({ id: template.id, title: template.title, desc: template.desc, units });
  });

  return result;
}

export function roleLabel(unit: UnitDef): string {
  return ROLE_SIGILS[unit.role]?.label ?? unit.role;
}
