const DECK_KEY = 'rd_deck';

export function loadSavedDeck(): string[] | null {
  try {
    const raw = localStorage.getItem(DECK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string') ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDeck(unitIds: string[]): void {
  try {
    localStorage.setItem(DECK_KEY, JSON.stringify(unitIds));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}
