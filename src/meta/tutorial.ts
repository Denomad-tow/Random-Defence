const TUTORIAL_KEY = 'rd_tutorial_seen_v1';

export function hasTutorialSeen(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}
