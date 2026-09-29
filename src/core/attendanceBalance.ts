export interface AttendanceReward {
  boxId: 'wood' | 'silver' | 'gold' | 'diamond' | 'platinum' | 'mithril' | 'orichalcum';
  count: number;
}

// 7일 출석 체크 보상표. 순서대로 1~7일차 보상이며, 7일차를 받으면 다시
// 1일차부터 반복된다. 매일 상자 3개씩, 날마다 한 단계 위 상자를 준다.
// 보상을 바꾸고 싶으면 이 배열만 수정하면 된다.
export const ATTENDANCE_REWARDS: AttendanceReward[] = [
  { boxId: 'wood', count: 3 },
  { boxId: 'silver', count: 3 },
  { boxId: 'gold', count: 3 },
  { boxId: 'diamond', count: 3 },
  { boxId: 'platinum', count: 3 },
  { boxId: 'mithril', count: 3 },
  { boxId: 'orichalcum', count: 3 },
];

export const ATTENDANCE_CYCLE_LENGTH = ATTENDANCE_REWARDS.length;
