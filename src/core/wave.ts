import type { MonsterKindId } from './monsters';

export const MONSTERS_PER_STAGE = 10;
export const STAGES_PER_BOSS = 10;
// 스테이지마다 몬스터 체력이 몇 배씩(복리로) 커지는가. 1.12 → 1.06으로 낮췄다.
// 이 값이 크면 "전투력을 2배로 올려도 스테이지는 몇 칸밖에 안 오르는" 벽에 빨리 부딪힌다
// (복리라서 전투력을 K배 올렸을 때 더 갈 수 있는 스테이지 수는 log(K)/log(성장률)로, 성장률이
// 클수록 이 값이 작아진다). 시뮬레이션(공용 유닛 덱, 합성 포함, 전투력 배율 1~8배로 비교)상
// 1.12에서는 전투력 8배가 겨우 +25스테이지였지만, 1.06에서는 같은 8배가 +45스테이지로,
// 투자한 만큼 스테이지가 체감되게 올라간다. 그래도 여전히 복리라 후반은 계속 어려워진다.
export const STAGE_HP_GROWTH = 1.06;

export interface WaveState {
  stage: number;
  spawnedInStage: number;
}

export interface SpawnResult {
  kind: MonsterKindId;
  stage: number;
  nextState: WaveState;
}

export function createInitialWaveState(): WaveState {
  return { stage: 1, spawnedInStage: 0 };
}

export function nextSpawn(state: WaveState): SpawnResult {
  const isBossStage = state.stage % STAGES_PER_BOSS === 0;

  if (isBossStage) {
    return {
      kind: 'boss',
      stage: state.stage,
      nextState: { stage: state.stage + 1, spawnedInStage: 0 },
    };
  }

  if (state.spawnedInStage < MONSTERS_PER_STAGE) {
    return {
      kind: 'normal',
      stage: state.stage,
      nextState: { stage: state.stage, spawnedInStage: state.spawnedInStage + 1 },
    };
  }

  return {
    kind: 'elite',
    stage: state.stage,
    nextState: { stage: state.stage + 1, spawnedInStage: 0 },
  };
}

export function stageHpMultiplier(stage: number): number {
  return STAGE_HP_GROWTH ** (stage - 1);
}
