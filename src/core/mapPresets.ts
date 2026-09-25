// 몬스터가 지나가는 길(맵) 종류. gapCol/gapRow는 유닛 슬롯(5열 × 3행) "사이 틈"의
// 좌표다. gapCol은 1(첫 세로 틈) ~ FIELD_COLS-1(마지막 세로 틈), gapRow는 0(맨 위,
// 입구) ~ FIELD_ROWS(맨 아래, 출구)까지의 정수 값만 쓴다. 정수를 쓰는 이유는 슬롯
// "칸 위"가 아니라 항상 칸과 칸 사이 빈틈을 지나가게 하기 위해서다.
export interface MapWaypoint {
  gapCol: number;
  gapRow: number;
}

export interface MapPreset {
  id: string;
  name: string;
  waypoints: MapWaypoint[];
}

export const MAP_PRESETS: MapPreset[] = [
  { id: 'zigzag-wide', name: '큰 지그재그', waypoints: [{ gapCol: 3, gapRow: 0 }, { gapCol: 1, gapRow: 1 }, { gapCol: 4, gapRow: 2 }, { gapCol: 2, gapRow: 3 }] },
  { id: 'zigzag-wide-rev', name: '역 큰 지그재그', waypoints: [{ gapCol: 2, gapRow: 0 }, { gapCol: 4, gapRow: 1 }, { gapCol: 1, gapRow: 2 }, { gapCol: 3, gapRow: 3 }] },
  { id: 'stairs-right', name: '오른쪽 계단', waypoints: [{ gapCol: 1, gapRow: 0 }, { gapCol: 2, gapRow: 1 }, { gapCol: 3, gapRow: 2 }, { gapCol: 4, gapRow: 3 }] },
  { id: 'stairs-left', name: '왼쪽 계단', waypoints: [{ gapCol: 4, gapRow: 0 }, { gapCol: 3, gapRow: 1 }, { gapCol: 2, gapRow: 2 }, { gapCol: 1, gapRow: 3 }] },
  { id: 'center-column', name: '중앙 통로', waypoints: [{ gapCol: 3, gapRow: 0 }, { gapCol: 3, gapRow: 1 }, { gapCol: 2, gapRow: 2 }, { gapCol: 3, gapRow: 3 }] },
  { id: 'left-column', name: '왼쪽 통로', waypoints: [{ gapCol: 1, gapRow: 0 }, { gapCol: 1, gapRow: 1 }, { gapCol: 2, gapRow: 2 }, { gapCol: 1, gapRow: 3 }] },
  { id: 'right-column', name: '오른쪽 통로', waypoints: [{ gapCol: 4, gapRow: 0 }, { gapCol: 4, gapRow: 1 }, { gapCol: 3, gapRow: 2 }, { gapCol: 4, gapRow: 3 }] },
  { id: 'w-shape', name: 'W자 길', waypoints: [{ gapCol: 2, gapRow: 0 }, { gapCol: 4, gapRow: 1 }, { gapCol: 2, gapRow: 2 }, { gapCol: 4, gapRow: 3 }] },
  { id: 'm-shape', name: 'M자 길', waypoints: [{ gapCol: 4, gapRow: 0 }, { gapCol: 2, gapRow: 1 }, { gapCol: 4, gapRow: 2 }, { gapCol: 2, gapRow: 3 }] },
  { id: 'edge-left', name: '왼쪽 지그재그', waypoints: [{ gapCol: 1, gapRow: 0 }, { gapCol: 3, gapRow: 1 }, { gapCol: 1, gapRow: 2 }, { gapCol: 4, gapRow: 3 }] },
  { id: 'edge-right', name: '오른쪽 지그재그', waypoints: [{ gapCol: 4, gapRow: 0 }, { gapCol: 2, gapRow: 1 }, { gapCol: 4, gapRow: 2 }, { gapCol: 1, gapRow: 3 }] },
  { id: 'spiral', name: '소용돌이 길', waypoints: [{ gapCol: 2, gapRow: 0 }, { gapCol: 1, gapRow: 1 }, { gapCol: 4, gapRow: 2 }, { gapCol: 3, gapRow: 3 }] },
];

export function pickRandomMapPreset(): MapPreset {
  return MAP_PRESETS[Math.floor(Math.random() * MAP_PRESETS.length)];
}
