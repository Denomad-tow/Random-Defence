export type MonsterKindId = 'normal' | 'elite' | 'boss';

export interface MonsterKind {
  id: MonsterKindId;
  label: string;
  baseHp: number;
  speed: number;
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
    speed: 0.16,
    crawlSpeed: 0.5,
    sizeRatio: 0.55,
    eyeColor: '#ff5d5d',
    manaReward: 1,
  },
  elite: {
    id: 'elite',
    label: '그림자 정예',
    baseHp: 45,
    speed: 0.12,
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
    speed: 0.08,
    crawlSpeed: 0.22,
    sizeRatio: 1.3,
    eyeColor: '#ff0000',
    auraColor: '#ffcf5a',
    manaReward: 30,
  },
};
