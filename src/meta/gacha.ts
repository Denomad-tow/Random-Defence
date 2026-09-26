import { NORMAL_UNITS, type UnitDef } from '../core/units';

export interface BoxType {
  id: string;
  name: string;
  cardCount: number;
  weights: Record<string, number>;
}

// 등급 순서: N < R < SR < SSR < SSSR < UR < LR < GR < TR (내부 키는 저장 데이터 호환을 위해 옛 이름을 유지)
export const RARITY_ORDER = ['normal', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'lr', 'gr', 'tr'];

// 이 등급(UR) 이상이 나오면 천장 카운트가 0으로 돌아간다.
const PITY_RESET_INDEX = RARITY_ORDER.indexOf('mythic');

// 상자마다 나올 수 있는 등급이 다르다. 표에 없는 등급은 그 상자에서 절대 나오지 않는다.
//   나무: N R SR SSR / 은: N R SR SSR SSSR / 금: R SR SSR SSSR UR / 다이아: SR SSR SSSR UR
//   플래티넘: SR SSR SSSR UR LR / 미스릴: SSR SSSR UR LR GR / 오리하르콘: SSSR UR LR GR TR
// 확률(가중치)은 합이 100이 되게 적는다. 값을 바꾸고 싶으면 여기만 고치면 된다.
// 판 종료 보상으로 어떤 상자를 몇 개 받는지는 meta/rewards.ts에서 정한다.
export const BOX_TYPES: BoxType[] = [
  {
    id: 'wood',
    name: '나무 상자',
    cardCount: 1,
    weights: { normal: 55, uncommon: 30, rare: 12, epic: 3 },
  },
  {
    id: 'silver',
    name: '은 상자',
    cardCount: 3,
    weights: { normal: 30, uncommon: 32, rare: 24, epic: 11, legendary: 3 },
  },
  {
    id: 'gold',
    name: '금 상자',
    cardCount: 5,
    weights: { uncommon: 25, rare: 33, epic: 26, legendary: 12, mythic: 4 },
  },
  {
    id: 'diamond',
    name: '다이아 상자',
    cardCount: 7,
    weights: { rare: 30, epic: 40, legendary: 22, mythic: 8 },
  },
  {
    id: 'platinum',
    name: '플래티넘 상자',
    cardCount: 8,
    weights: { rare: 20, epic: 33, legendary: 28, mythic: 15, lr: 4 },
  },
  {
    id: 'mithril',
    name: '미스릴 상자',
    cardCount: 10,
    weights: { epic: 22, legendary: 34, mythic: 28, lr: 12, gr: 4 },
  },
  {
    id: 'orichalcum',
    name: '오리하르콘 상자',
    cardCount: 12,
    weights: { legendary: 30, mythic: 36, lr: 22, gr: 9, tr: 3 },
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

    if (pity >= MYTHIC_PITY_LIMIT && box.weights.mythic !== undefined) {
      rarity = 'mythic';
      pityTriggered = true;
    } else {
      rarity = rollRarity(box.weights);
    }

    if (RARITY_ORDER.indexOf(rarity) >= PITY_RESET_INDEX) pity = 0;

    const candidates = NORMAL_UNITS.filter((u) => u.rarity === rarity);
    const unit = candidates[Math.floor(Math.random() * candidates.length)];
    drawn.push({ unit, rarity, pityTriggered });
  }

  savePity(pity);
  return drawn;
}
