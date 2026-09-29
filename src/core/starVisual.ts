// 합성으로 오른 별을 화면에서 더 강하게 보여주기 위한 등급별 표시 정보.
// 별이 오를수록 글자색이 화려해지고, ★4부터 유닛 뒤에 색 오라가 생기고, ★6부터 오라가 맥동한다.
export interface StarTier {
  labelColor: string; // 별·레벨 글자색
  ringColor: number; // 유닛 뒤 오라 색
  pulse: boolean; // 오라가 커졌다 작아졌다 하는 효과를 줄지
  glow: boolean; // 글자에 빛 번짐(그림자)을 줄지
  fontStep: number; // 기본 글자 크기에 더할 px 단위 가산치
}

const TIERS: StarTier[] = [
  { labelColor: '#f3dc9a', ringColor: 0xbfae7a, pulse: false, glow: false, fontStep: 0 }, // ★1
  { labelColor: '#9fe0ff', ringColor: 0x6fc7ff, pulse: false, glow: false, fontStep: 1 }, // ★2
  { labelColor: '#8dffb8', ringColor: 0x5be694, pulse: false, glow: false, fontStep: 2 }, // ★3
  { labelColor: '#ffe066', ringColor: 0xffcf4d, pulse: false, glow: true, fontStep: 3 }, // ★4
  { labelColor: '#ffb066', ringColor: 0xff9a4d, pulse: true, glow: true, fontStep: 4 }, // ★5
  { labelColor: '#ff6b81', ringColor: 0xff4d6b, pulse: true, glow: true, fontStep: 5 }, // ★6
  { labelColor: '#ffe9b0', ringColor: 0xffffff, pulse: true, glow: true, fontStep: 7 }, // ★7(최고): 흰빛 오라 + 금색 글자
];

export function starTier(star: number): StarTier {
  const index = Math.min(TIERS.length, Math.max(1, Math.round(star))) - 1;
  return TIERS[index];
}

// 별이 4개를 넘으면 "★★★★★"처럼 계속 늘어놓지 않고 "★×5"로 압축해서, 글자가 커져도 줄이 안 밀리게 한다.
export function starLabel(star: number): string {
  return star >= 5 ? `★×${star}` : '★'.repeat(star);
}
