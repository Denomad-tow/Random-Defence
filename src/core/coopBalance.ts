// 협동 파티전 "인원별 난이도 조절" 수치. 인원이 많을수록 몬스터 체력이 세지는
// 대신, 다 같이 때리는 화력도 늘어나서 결과적으로 더 멀리 갈 수 있다. 보상은
// 도달 스테이지 기준(meta/rewards.ts)을 그대로 쓰고 별도 인원 배율은 없다 —
// 더 멀리 가면 자연히 더 많이 받는 구조라 단순하다.
//
// 값을 바꾸고 싶으면 이 파일만 고치면 된다.
export const COOP_HP_PER_EXTRA_MEMBER = 0.5; // 인원 1명 늘어날 때마다 몬스터 체력 +50%

export function coopHpMultiplier(partySize: number): number {
  return 1 + Math.max(0, partySize - 1) * COOP_HP_PER_EXTRA_MEMBER;
}
