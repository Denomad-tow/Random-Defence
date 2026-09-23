export const STARTING_MANA = 50;
export const SUMMON_BASE_COST = 10;
export const SUMMON_COST_STEP = 10;

export interface EconomyState {
  mana: number;
  summonCount: number;
}

export function createInitialEconomy(): EconomyState {
  return { mana: STARTING_MANA, summonCount: 0 };
}

export function currentSummonCost(state: EconomyState): number {
  return SUMMON_BASE_COST + state.summonCount * SUMMON_COST_STEP;
}

export function canAffordSummon(state: EconomyState): boolean {
  return state.mana >= currentSummonCost(state);
}

export function spendForSummon(state: EconomyState): EconomyState {
  return {
    mana: state.mana - currentSummonCost(state),
    summonCount: state.summonCount + 1,
  };
}
