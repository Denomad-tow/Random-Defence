export interface RunReward {
  gold: number;
  boxId: string;
  boxCount: number;
}

// 판 종료 때 받는 상자: "도달 스테이지가 이 값 이상이면 이 상자를 이만큼" 표.
// 값을 바꾸고 싶으면 이 표만 고치면 된다. (위에서부터 가장 높은 조건이 우선, 표에 없는 낮은 스테이지는 나무 상자 1개)
export const BOX_REWARD_TABLE: Array<{ stage: number; boxId: string; count: number }> = [
  { stage: 30, boxId: 'silver', count: 1 },
  { stage: 50, boxId: 'silver', count: 2 },
  { stage: 70, boxId: 'gold', count: 1 },
  { stage: 90, boxId: 'gold', count: 2 },
  { stage: 110, boxId: 'diamond', count: 1 },
  { stage: 130, boxId: 'diamond', count: 2 },
  { stage: 150, boxId: 'platinum', count: 1 },
  { stage: 170, boxId: 'platinum', count: 2 },
  { stage: 190, boxId: 'mithril', count: 1 },
  { stage: 210, boxId: 'mithril', count: 2 },
  { stage: 230, boxId: 'orichalcum', count: 1 },
  { stage: 250, boxId: 'orichalcum', count: 2 },
];

export function computeRunReward(stage: number): RunReward {
  const gold = Math.max(10, stage * 8);

  let boxId = 'wood';
  let boxCount = 1;
  BOX_REWARD_TABLE.forEach((tier) => {
    if (stage >= tier.stage) {
      boxId = tier.boxId;
      boxCount = tier.count;
    }
  });

  return { gold, boxId, boxCount };
}
