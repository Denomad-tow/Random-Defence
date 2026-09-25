export const DPR = window.devicePixelRatio || 1;

export function px(value: number): number {
  return Math.round(value * DPR);
}

// 화면 폭에 비례해서 계산한 글씨 크기가 PC처럼 넓은 화면에서 너무 커지지 않도록
// 상한(CSS 픽셀 기준)을 둔다. 휴대폰처럼 좁은 화면에서는 계산값이 상한보다 작아서
// 그대로 쓰이고, 넓은 화면에서만 상한이 적용된다.
export function capPx(value: number, maxCssPx: number): number {
  return Math.min(value, px(maxCssPx));
}
