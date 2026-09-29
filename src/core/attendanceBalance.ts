export type AttendanceBoxId = 'wood' | 'silver' | 'gold' | 'diamond' | 'platinum' | 'mithril' | 'orichalcum';

export interface AttendanceRewardItem {
  boxId: AttendanceBoxId;
  count: number;
}

// 하루치 출석 보상. 보통 상자 하나를 여러 개 주지만, 항목을 여러 개 넣으면
// 그날은 서로 다른 상자를 섞어서 준다(7일차처럼).
export type AttendanceReward = AttendanceRewardItem[];

// 7일 출석 체크 보상표. 순서대로 1~7일차 보상이며, 7일차를 받으면 다시
// 1일차부터 반복된다. 매일 종류마다 상자 3개씩(7일차는 세 종류를 3개씩, 총 9개)를 준다.
// 보상을 바꾸고 싶으면 이 배열만 수정하면 된다.
export const ATTENDANCE_REWARDS: AttendanceReward[] = [
  [{ boxId: 'platinum', count: 3 }],
  [{ boxId: 'mithril', count: 3 }],
  [{ boxId: 'orichalcum', count: 3 }],
  [{ boxId: 'platinum', count: 3 }],
  [{ boxId: 'mithril', count: 3 }],
  [{ boxId: 'orichalcum', count: 3 }],
  [
    { boxId: 'platinum', count: 3 },
    { boxId: 'mithril', count: 3 },
    { boxId: 'orichalcum', count: 3 },
  ],
];

export const ATTENDANCE_CYCLE_LENGTH = ATTENDANCE_REWARDS.length;
