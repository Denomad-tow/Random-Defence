import { bell, canPlaySound, hasVoiceRoom, jitter, noise, tone } from './audio';
import { RARITY_ORDER } from '../meta/gacha';

// 게임에서 쓰는 모든 효과음. 여기서는 "무슨 소리를 낼지"(레시피)만 정하고, 실제 소리 재료는 audio.ts가 만든다.
// 분위기: 크리스털 울림 · 종소리 · 유리 소리 · 은은한 잔향의 마법 소리. 등급/별이 높을수록 풍성해진다.
// 귀가 피곤하지 않도록 공격처럼 자주 나는 소리는 작게, 매번 음 높이를 조금씩 바꾸고, 겹침을 제한한다.

export type SfxName =
  | 'click'
  | 'screen'
  | 'summon'
  | 'merge'
  | 'attack'
  | 'hit'
  | 'kill'
  | 'mana'
  | 'bossWarning'
  | 'bossDefeat'
  | 'waveStart'
  | 'defeat'
  | 'newRecord'
  | 'boxOpen';

export interface SfxParams {
  rarity?: number; // 0(N) ~ 8(TR)
  star?: number; // 2 ~ 7
  role?: string; // 유닛 역할 id (units.json의 role)
}

export function rarityIndex(rarityId: string): number {
  return Math.max(0, RARITY_ORDER.indexOf(rarityId));
}

// 펜타토닉(도·레·미·솔·라) 음계: 어떻게 섞어도 어울리는 음이라 마법 소리에 쓰기 좋다.
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02, 3135.96];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

// 반짝이는 높은 종소리 여러 개를 흩뿌린다(등급이 높을수록 많이).
function sparkle(count: number, span: number, gain: number, send: number, startDelay = 0): void {
  for (let i = 0; i < count; i += 1) {
    bell({
      freq: pick(PENTA.slice(6)) * jitter(0.01),
      dur: 0.35,
      gain,
      delay: startDelay + Math.random() * span,
      partials: 2,
      send,
      pan: Math.random() * 1.2 - 0.6,
    });
  }
}

// ----- 공격 소리: 역할(15가지)마다 다른 소리. 짧고 작게 만들고 매번 음 높이를 살짝 바꾼다. -----

