export const FIELD_ROWS = 4;
export const FIELD_COLS = 5;

export interface BoardLayout {
  originX: number;
  originY: number;
  cellSize: number;
  gap: number;
}

export interface CellPosition {
  row: number;
  col: number;
  x: number;
  y: number;
}

// 칸 사이 틈의 너비는 칸 크기의 이 비율. 몬스터(보통·정예)가 틈 안으로 지나가도
// 옆 유닛을 가리지 않도록 몬스터 크기(칸의 0.55~0.75배)에 맞춘 값이다.
export const GAP_RATIO = 0.7;

export function computeBoardLayout(areaWidth: number, areaTop: number, areaHeight: number): BoardLayout {
  const cellSize = Math.min(
    areaWidth / (FIELD_COLS + (FIELD_COLS - 1) * GAP_RATIO),
    areaHeight / (FIELD_ROWS + (FIELD_ROWS - 1) * GAP_RATIO),
  );
  const gap = cellSize * GAP_RATIO;

  const boardWidth = cellSize * FIELD_COLS + gap * (FIELD_COLS - 1);
  const boardHeight = cellSize * FIELD_ROWS + gap * (FIELD_ROWS - 1);

  return {
    originX: (areaWidth - boardWidth) / 2 + cellSize / 2,
    originY: areaTop + (areaHeight - boardHeight) / 2 + cellSize / 2,
    cellSize,
    gap,
  };
}

export function getCellPositions(layout: BoardLayout): CellPosition[] {
  const positions: CellPosition[] = [];
  const step = layout.cellSize + layout.gap;

  for (let row = 0; row < FIELD_ROWS; row += 1) {
    for (let col = 0; col < FIELD_COLS; col += 1) {
      positions.push({
        row,
        col,
        x: layout.originX + col * step,
        y: layout.originY + row * step,
      });
    }
  }

  return positions;
}

export function cellIndex(row: number, col: number): number {
  return row * FIELD_COLS + col;
}

// gapCol/gapRow는 슬롯 칸과 칸 "사이 틈"의 좌표다. gapCol이 정수 n이면 (n-1)번째
// 칸과 n번째 칸 사이의 빈 공간(또는 맨 왼쪽/오른쪽 바깥)을 가리킨다. gapRow도
// 마찬가지로 행 사이의 빈 공간을 가리킨다. 몬스터 길이 이 좌표만 지나가게 하면
// 항상 슬롯 칸이 아니라 칸 사이 틈으로만 지나가게 된다.
export function resolveCorridorPoint(gapCol: number, gapRow: number, layout: BoardLayout): { x: number; y: number } {
  const step = layout.cellSize + layout.gap;
  return {
    x: layout.originX - step / 2 + gapCol * step,
    y: layout.originY - step / 2 + gapRow * step,
  };
}

// 길 꼭짓점들을 "위아래 / 좌우"로만 꺾이는 선으로 바꾼다. 항상 세로로 먼저 내려간 뒤
// 가로로 이동하므로, 길이 칸 사이 틈(세로 틈 → 가로 틈)을 따라서만 지나간다.
export function toOrthogonalPath(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const result = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const prev = result[result.length - 1];
    const next = points[i];
    if (Math.abs(prev.x - next.x) > 0.5 && Math.abs(prev.y - next.y) > 0.5) {
      result.push({ x: prev.x, y: next.y });
    }
    result.push(next);
  }
  return result;
}
