// 합성(별) 밸런스 수치. 값을 바꾸고 싶으면 이 파일만 고치면 된다.
//
// 별이 1 오를 때마다 공격력이 몇 배로 커지는가.
//   ★1 ×1 / ★2 ×1.5 / ★3 ×2.25 / ★4 ×3.4 / ★5 ×5.1 / ★6 ×7.6 / ★7 ×11.4
export const STAR_DAMAGE_PER_STEP = 1.5;

// 별이 1 오를 때마다 공격 속도가 몇 배로 빨라지는가. (아래 상한까지)
// 같은 유닛 2개를 합치면 1개가 되므로, 별 1개당 화력(공격력×공격속도)이 2배보다 커야 합성이 이득이다.
// 공격력만 1.5배로 하면 합성할수록 오히려 약해진다(시뮬레이션: 합성 안 함 30스테이지 vs 28스테이지).
// 공격력 1.5배 + 공격속도 1.5배 = 화력 2.25배로 맞춰서, 숫자가 튀지 않으면서도 합성이 확실히 이득이 되게 했다.
export const STAR_SPEED_PER_STEP = 1.5;
export const MAX_STAR_SPEED_MULTIPLIER = 4; // 공격이 너무 빨라져 화면·소리가 정신없어지지 않게 하는 상한

// 둔화·방어력 감소·버프·냉기 결계·마나 생성처럼 "수치가 효과 크기인" 능력은 공격력만큼 크게 키우면
// 몬스터가 완전히 멈추는 등 게임이 깨진다. 그래서 별 1개당 +20%씩만 키운다. (★7이면 ×2.2)
export const STAR_EFFECT_PER_STEP = 0.2;

// 둔화는 아무리 커져도 이 값(85%)을 넘지 않는다. (100%면 몬스터가 영원히 멈춘다)
export const MAX_SLOW_FACTOR = 0.85;

export function starDamageMultiplier(star: number): number {
  return Math.pow(STAR_DAMAGE_PER_STEP, Math.max(1, star) - 1);
}

export function starSpeedMultiplier(star: number): number {
  return Math.min(MAX_STAR_SPEED_MULTIPLIER, Math.pow(STAR_SPEED_PER_STEP, Math.max(1, star) - 1));
}

export function starEffectMultiplier(star: number): number {
  return 1 + STAR_EFFECT_PER_STEP * (Math.max(1, star) - 1);
}