const ATTACK: Record<string, () => void> = {
  // 단일 딜러: 맑은 크리스털 핑
  single: () => {
    const j = jitter(0.06);
    bell({ freq: 1320 * j, dur: 0.2, gain: 0.1, partials: 2, send: 0.12 });
    tone({ freq: 2600 * j, dur: 0.03, gain: 0.04 });
  },
  // 광역: 묵직한 울림 + 퍼지는 바람
  aoe: () => {
    const j = jitter(0.08);
    tone({ freq: 150 * j, endFreq: 70, dur: 0.22, gain: 0.15 });
    noise({ dur: 0.22, gain: 0.1, filter: 'lowpass', freq: 1100, endFreq: 220 });
  },
  // 둔화: 얼음 — 유리 종소리와 서리 갈라지는 소리
  slow: () => {
    const j = jitter(0.05);
    bell({ freq: 2093 * j, dur: 0.28, gain: 0.06, partials: 3, send: 0.2 });
    tone({ freq: 2800 * j, endFreq: 1500, dur: 0.14, gain: 0.05 });
    noise({ dur: 0.08, gain: 0.05, filter: 'highpass', freq: 6500 });
  },
  // 기절: 번개 — 짧은 전기 지지직
  stun: () => {
    const j = jitter(0.08);
    tone({ freq: 2300 * j, endFreq: 170, dur: 0.11, gain: 0.1, type: 'sawtooth', lowpass: 3200 });
    noise({ dur: 0.1, gain: 0.16, filter: 'bandpass', freq: 3600, endFreq: 800, q: 1.5 });
  },
  // 독: 보글거리는 거품
  poison: () => {
    for (let i = 0; i < 3; i += 1) {
      const base = (280 + Math.random() * 260) * jitter(0.05);
      tone({ freq: base, endFreq: base * 1.8, dur: 0.07, gain: 0.09, lowpass: 1500, delay: i * 0.05 });
    }
  },
  // 방어력 감소: 유리·갑옷 갈라지는 소리
  armorBreak: () => {
    const j = jitter(0.06);
    noise({ dur: 0.06, gain: 0.09, filter: 'highpass', freq: 3200 });
    bell({ freq: 820 * j, dur: 0.22, gain: 0.06, partials: 3, metallic: true });
    tone({ freq: 95 * j, endFreq: 60, dur: 0.15, gain: 0.1 });
  },
  // 버프: 따뜻한 두 음 종소리
  buff: () => {
    const j = jitter(0.03);
    tone({ freq: 659 * j, dur: 0.32, gain: 0.07, type: 'triangle', send: 0.3, attack: 0.01 });
    tone({ freq: 831 * j, dur: 0.34, gain: 0.06, type: 'triangle', send: 0.3, attack: 0.01, delay: 0.07 });
  },
  // 마나 생성: 동전 같은 반짝임
  goldGen: () => {
    const j = jitter(0.03);
    bell({ freq: 1568 * j, dur: 0.22, gain: 0.07, partials: 2, send: 0.25 });
    bell({ freq: 2093 * j, dur: 0.26, gain: 0.06, partials: 2, send: 0.25, delay: 0.06 });
  },
  // 관통: 화살이 공기를 가르는 소리
  pierce: () => {
    const j = jitter(0.08);
    noise({ dur: 0.13, gain: 0.22, filter: 'bandpass', freq: 1200 * j, endFreq: 4200, q: 1.2 });
    tone({ freq: 3000 * j, endFreq: 3500, dur: 0.05, gain: 0.06 });
  },
  // 다중 사격: 타타! 두 번 연달아
  multishot: () => {
    const j = jitter(0.06);
    tone({ freq: 1400 * j, endFreq: 900, dur: 0.06, gain: 0.13, type: 'triangle' });
    tone({ freq: 1750 * j, endFreq: 1100, dur: 0.06, gain: 0.12, type: 'triangle', delay: 0.07 });
  },
  // 사슬 번개: 전기가 튕기며 작아지는 지직
  chain: () => {
    const j = jitter(0.06);
    for (let i = 0; i < 3; i += 1) {
      tone({ freq: (1900 - i * 350) * j, endFreq: 280, dur: 0.05, gain: 0.1 - i * 0.02, type: 'sawtooth', lowpass: 2800, delay: i * 0.045 });
    }
    noise({ dur: 0.12, gain: 0.1, filter: 'bandpass', freq: 3000, endFreq: 1200, q: 1.3 });
  },
  // 처형: 묵직하게 베는 소리
  execute: () => {
    const j = jitter(0.06);
    tone({ freq: 135 * j, endFreq: 55, dur: 0.22, gain: 0.16 });
    noise({ dur: 0.06, gain: 0.12, filter: 'bandpass', freq: 900, q: 1 });
    tone({ freq: 1800 * j, dur: 0.03, gain: 0.04 });
  },
  // 마나 흡수: 빨려드는 듯한 하강음 + 작은 반짝임
  manaLeech: () => {
    const j = jitter(0.06);
    tone({ freq: 720 * j, endFreq: 260, dur: 0.28, gain: 0.08, vibrato: { rate: 14, depth: 25 }, send: 0.15 });
    bell({ freq: 1760 * j, dur: 0.2, gain: 0.04, partials: 2, delay: 0.12, send: 0.2 });
  },
  // 냉기 결계: 서늘한 크리스털 잔물결
  frostAura: () => {
    const j = jitter(0.04);
    bell({ freq: 2637 * j, dur: 0.4, gain: 0.045, partials: 3, send: 0.35 });
    bell({ freq: 3136 * j, dur: 0.4, gain: 0.035, partials: 2, send: 0.35, delay: 0.08 });
  },
  // 치명 강타: 날카롭고 밝은 한 방
  critStrike: () => {
    const j = jitter(0.05);
    bell({ freq: 2637 * j, dur: 0.26, gain: 0.08, partials: 3, send: 0.15 });
    noise({ dur: 0.06, gain: 0.08, filter: 'highpass', freq: 2500 });
    tone({ freq: 190 * j, endFreq: 80, dur: 0.12, gain: 0.11 });
  },
};

