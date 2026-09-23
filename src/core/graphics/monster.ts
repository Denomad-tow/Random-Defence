import { hexWithAlpha } from '../color';

export interface MonsterVisual {
  eyeColor: string;
  auraColor?: string;
}

export function drawShadowMonster(ctx: CanvasRenderingContext2D, size: number, visual: MonsterVisual): void {
  const cx = size / 2;

  ctx.save();

  if (visual.auraColor) {
    const grad = ctx.createRadialGradient(cx, size * 0.5, size * 0.08, cx, size * 0.5, size * 0.58);
    grad.addColorStop(0, hexWithAlpha(visual.auraColor, 0.5));
    grad.addColorStop(1, hexWithAlpha(visual.auraColor, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.fillStyle = 'rgba(8, 9, 14, 0.4)';
  [
    [0.5, 0.84, 0.22],
    [0.36, 0.92, 0.14],
    [0.65, 0.93, 0.13],
  ].forEach(([fx, fy, fr]) => {
    ctx.beginPath();
    ctx.arc(size * fx, size * fy, size * fr, 0, Math.PI * 2);
    ctx.fill();
  });

  const body = new Path2D();
  body.moveTo(cx, size * 0.12);
  body.bezierCurveTo(size * 0.8, size * 0.18, size * 0.84, size * 0.56, size * 0.68, size * 0.8);
  body.bezierCurveTo(size * 0.6, size * 0.94, size * 0.4, size * 0.94, size * 0.32, size * 0.8);
  body.bezierCurveTo(size * 0.16, size * 0.56, size * 0.2, size * 0.18, cx, size * 0.12);
  body.closePath();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = size * 0.1;
  ctx.fillStyle = '#05060a';
  ctx.fill(body);
  ctx.shadowBlur = 0;

  ctx.shadowColor = visual.eyeColor;
  ctx.shadowBlur = size * 0.14;
  ctx.fillStyle = visual.eyeColor;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.ellipse(cx + side * size * 0.09, size * 0.4, size * 0.045, size * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}
