import type { MonsterKindId } from './monsters';

export const MONSTERS_PER_STAGE = 10;
export const STAGES_PER_BOSS = 10;
export const STAGE_HP_GROWTH = 1.12;

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
