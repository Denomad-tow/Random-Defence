const GOLD_KEY = 'rd_gold';

export function loadGold(): number {
  try {
    const raw = localStorage.getItem(GOLD_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function saveGold(amount: number): void {
  try {
    localStorage.setItem(GOLD_KEY, String(amount));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}

export function addGold(amount: number): number {
  const next = loadGold() + amount;
  saveGold(next);
  return next;
}

export function spendGold(amount: number): boolean {
  const current = loadGold();
  if (current < amount) return false;
  saveGold(current - amount);
  return true;
}
