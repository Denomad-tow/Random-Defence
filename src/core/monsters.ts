import type { MonsterShapeId } from './graphics/monster';

export type MonsterKindId = 'normal' | 'elite' | 'boss';

export interface MonsterKind {
  id: MonsterKindId;
  label: string;
  baseHp: number;
  // 길을 따라 이동하는 속도. 단위: 초당 슬롯 칸 몇 개 만큼 이동하는가.
  crawlSpeed: number;
  sizeRatio: number;
  eyeColor: string;
  auraColor?: string;
  manaReward: number;
}

export const MONSTER_KINDS: Record<MonsterKindId, MonsterKind> = {
  normal: {
    id: 'normal',
    label: '그림자 잔당',
    baseHp: 10,
    crawlSpeed: 0.5,
    sizeRatio: 0.55,
    eyeColor: '#ff5d5d',
    manaReward: 1,
  },
  elite: {
    id: 'elite',
    label: '그림자 정예',
    baseHp: 45,
    crawlSpeed: 0.35,
    sizeRatio: 0.75,
    eyeColor: '#ff2e2e',
    auraColor: '#8a4bff',
    manaReward: 5,
  },
  boss: {
    id: 'boss',
    label: '그림자 우두머리',
    baseHp: 220,
    crawlSpeed: 0.22,
    sizeRatio: 1.3,
    eyeColor: '#ff0000',
    auraColor: '#ffcf5a',
    manaReward: 30,
  },
};

// 등급(normal/elite/boss)과는 별개로, 몬스터 겉모습(실루엣 모양)만 다양하게
// 보이도록 판마다/스폰마다 무작위로 고르는 "종류". 능력치에는 영향을 주지
// 않는다 (순수 시각적 다양화).
export interface MonsterSpecies {
  id: MonsterShapeId;
  label: string;
}

export const MONSTER_SPECIES: MonsterSpecies[] = [
  { id: 'wisp', label: '유령형' },
  { id: 'bat', label: '박쥐형' },
  { id: 'wolf', label: '늑대형' },
  { id: 'golem', label: '골렘형' },
  { id: 'spider', label: '거미형' },
  { id: 'slime', label: '점액형' },
];

export function pickRandomSpecies(): MonsterSpecies {
  return MONSTER_SPECIES[Math.floor(Math.random() * MONSTER_SPECIES.length)];
}
