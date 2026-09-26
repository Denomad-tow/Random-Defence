export interface RunReward {
  gold: number;
  boxId: string;
}

// 상자 등급이 바뀌는 도달 스테이지. 값을 바꾸고 싶으면 여기만 고치면 된다.
// 합성으로 유닛이 훨씬 강해져서(별당 화력 2.25배) 예전보다 멀리 갈 수 있게 되었으므로 기준을 올렸다.
//   (예전: 은 21 / 금 40 / 다이아 100)
export const SILVER_BOX_STAGE = 25;
export const GOLD_BOX_STAGE = 50;
export const DIAMOND_BOX_STAGE = 120;

export function computeRunReward(stage: number): RunReward {
  const gold = Math.max(10, stage * 8);

  let boxId = 'wood';
  if (stage >= DIAMOND_BOX_STAGE) boxId = 'diamond';
  else if (stage >= GOLD_BOX_STAGE) boxId = 'gold';
  else if (stage >= SILVER_BOX_STAGE) boxId = 'silver';

  return { gold, boxId };
}
