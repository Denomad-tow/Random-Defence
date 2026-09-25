export interface AttendanceReward {
  boxId: 'wood' | 'silver' | 'gold' | 'diamond';
  count: number;
}

// 7일 출석 체크 보상표. 순서대로 1~7일차 보상이며, 7일차를 받으면 다시
// 1일차부터 반복된다. 보상을 바꾸고 싶으면 이 배열만 수정하면 된다.
export const ATTENDANCE_REWARDS: AttendanceReward[] = [
  { boxId: 'silver', count: 1 },
  { boxId: 'silver', count: 2 },
  { boxId: 'gold', count: 1 },
  { boxId: 'silver', count: 3 },
  { boxId: 'silver', count: 4 },
  { boxId: 'gold', count: 2 },
  { boxId: 'diamond', count: 1 },
];

export const ATTENDANCE_CYCLE_LENGTH = ATTENDANCE_REWARDS.length;