// ----- 기본 효과음 -----

function playClick(): void {
  bell({ freq: 1760 * jitter(0.03), dur: 0.09, gain: 0.05, partials: 2 });
}

function playScreen(): void {
  noise({ dur: 0.3, gain: 0.05, filter: 'bandpass', freq: 400, endFreq: 2400, q: 0.8, attack: 0.08 });
  bell({ freq: 784, dur: 0.4, gain: 0.05, partials: 2, send: 0.3, delay: 0.05 });
  bell({ freq: 1175, dur: 0.5, gain: 0.045, partials: 2, send: 0.3, delay: 0.13 });
}

// 소환: 등급이 높을수록 음이 많아지고 잔향과 반짝임이 늘어난다.
function playSummon(rarity: number): void {
  const r = Math.max(0, Math.min(8, rarity));
  noise({ dur: 0.28, gain: 0.03 + r * 0.008, filter: 'highpass', freq: 5000, attack: 0.06 });
  const notes = 2 + (r >= 2 ? 1 : 0) + (r >= 4 ? 1 : 0) + (r >= 5 ? 1 : 0) + (r >= 6 ? 1 : 0) + (r >= 8 ? 1 : 0);
  for (let i = 0; i < notes; i += 1) {
    bell({
      freq: PENTA[Math.min(PENTA.length - 1, 3 + i * 2)] * 0.5 * (1 + r * 0.02),
      dur: 0.35 + r * 0.06,
      gain: 0.08 + r * 0.008,
      partials: 2 + (r >= 3 ? 1 : 0),
      send: 0.2 + r * 0.08,
      delay: i * 0.055,
    });
  }
  if (r >= 3) sparkle(2 + (r - 3) * 2, 0.35, 0.03, 0.5, 0.05);
  if (r >= 5) tone({ freq: 90, endFreq: 45, dur: 0.5, gain: 0.16 });
}

// 합성: 별이 오를수록 시작 음이 높아지고, 올라가는 음(아르페지오)이 길어지고, 반짝임과 울림이 커진다.
function playMerge(star: number): void {
  const s = Math.max(2, Math.min(7, star));
  const root = (s - 2) * 1; // 별마다 시작 음이 한 칸씩 올라간다
  const notes = Math.min(6, s + 1);
  noise({ dur: 0.3, gain: 0.03, filter: 'bandpass', freq: 500, endFreq: 3500, q: 0.9, attack: 0.15 });
  for (let i = 0; i < notes; i += 1) {
    bell({
      freq: PENTA[Math.min(PENTA.length - 1, root + i * 2)],
      dur: 0.4 + s * 0.05,
      gain: 0.07 + s * 0.004,
      partials: s >= 5 ? 3 : 2,
      send: 0.25 + s * 0.05,
      delay: 0.12 + i * 0.06,
    });
  }
  if (s >= 4) sparkle(s - 2, 0.5, 0.035, 0.5, 0.25);
  if (s >= 5) tone({ freq: 110 * (1 + (s - 5) * 0.12), endFreq: 220, dur: 0.5, gain: 0.1, send: 0.3, attack: 0.15 });
  if (s >= 7) {
    [0, 2, 4, 5].forEach((idx, i) =>
      bell({ freq: PENTA[idx + 5], dur: 1.6, gain: 0.07, partials: 3, send: 0.7, delay: 0.5 + i * 0.02 }),
    );
    tone({ freq: 70, endFreq: 40, dur: 0.7, gain: 0.18, delay: 0.5 });
  }
}

function playAttack(role: string): void {
  (ATTACK[role] ?? ATTACK.single)();
}

function playHit(): void {
  const j = jitter(0.12);
  noise({ dur: 0.04, gain: 0.09, filter: 'bandpass', freq: 1500 * j, q: 1 });
  tone({ freq: 380 * j, endFreq: 200, dur: 0.05, gain: 0.07 });
}

