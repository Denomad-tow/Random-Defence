import { hexWithAlpha } from '../color';

export type MonsterShapeId = 'wisp' | 'bat' | 'wolf' | 'golem' | 'spider' | 'slime';

export interface MonsterVisual {
  eyeColor: string;
  auraColor?: string;
  shape?: MonsterShapeId;
}

function wispBody(size: number): Path2D {
  const cx = size / 2;
  const body = new Path2D();
  body.moveTo(cx, size * 0.12);
  body.bezierCurveTo(size * 0.8, size * 0.18, size * 0.84, size * 0.56, size * 0.68, size * 0.8);
  body.bezierCurveTo(size * 0.6, size * 0.94, size * 0.4, size * 0.94, size * 0.32, size * 0.8);
  body.bezierCurveTo(size * 0.16, size * 0.56, size * 0.2, size * 0.18, cx, size * 0.12);
  body.closePath();
  return body;
}

function batBody(size: number): Path2D {
  const cx = size / 2;
  const body = new Path2D();
  body.moveTo(cx, size * 0.2);
  body.bezierCurveTo(size * 0.65, size * 0.08, size * 0.95, size * 0.28, size * 0.9, size * 0.48);
  body.bezierCurveTo(size * 0.86, size * 0.42, size * 0.74, size * 0.44, size * 0.68, size * 0.56);
  body.bezierCurveTo(size * 0.74, size * 0.7, size * 0.62, size * 0.88, cx, size * 0.86);
  body.bezierCurveTo(size * 0.38, size * 0.88, size * 0.26, size * 0.7, size * 0.32, size * 0.56);
  body.bezierCurveTo(size * 0.26, size * 0.44, size * 0.14, size * 0.42, size * 0.1, size * 0.48);
  body.bezierCurveTo(size * 0.05, size * 0.28, size * 0.35, size * 0.08, cx, size * 0.2);
  body.closePath();
  return body;
}

function wolfBody(size: number): Path2D {
  const body = new Path2D();
  body.moveTo(size * 0.3, size * 0.3);
  body.lineTo(size * 0.22, size * 0.12);
  body.lineTo(size * 0.4, size * 0.28);
  body.bezierCurveTo(size * 0.5, size * 0.22, size * 0.6, size * 0.22, size * 0.68, size * 0.3);
  body.lineTo(size * 0.8, size * 0.12);
  body.lineTo(size * 0.72, size * 0.32);
  body.bezierCurveTo(size * 0.88, size * 0.42, size * 0.88, size * 0.68, size * 0.72, size * 0.82);
  body.bezierCurveTo(size * 0.6, size * 0.92, size * 0.4, size * 0.92, size * 0.3, size * 0.82);
  body.bezierCurveTo(size * 0.12, size * 0.68, size * 0.14, size * 0.42, size * 0.3, size * 0.3);
  body.closePath();
  return body;
}

function golemBody(size: number): Path2D {
  const body = new Path2D();
  const r = size * 0.1;
  const x = size * 0.18;
  const y = size * 0.16;
  const w = size * 0.64;
  const h = size * 0.72;
  body.moveTo(x + r, y);
  body.lineTo(x + w - r, y);
  body.quadraticCurveTo(x + w, y, x + w, y + r);
  body.lineTo(x + w, y + h - r);
  body.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  body.lineTo(x + r, y + h);
  body.quadraticCurveTo(x, y + h, x, y + h - r);
  body.lineTo(x, y + r);
  body.quadraticCurveTo(x, y, x + r, y);
  body.closePath();
  return body;
}

function spiderBody(size: number): Path2D {
  const body = new Path2D();
  body.arc(size / 2, size * 0.5, size * 0.26, 0, Math.PI * 2);
  return body;
}

function slimeBody(size: number): Path2D {
  const cx = size / 2;
  const body = new Path2D();
  body.moveTo(size * 0.1, size * 0.68);
  body.bezierCurveTo(size * 0.08, size * 0.4, size * 0.3, size * 0.22, cx, size * 0.22);
  body.bezierCurveTo(size * 0.7, size * 0.22, size * 0.92, size * 0.4, size * 0.9, size * 0.68);
  body.bezierCurveTo(size * 0.92, size * 0.86, size * 0.7, size * 0.92, cx, size * 0.92);
  body.bezierCurveTo(size * 0.3, size * 0.92, size * 0.08, size * 0.86, size * 0.1, size * 0.68);
  body.closePath();
  return body;
}

const BODY_BUILDERS: Record<MonsterShapeId, (size: number) => Path2D> = {
  wisp: wispBody,
  bat: batBody,
  wolf: wolfBody,
  golem: golemBody,
  spider: spiderBody,
  slime: slimeBody,
};

function drawSpiderLegs(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size * 0.5;
  const legLength = size * 0.24;

  ctx.save();
  ctx.strokeStyle = '#05060a';
  ctx.lineWidth = size * 0.035;
  ctx.lineCap = 'round';

  [-1, 1].forEach((side) => {
    [-0.6, -0.2, 0.2, 0.6].forEach((offset) => {
      const startX = cx + side * size * 0.2;
      const startY = cy + offset * size * 0.16;
      const endX = startX + side * legLength;
      const endY = startY + offset * legLength * 0.6;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    });
  });

  ctx.restore();
}

export function drawShadowMonster(ctx: CanvasRenderingContext2D, size: number, visual: MonsterVisual): void {
  const cx = size / 2;
  const shape = visual.shape ?? 'wisp';

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

  if (shape === 'spider') {
    drawSpiderLegs(ctx, size);
  }

  const body = BODY_BUILDERS[shape](size);

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
