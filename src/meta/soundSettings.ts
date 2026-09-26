const KEY = 'rd_sound_settings';

// 소리 설정. 기기마다 스피커·취향이 달라서 계정과 동기화하지 않고 이 기기에만 저장한다.
export interface SoundSettings {
  enabled: boolean; // 소리 켜기/끄기
  master: number; // 전체 볼륨 0~1
  sfx: number; // 효과음 볼륨 0~1
}

const DEFAULTS: SoundSettings = { enabled: true, master: 0.8, sfx: 0.8 };

function clamp01(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

export function loadSoundSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
      master: clamp01(parsed.master, DEFAULTS.master),
      sfx: clamp01(parsed.sfx, DEFAULTS.sfx),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSoundSettings(settings: SoundSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}
