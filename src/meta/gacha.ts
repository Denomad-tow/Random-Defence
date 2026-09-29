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

// 상자마다 "이 등급 밑으로는 안 나온다"는 하한선만 다르고, 위로는 모든 상자가 최고 등급(TR)까지
// 나올 수 있다 — 나무 상자에서도 아주 낮은 확률로 TR이 나올 수 있다("전체 상자에서 모든 등급이
// 나오게" 하기 위함). 하한선: 나무 N부터(전 등급) / 은 R부터(N 제외) / 금 SR부터(N,R 제외)
//   다이아 SSR부터(N,R,SR 제외) / 플래티넘 SSSR부터(~SSR 제외) / 미스릴 UR부터(~SSSR 제외)
//   오리하르콘 LR부터(~UR 제외)
// 확률(가중치)은 합이 100이 되게 적는다. 상자가 좋을수록 낮은 등급 비중이 줄고 높은 등급 비중이 늘어난다.
// 값을 바꾸고 싶으면 여기만 고치면 된다. 판 종료 보상으로 어떤 상자를 몇 개 받는지는 meta/rewards.ts에서 정한다.
export const BOX_TYPES: BoxType[] = [
  {
    id: 'wood',
    name: '나무 상자',
    cardCount: 1,
    weights: { normal: 55, uncommon: 25, rare: 11, epic: 5, legendary: 2, mythic: 1, lr: 0.6, gr: 0.3, tr: 0.1 },
  },
  {
    id: 'silver',
    name: '은 상자',
    cardCount: 3,
    weights: { uncommon: 50.5, rare: 25, epic: 12.5, legendary: 6.5, mythic: 3, lr: 1.5, gr: 0.75, tr: 0.25 },
  },
  {
    id: 'gold',
    name: '금 상자',
    cardCount: 5,
    weights: { rare: 46, epic: 25, legendary: 14, mythic: 7.5, lr: 4, gr: 2.2, tr: 1.3 },
  },
  {
    id: 'diamond',
    name: '다이아 상자',
    cardCount: 7,
    weights: { epic: 42, legendary: 25, mythic: 15, lr: 9, gr: 5.5, tr: 3.5 },
  },
  {
    id: 'platinum',
    name: '플래티넘 상자',
    cardCount: 8,
    weights: { legendary: 40, mythic: 26, lr: 17, gr: 11, tr: 6 },
  },
  {
    id: 'mithril',
    name: '미스릴 상자',
    cardCount: 10,
    weights: { mythic: 40, lr: 28, gr: 19, tr: 13 },
  },
  {
    id: 'orichalcum',
    name: '오리하르콘 상자',
    cardCount: 12,
    weights: { lr: 43, gr: 33, tr: 24 },
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