function playKill(): void {
  const j = jitter(0.08);
  noise({ dur: 0.16, gain: 0.07, filter: 'lowpass', freq: 2200, endFreq: 300 });
  bell({ freq: 1046 * j, dur: 0.22, gain: 0.05, partials: 2, send: 0.15, delay: 0.02 });
}

function playMana(): void {
  const j = jitter(0.04);
  bell({ freq: 1975 * j, dur: 0.2, gain: 0.06, partials: 2, send: 0.2 });
  bell({ freq: 2637 * j, dur: 0.25, gain: 0.05, partials: 2, send: 0.2, delay: 0.05 });
}

// 보스 경고: 낮게 깔리는 울림과 세 번 울리는 어두운 종소리
function playBossWarning(): void {
  tone({ freq: 55, endFreq: 46, dur: 2.2, gain: 0.13, type: 'sawtooth', lowpass: 240, attack: 0.5 });
  tone({ freq: 58, endFreq: 50, dur: 2.2, gain: 0.1, type: 'sawtooth', lowpass: 260, attack: 0.5 });
  noise({ dur: 1.6, gain: 0.05, filter: 'bandpass', freq: 200, endFreq: 1300, q: 0.7, attack: 1.0 });
  for (let i = 0; i < 3; i += 1) {
    bell({ freq: 110, dur: 2.0, gain: 0.2, partials: 4, metallic: true, send: 0.5, delay: 0.15 + i * 0.72 });
    tone({ freq: 116.5, dur: 1.2, gain: 0.05, send: 0.3, delay: 0.15 + i * 0.72 });
  }
}

function playBossDefeat(): void {
  tone({ freq: 90, endFreq: 30, dur: 0.9, gain: 0.3 });
  noise({ dur: 1.0, gain: 0.1, filter: 'lowpass', freq: 2500, endFreq: 150 });
  [0, 2, 3, 5, 7, 8, 10].forEach((idx, i) =>
    bell({ freq: PENTA[Math.min(idx, PENTA.length - 1)], dur: 1.2, gain: 0.09, partials: 3, send: 0.55, delay: 0.12 + i * 0.09 }),
  );
  sparkle(14, 1.3, 0.035, 0.6, 0.3);
}

function playWaveStart(): void {
  noise({ dur: 0.5, gain: 0.04, filter: 'bandpass', freq: 300, endFreq: 1800, q: 0.7, attack: 0.15 });
  bell({ freq: 659, dur: 0.6, gain: 0.09, partials: 3, metallic: true, send: 0.35 });
  bell({ freq: 988, dur: 0.8, gain: 0.09, partials: 3, metallic: true, send: 0.35, delay: 0.13 });
}

// 패배: 내려가는 쓸쓸한 음과 낮은 울림
function playDefeat(): void {
  [440, 392, 330, 294, 220].forEach((freq, i) =>
    tone({ freq, dur: 0.55, gain: 0.09, type: 'triangle', lowpass: 1600, send: 0.4, delay: i * 0.28, attack: 0.02 }),
  );
  tone({ freq: 110, endFreq: 82, dur: 2.0, gain: 0.11, send: 0.3, attack: 0.1 });
  bell({ freq: 220, dur: 2.2, gain: 0.08, partials: 3, metallic: true, send: 0.5, delay: 1.2 });
}

// 최고 기록 갱신: 밝게 올라가는 팡파르
function playNewRecord(): void {
  [0, 2, 3, 5].forEach((idx, i) =>
    bell({ freq: PENTA[idx], dur: 0.45, gain: 0.09, partials: 3, send: 0.35, delay: i * 0.1 }),
  );
  [5, 7, 8].forEach((idx) => bell({ freq: PENTA[idx], dur: 1.3, gain: 0.08, partials: 3, send: 0.6, delay: 0.5 }));
  sparkle(10, 1.0, 0.035, 0.6, 0.5);
}

