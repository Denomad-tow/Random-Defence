export type MonsterKindId = 'normal' | 'elite' | 'boss';

export interface MonsterKind {
  id: MonsterKindId;
  label: string;
  baseHp: number;
  speed: number;
  sizeRatio: number;
  eyeColor: string;
  auraColor?: string;
}

export const MONSTER_KINDS: Record<MonsterKindId, MonsterKind> = {
  normal: {
    id: 'normal',
    label: '그림자 잔당',
    baseHp: 10,
    speed: 0.16,
    sizeRatio: 0.55,
    eyeColor: '#ff5d5d',
  },
  elite: {
    id: 'elite',
    label: '그림자 정예',
    baseHp: 45,
    speed: 0.12,
    sizeRatio: 0.75,
    eyeColor: '#ff2e2e',
    auraColor: '#8a4bff',
  },
  boss: {
    id: 'boss',
    label: '그림자 우두머리',
    baseHp: 220,
    speed: 0.08,
    sizeRatio: 1.3,
    eyeColor: '#ff0000',
    auraColor: '#ffcf5a',
  },
};
