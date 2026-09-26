// 합성(별) 밸런스 수치. 값을 바꾸고 싶으면 이 파일만 고치면 된다.
//
// 별이 1 오를 때마다 공격력이 몇 배로 커지는가. 같은 유닛 2개를 합치면 1개가 되므로 2배보다 커야
// 합성이 이득이다. 2.5배로 정한 이유(시뮬레이션): 합성 보너스가 없을 때 중간 도달 스테이지가 약 25,
// 2.5배일 때 약 32(+28%)로, 합성이 확실히 도움이 되지만 게임이 시시해질 만큼은 아니다.
//   ★1 ×1 / ★2 ×2.5 / ★3 ×6.25 / ★4 ×15.6 / ★5 ×39 / ★6 ×98 / ★7 ×244
// (★5 이상은 소환 비용이 워낙 빠르게 올라서 실제로는 거의 만들 수 없는 "목표"에 가깝다.)
export const STAR_DAMAGE_PER_STEP = 2.5;

// 둔화·방어력 감소·버프·냉기 결계·마나 생성처럼 "수치가 효과 크기인" 능력은 공격력만큼 크게 키우면
// 몬스터가 완전히 멈추는 등 게임이 깨진다. 그래서 별 1개당 +20%씩만 키운다. (★7이면 ×2.2)
export const STAR_EFFECT_PER_STEP = 0.2;

// 둔화는 아무리 커져도 이 값(85%)을 넘지 않는다. (100%면 몬스터가 영원히 멈춘다)
export const MAX_SLOW_FACTOR = 0.85;

export function starDamageMultiplier(star: number): number {
  return Math.pow(STAR_DAMAGE_PER_STEP, Math.max(1, star) - 1);
}

export function starEffectMultiplier(star: number): number {
  return 1 + STAR_EFFECT_PER_STEP * (Math.max(1, star) - 1);
}