// 상자 열기: 등급 6가지가 각각 다르고, 높을수록 뜸을 들이고 화려해진다. 전설·신화는 특별하다.
function playBoxOpen(rarity: number): void {
  const r = Math.max(0, Math.min(8, rarity));

  if (r === 0) {
    tone({ freq: 170, endFreq: 90, dur: 0.2, gain: 0.16 });
    noise({ dur: 0.1, gain: 0.06, filter: 'lowpass', freq: 1500 });
    bell({ freq: 784, dur: 0.5, gain: 0.05, partials: 2, send: 0.2, delay: 0.05 });
    return;
  }

  if (r === 1) {
    tone({ freq: 170, endFreq: 90, dur: 0.2, gain: 0.14 });
    bell({ freq: 880, dur: 0.6, gain: 0.07, partials: 2, send: 0.3, delay: 0.08 });
    bell({ freq: 1108, dur: 0.7, gain: 0.07, partials: 2, send: 0.3, delay: 0.18 });
    return;
  }

  if (r === 2) {
    tone({ freq: 160, endFreq: 85, dur: 0.22, gain: 0.14 });
    [2, 3, 5].forEach((idx, i) =>
      bell({ freq: PENTA[idx], dur: 0.8, gain: 0.08, partials: 3, send: 0.45, delay: 0.1 + i * 0.09 }),
    );
    sparkle(3, 0.4, 0.03, 0.5, 0.3);
    return;
  }

  if (r === 3) {
    noise({ dur: 0.7, gain: 0.05, filter: 'bandpass', freq: 300, endFreq: 3000, q: 0.8, attack: 0.5 });
    tone({ freq: 160, endFreq: 80, dur: 0.25, gain: 0.15, delay: 0.55 });
    [0, 2, 3, 5].forEach((idx, i) =>
      bell({ freq: PENTA[idx + 1], dur: 1.0, gain: 0.08, partials: 3, send: 0.5, delay: 0.6 + i * 0.08 }),
    );
    [5, 7].forEach((idx) => bell({ freq: PENTA[idx], dur: 1.4, gain: 0.06, partials: 3, send: 0.6, delay: 0.95 }));
    sparkle(6, 0.6, 0.03, 0.6, 0.7);
    return;
  }

  if (r === 4) {
    // 전설: 차오르는 기운 → 황금빛 폭발
    tone({ freq: 110, endFreq: 440, dur: 1.2, gain: 0.09, type: 'sawtooth', lowpass: 900, attack: 0.9, send: 0.3 });
    noise({ dur: 1.2, gain: 0.06, filter: 'bandpass', freq: 250, endFreq: 4000, q: 0.8, attack: 0.9 });
    tone({ freq: 100, endFreq: 40, dur: 0.6, gain: 0.26, delay: 1.2 });
    [0, 2, 3, 5, 7].forEach((idx, i) =>
      bell({ freq: PENTA[idx + 2], dur: 1.8, gain: 0.09, partials: 4, metallic: true, send: 0.65, delay: 1.2 + i * 0.05 }),
    );
    sparkle(12, 1.2, 0.035, 0.7, 1.25);
    return;
  }

  // 신화: 특별한 연출 — 깊은 울림, 겹겹이 차오르는 화음, 무지개 같은 반짝임의 폭포, 긴 여운
  tone({ freq: 45, endFreq: 38, dur: 3.2, gain: 0.26, attack: 0.4 });
  [220, 329.6, 440, 659.3, 880].forEach((freq, i) => {
    tone({ freq, endFreq: freq * 2, dur: 2.0, gain: 0.05, attack: 1.7, send: 0.5, delay: i * 0.05 });
    tone({ freq: freq * 1.004, endFreq: freq * 2.008, dur: 2.0, gain: 0.04, attack: 1.7, send: 0.5, delay: i * 0.05 });
  });
  noise({ dur: 2.0, gain: 0.07, filter: 'bandpass', freq: 200, endFreq: 6000, q: 0.7, attack: 1.6 });
  for (let i = 0; i < 26; i += 1) {
    bell({
      freq: PENTA[5 + Math.floor(Math.random() * (PENTA.length - 5))],
      dur: 0.5,
      gain: 0.04,
      partials: 2,
      send: 0.7,
      delay: 1.3 + i * 0.045,
      pan: Math.random() * 1.6 - 0.8,
    });
  }
  tone({ freq: 55, endFreq: 30, dur: 1.4, gain: 0.34, delay: 2.1 });
  noise({ dur: 1.4, gain: 0.12, filter: 'lowpass', freq: 3000, endFreq: 120, delay: 2.1 });
  [0, 2, 3, 5, 7, 8, 10].forEach((idx, i) =>
    bell({ freq: PENTA[Math.min(idx + 3, PENTA.length - 1)], dur: 3.4, gain: 0.08, partials: 4, metallic: i % 2 === 0, send: 0.85, delay: 2.1 + i * 0.03 }),
  );
  sparkle(18, 2.0, 0.03, 0.8, 2.2);

  // LR·GR·TR: UR 연출 위에 더 높은 화음, 더 깊은 울림, 더 많은 반짝임을 겹쳐서 한 단계씩 더 웅장하게 한다.
  if (r > 5) {
    const extra = r - 5;
    sparkle(10 * extra, 2.4, 0.03, 0.85, 2.0);
    [0, 2, 4, 5].slice(0, 2 + extra).forEach((idx, i) =>
      bell({ freq: PENTA[Math.min(PENTA.length - 1, idx + 8)], dur: 3.8, gain: 0.06, partials: 4, send: 0.9, delay: 2.1 + i * 0.05 + extra * 0.08 }),
    );
    tone({ freq: 40, endFreq: 28, dur: 1.6 + extra * 0.5, gain: 0.28, delay: 2.1 });
    if (extra >= 2) {
      [261.6, 392, 523.3, 784, 1046.5].forEach((freq, i) =>
        tone({ freq, endFreq: freq * 1.5, dur: 2.4, gain: 0.04, attack: 2.0, send: 0.6, delay: 0.2 + i * 0.05 }),
      );
    }
    if (extra >= 3) {
      noise({ dur: 1.6, gain: 0.1, filter: 'highpass', freq: 3000, delay: 2.2, send: 0.8 });
      sparkle(24, 2.6, 0.03, 0.9, 2.3);
    }
  }
}

