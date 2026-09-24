export const FIELD_ROWS = 3;
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

export function computeBoardLayout(areaWidth: number, areaTop: number, areaHeight: number): BoardLayout {
  const gap = areaWidth * 0.03;
  const cellSize = Math.min(
    (areaWidth - gap * (FIELD_COLS - 1)) / FIELD_COLS,
    (areaHeight - gap * (FIELD_ROWS - 1)) / FIELD_ROWS,
  );

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
