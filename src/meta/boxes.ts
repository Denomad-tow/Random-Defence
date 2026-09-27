const BOXES_KEY = 'rd_boxes';

export type BoxCounts = Record<string, number>;

export function loadBoxes(): BoxCounts {
  try {
    const raw = localStorage.getItem(BOXES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveBoxes(counts: BoxCounts): void {
  try {
    localStorage.setItem(BOXES_KEY, JSON.stringify(counts));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}

export function addBox(boxId: string, amount = 1): BoxCounts {
  const counts = loadBoxes();
  counts[boxId] = (counts[boxId] ?? 0) + amount;
  saveBoxes(counts);
  return counts;
}

export function takeBox(boxId: string): boolean {
  const counts = loadBoxes();
  if ((counts[boxId] ?? 0) <= 0) return false;
  counts[boxId] -= 1;
  saveBoxes(counts);
  return true;
}

// 상자를 최대 amount개까지 한 번에 꺼낸다(저장은 한 번). 실제로 꺼낸 개수를 돌려준다.
export function takeBoxes(boxId: string, amount: number): number {
  const counts = loadBoxes();
  const taken = Math.min(amount, counts[boxId] ?? 0);
  if (taken <= 0) return 0;
  counts[boxId] = (counts[boxId] ?? 0) - taken;
  saveBoxes(counts);
  return taken;
}
