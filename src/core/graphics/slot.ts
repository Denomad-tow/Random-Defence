function hexPoints(cx: number, cy: number, radius: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
}

function hexPath(cx: number, cy: number, radius: number): Path2D {
  const points = hexPoints(cx, cy, radius);
  const path = new Path2D();
  path.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    path.lineTo(points[i][0], points[i][1]);
  }
  path.closePath();
  return path;
}

export function drawEmptySlot(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.46;
  const path = hexPath(cx, cy, radius);

  ctx.save();

  ctx.fillStyle = 'rgba(15, 18, 28, 0.75)';
  ctx.fill(path);

  ctx.save();
  ctx.clip(path);
  const innerShadow = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius);
  innerShadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
  innerShadow.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  ctx.fillStyle = innerShadow;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  ctx.lineWidth = size * 0.025;
  ctx.strokeStyle = 'rgba(138, 106, 44, 0.75)';
  ctx.stroke(path);

  ctx.restore();
}
