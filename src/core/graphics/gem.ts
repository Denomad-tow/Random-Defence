import { mulberry32 } from '../random';
import { hexWithAlpha } from '../color';

export interface RarityPreset {
  key: string;
  label: string;
  c1: string;
  c2: string;
  glow: number;
  sparkleCount: number;
  rainbow?: boolean;
}

// 내부 키(normal/uncommon/...)는 저장된 데이터(컬렉션·덱)와 호환되도록 그대로 두고, 화면에 보이는 이름만 바꾼다.
// N < R < SR < SSR < SSSR < UR < LR < GR < TR
export const RARITIES: RarityPreset[] = [
  { key: 'normal', label: 'N', c1: '#aab0bb', c2: '#5b606b', glow: 0.15, sparkleCount: 0 },
  { key: 'uncommon', label: 'R', c1: '#4fd39a', c2: '#16623f', glow: 0.3, sparkleCount: 0 },
  { key: 'rare', label: 'SR', c1: '#4f9dff', c2: '#173e8a', glow: 0.45, sparkleCount: 2 },
  { key: 'epic', label: 'SSR', c1: '#b67dff', c2: '#4a1f8f', glow: 0.6, sparkleCount: 4 },
  { key: 'legendary', label: 'SSSR', c1: '#ffc15a', c2: '#8c5a12', glow: 0.75, sparkleCount: 7 },
  { key: 'mythic', label: 'UR', c1: '#ff5d7a', c2: '#6a1dff', glow: 0.9, sparkleCount: 10, rainbow: true },
  { key: 'lr', label: 'LR', c1: '#6ff7ff', c2: '#0a4d8c', glow: 1.0, sparkleCount: 12, rainbow: true },
  { key: 'gr', label: 'GR', c1: '#ffe066', c2: '#b3122c', glow: 1.1, sparkleCount: 14, rainbow: true },
  { key: 'tr', label: 'TR', c1: '#ffffff', c2: '#7a2bff', glow: 1.25, sparkleCount: 18, rainbow: true },
];

export function getRarity(key: string): RarityPreset {
  return RARITIES.find((r) => r.key === key) ?? RARITIES[0];
}

export interface SigilDef {
  label: string;
  paths?: string[];
  circles?: Array<{ cx: number; cy: number; r: number }>;
}

const GEM_BORDER = 'M60 6l47 27v54L60 114 13 87V33z';
const GEM_FILL = 'M60 13l41 24v46L60 107 19 83V37z';
const GEM_TOP_HIGHLIGHT = 'M60 13L60 60 19 37z';
const GEM_RIGHT_HIGHLIGHT = 'M60 13l41 24L60 60z';
const GEM_LEFT_SHADOW = 'M19 83L60 60 60 107z';
const GEM_RIGHT_SHADOW = 'M101 83L60 60 60 107z';
const GEM_CORE = 'M60 26l29 17v34L60 94 31 77V43z';

export function drawGem(
  ctx: CanvasRenderingContext2D,
  rarity: RarityPreset,
  sigil?: SigilDef,
  seed = 1,
  size = 160,
): void {
  const margin = (size - 120) / 2;

  ctx.save();
  ctx.translate(margin, margin);

  const glowGrad = ctx.createRadialGradient(60, 60, 0, 60, 60, 75);
  glowGrad.addColorStop(0, hexWithAlpha(rarity.c1, rarity.glow));
  glowGrad.addColorStop(1, hexWithAlpha(rarity.c1, 0));
  ctx.fillStyle = glowGrad;
  ctx.fillRect(-margin, -margin, size, size);

  if (rarity.sparkleCount > 0) {
    drawSparkles(ctx, rarity, seed);
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = rarity.rainbow ? conicOrFallback(ctx) : borderGradient(ctx);
  strokePath(ctx, GEM_BORDER);

  const fillGrad = ctx.createLinearGradient(0, 0, 120, 120);
  fillGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
  fillGrad.addColorStop(0.25, rarity.c1);
  fillGrad.addColorStop(1, rarity.c2);
  ctx.fillStyle = fillGrad;
  fillPath(ctx, GEM_FILL);

  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#fff';
  fillPath(ctx, GEM_TOP_HIGHLIGHT);
  ctx.globalAlpha = 0.1;
  fillPath(ctx, GEM_RIGHT_HIGHLIGHT);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  fillPath(ctx, GEM_LEFT_SHADOW);
  ctx.globalAlpha = 0.35;
  fillPath(ctx, GEM_RIGHT_SHADOW);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = rarity.c2;
  fillPath(ctx, GEM_CORE);
  ctx.globalAlpha = 1;

  if (sigil) {
    drawSigil(ctx, sigil);
  }

  ctx.fillStyle = '#f3dc9a';
  drawCircle(ctx, 60, 6, 3);
  drawCircle(ctx, 60, 114, 3);

  ctx.restore();
}

function drawSparkles(ctx: CanvasRenderingContext2D, rarity: RarityPreset, seed: number): void {
  const rand = mulberry32(seed);
  for (let i = 0; i < rarity.sparkleCount; i += 1) {
    const x = 20 + rand() * 80;
    const y = 45 + rand() * 40;
    ctx.save();
    ctx.globalAlpha = 0.35 + rand() * 0.4;
    ctx.fillStyle = rarity.c1;
    ctx.shadowColor = rarity.c1;
    ctx.shadowBlur = 6;
    drawCircle(ctx, x, y, 1.5);
    ctx.restore();
  }
}

function drawSigil(ctx: CanvasRenderingContext2D, sigil: SigilDef): void {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 12;
  drawSigilShapes(ctx, sigil);
  ctx.restore();

  drawSigilShapes(ctx, sigil);
  ctx.restore();
}

function drawSigilShapes(ctx: CanvasRenderingContext2D, sigil: SigilDef): void {
  sigil.paths?.forEach((d) => ctx.stroke(new Path2D(d)));
  sigil.circles?.forEach(({ cx, cy, r }) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function borderGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
  const grad = ctx.createLinearGradient(0, 0, 0, 120);
  grad.addColorStop(0, '#f3dc9a');
  grad.addColorStop(1, '#7a5a22');
  return grad;
}

function conicOrFallback(ctx: CanvasRenderingContext2D): string | CanvasGradient {
  if (typeof ctx.createConicGradient !== 'function') {
    return '#d4b36a';
  }
  const grad = ctx.createConicGradient(0, 60, 60);
  const stops = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#b15cff', '#ff4d6d'];
  stops.forEach((color, i) => grad.addColorStop(i / (stops.length - 1), color));
  return grad;
}

function fillPath(ctx: CanvasRenderingContext2D, d: string): void {
  ctx.fill(new Path2D(d));
}

function strokePath(ctx: CanvasRenderingContext2D, d: string): void {
  ctx.stroke(new Path2D(d));
}

function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
