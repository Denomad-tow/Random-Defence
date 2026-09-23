export interface PathPoint {
  x: number;
  y: number;
}

export function computeMonsterPath(
  centerX: number,
  laneWidth: number,
  screenTop: number,
  boardTopY: number,
): PathPoint[] {
  const left = centerX - laneWidth / 2;
  const right = centerX + laneWidth / 2;
  const midY = screenTop + (boardTopY - screenTop) * 0.55;

  return [
    { x: centerX, y: screenTop },
    { x: right, y: midY },
    { x: left, y: midY + (boardTopY - midY) * 0.6 },
    { x: centerX, y: boardTopY },
  ];
}
