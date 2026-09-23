import { mulberry32 } from '../random';

export function drawNightSkyGlow(ctx: CanvasRenderingContext2D, size: number): void {
  const grad = ctx.createRadialGradient(size / 2, size * 0.3, 0, size / 2, size * 0.3, size * 0.62);
  grad.addColorStop(0, '#1b2033');
  grad.addColorStop(1, 'rgba(27, 32, 51, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

export function drawStarField(ctx: CanvasRenderingContext2D, width: number, height: number, seed: number): void {
  const rand = mulberry32(seed);
  const count = Math.round((width * height) / 9000);

  for (let i = 0; i < count; i += 1) {
    const x = rand() * width;
    const y = rand() * height;
    const r = rand() * 1.2 + 0.3;
    const alpha = 0.2 + rand() * 0.5;

    ctx.fillStyle = `rgba(236, 228, 208, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
