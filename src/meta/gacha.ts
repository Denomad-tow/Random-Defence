import { NORMAL_UNITS, type UnitDef } from '../core/units';

export interface BoxType {
  id: string;
  name: string;
  cardCount: number;
  weights: Record<string, number>;
}

export const RARITY_ORDER = ['normal', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

export const BOX_TYPES: BoxType[] = [
  {
    id: 'wood',
    name: '나무 상자',
    cardCount: 1,
    weights: { normal: 50, uncommon: 28, rare: 14, epic: 6, legendary: 1.7, mythic: 0.3 },
  },
  {
    id: 'silver',
    name: '은 상자',
    cardCount: 3,
    weights: { normal: 35, uncommon: 30, rare: 22, epic: 10, legendary: 2.5, mythic: 0.5 },
  },
  {
    id: 'gold',
    name: '금 상자',
    cardCount: 5,
    weights: { normal: 20, uncommon: 28, rare: 28, epic: 16, legendary: 6, mythic: 2 },
  },
];

export function getBoxType(id: string): BoxType {
  return BOX_TYPES.find((b) => b.id === id) ?? BOX_TYPES[0];
}

const PITY_KEY = 'rd_gacha_pity';
export const MYTHIC_PITY_LIMIT = 200;

export function loadPity(): number {
  try {
    const raw = localStorage.getItem(PITY_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function savePity(count: number): void {
  try {
    localStorage.setItem(PITY_KEY, String(count));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}

function rollRarity(weights: Record<string, number>): string {
  const total = RARITY_ORDER.reduce((sum, r) => sum + (weights[r] ?? 0), 0);
  let roll = Math.random() * total;

  for (const rarity of RARITY_ORDER) {
    roll -= weights[rarity] ?? 0;
    if (roll <= 0) return rarity;
  }

  return RARITY_ORDER[0];
}

export interface DrawnCard {
  unit: UnitDef;
  rarity: string;
  pityTriggered: boolean;
}

export function openBox(box: BoxType): DrawnCard[] {
  let pity = loadPity();
  const drawn: DrawnCard[] = [];

  for (let i = 0; i < box.cardCount; i += 1) {
    pity += 1;
    let rarity: string;
    let pityTriggered = false;

    if (pity >= MYTHIC_PITY_LIMIT) {
      rarity = 'mythic';
      pityTriggered = true;
    } else {
      rarity = rollRarity(box.weights);
    }

    if (rarity === 'mythic') pity = 0;

    const candidates = NORMAL_UNITS.filter((u) => u.rarity === rarity);
    const unit = candidates[Math.floor(Math.random() * candidates.length)];
    drawn.push({ unit, rarity, pityTriggered });
  }

  savePity(pity);
  return drawn;
}
