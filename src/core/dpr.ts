export const DPR = window.devicePixelRatio || 1;

export function px(value: number): number {
  return Math.round(value * DPR);
}
