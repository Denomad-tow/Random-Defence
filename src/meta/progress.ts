const BEST_STAGE_KEY = 'rd_best_stage';

export function loadBestStage(): number {
  try {
    const raw = localStorage.getItem(BEST_STAGE_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export function saveBestStage(stage: number): number {
  const best = Math.max(stage, loadBestStage());
  try {
    localStorage.setItem(BEST_STAGE_KEY, String(best));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
  return best;
}
