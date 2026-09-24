export interface RunReward {
  gold: number;
  boxId: string;
}

export function computeRunReward(stage: number): RunReward {
  const gold = Math.max(10, stage * 8);

  let boxId = 'wood';
  if (stage >= 41) boxId = 'gold';
  else if (stage >= 21) boxId = 'silver';

  return { gold, boxId };
}