// ----- 재생 진입점: 여기서 겹침 제한과 최소 간격을 지킨다 -----

interface SfxRule {
  minGapMs: number; // 같은 소리를 연달아 낼 수 있는 최소 간격
  low: boolean; // true면 소리가 너무 많을 때 건너뛰어도 되는 소리
}

const RULES: Record<SfxName, SfxRule> = {
  click: { minGapMs: 40, low: true },
  screen: { minGapMs: 200, low: false },
  summon: { minGapMs: 60, low: false },
  merge: { minGapMs: 80, low: false },
  attack: { minGapMs: 0, low: true },
  hit: { minGapMs: 45, low: true },
  kill: { minGapMs: 60, low: true },
  mana: { minGapMs: 70, low: true },
  bossWarning: { minGapMs: 1000, low: false },
  bossDefeat: { minGapMs: 1000, low: false },
  waveStart: { minGapMs: 500, low: false },
  defeat: { minGapMs: 1000, low: false },
  newRecord: { minGapMs: 1000, low: false },
  boxOpen: { minGapMs: 100, low: false },
};

const lastPlayed = new Map<string, number>();
const recentAttacks: number[] = [];
const ATTACK_WINDOW_MS = 120; // 이 시간 안에
const ATTACK_MAX_IN_WINDOW = 3; // 공격 소리는 최대 3개까지만
const ATTACK_ROLE_GAP_MS = 70; // 같은 역할 공격음 최소 간격

export function playSfx(name: SfxName, params: SfxParams = {}): void {
  if (!canPlaySound()) return;

  const rule = RULES[name];
  const now = performance.now();
  if (rule.low && !hasVoiceRoom()) return;

  const key = name === 'attack' ? `attack:${params.role ?? ''}` : name;
  const gap = name === 'attack' ? ATTACK_ROLE_GAP_MS : rule.minGapMs;
  const last = lastPlayed.get(key) ?? -Infinity;
  if (now - last < gap) return;

  if (name === 'attack') {
    while (recentAttacks.length > 0 && now - recentAttacks[0] > ATTACK_WINDOW_MS) recentAttacks.shift();
    if (recentAttacks.length >= ATTACK_MAX_IN_WINDOW) return;
    recentAttacks.push(now);
  }
  lastPlayed.set(key, now);

  switch (name) {
    case 'click':
      return playClick();
    case 'screen':
      return playScreen();
    case 'summon':
      return playSummon(params.rarity ?? 0);
    case 'merge':
      return playMerge(params.star ?? 2);
    case 'attack':
      return playAttack(params.role ?? 'single');
    case 'hit':
      return playHit();
    case 'kill':
      return playKill();
    case 'mana':
      return playMana();
    case 'bossWarning':
      return playBossWarning();
    case 'bossDefeat':
      return playBossDefeat();
    case 'waveStart':
      return playWaveStart();
    case 'defeat':
      return playDefeat();
    case 'newRecord':
      return playNewRecord();
    case 'boxOpen':
      return playBoxOpen(params.rarity ?? 0);
  }
}

