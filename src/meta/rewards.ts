export interface RunReward {
  gold: number;
  boxId: string;
}

export function computeRunReward(stage: number): RunReward {
  const gold = Math.max(10, stage * 8);

  let boxId = 'wood';
  if (stage >= 30) boxId = 'gold';
  else if (stage >= 15) boxId = 'silver';

  return { gold, boxId };
}