// ----- 사운드 테스트 화면에 나열할 목록 -----

export interface SfxEntry {
  label: string;
  category: string;
  play: () => void;
}

const RARITY_LABELS = ['N', 'R', 'SR', 'SSR', 'SSSR', 'UR', 'LR', 'GR', 'TR'];
const ROLE_LABELS: Array<[string, string]> = [
  ['single', '단일'],
  ['aoe', '광역'],
  ['slow', '둔화(얼음)'],
  ['stun', '기절(번개)'],
  ['poison', '독(보글)'],
  ['armorBreak', '방어 감소'],
  ['buff', '버프'],
  ['goldGen', '마나 생성'],
  ['pierce', '관통'],
  ['multishot', '다중 사격'],
  ['chain', '사슬 번개'],
  ['execute', '처형'],
  ['manaLeech', '마나 흡수'],
  ['frostAura', '냉기 결계'],
  ['critStrike', '치명 강타'],
];

export const SFX_CATEGORIES = ['화면', '소환·합성', '공격', '전투', '상자'];

export function buildSfxList(): SfxEntry[] {
  const list: SfxEntry[] = [
    { label: '버튼 클릭', category: '화면', play: () => playSfx('click') },
    { label: '화면 전환', category: '화면', play: () => playSfx('screen') },
  ];

  RARITY_LABELS.forEach((label, rarity) =>
    list.push({ label: `소환 · ${label}`, category: '소환·합성', play: () => playSfx('summon', { rarity }) }),
  );
  [2, 3, 4, 5, 6, 7].forEach((star) =>
    list.push({ label: `합성 ★${star}`, category: '소환·합성', play: () => playSfx('merge', { star }) }),
  );

  ROLE_LABELS.forEach(([role, label]) =>
    list.push({ label, category: '공격', play: () => playSfx('attack', { role }) }),
  );

  list.push(
    { label: '몬스터 피격', category: '전투', play: () => playSfx('hit') },
    { label: '몬스터 처치', category: '전투', play: () => playSfx('kill') },
    { label: '마나 획득', category: '전투', play: () => playSfx('mana') },
    { label: '보스 경고', category: '전투', play: () => playSfx('bossWarning') },
    { label: '보스 처치', category: '전투', play: () => playSfx('bossDefeat') },
    { label: '웨이브 시작', category: '전투', play: () => playSfx('waveStart') },
    { label: '패배', category: '전투', play: () => playSfx('defeat') },
    { label: '최고 기록 갱신', category: '전투', play: () => playSfx('newRecord') },
  );

  RARITY_LABELS.forEach((label, rarity) =>
    list.push({ label: `상자 · ${label}`, category: '상자', play: () => playSfx('boxOpen', { rarity }) }),
  );

  return list;
}

// 공격 소리를 빠르게 여러 번 눌렀을 때(전투 중 상황) 겹침 제한이 잘 되는지 들어보는 용도.
export function playAttackBurst(): void {
  const roles = ROLE_LABELS.map(([role]) => role);
  for (let i = 0; i < 40; i += 1) {
    window.setTimeout(() => playSfx('attack', { role: pick(roles) }), i * 35);
    if (i % 3 === 0) window.setTimeout(() => playSfx('hit'), i * 35 + 10);
    if (i % 7 === 0) window.setTimeout(() => playSfx('kill'), i * 35 + 20);
  }
}
