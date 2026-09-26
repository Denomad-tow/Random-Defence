import { loadSoundSettings, saveSoundSettings, type SoundSettings } from '../meta/soundSettings';

// 효과음을 코드로 만들어 내는 "소리 엔진". 음원 파일은 쓰지 않고 Web Audio API로 파형(사인파 등)과
// 잡음을 조합해서 소리를 합성한다. 어떤 소리를 낼지는 sfx.ts가 정하고, 여기는 재료(톤·종소리·잡음·
// 잔향)와 볼륨 설정, 브라우저 첫 터치 처리, 동시 발음 수 제한을 맡는다.

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let dryBus: GainNode | null = null;
let reverbIn: GainNode | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let settings: SoundSettings = loadSoundSettings();
let createdAt = 0;

// 지금 울리고 있는 소리(발음) 개수. 너무 많으면 자주 나는 소리는 건너뛴다.
let activeVoices = 0;
const MAX_VOICES = 40;

// ----- 설정 -----

export function getSoundSettings(): SoundSettings {
  return { ...settings };
}

function applyVolumes(): void {
  if (!ctx || !masterGain || !sfxGain) return;
  const now = ctx.currentTime;
  masterGain.gain.setTargetAtTime(settings.enabled ? settings.master : 0, now, 0.03);
  sfxGain.gain.setTargetAtTime(settings.sfx, now, 0.03);
}

export function updateSoundSettings(patch: Partial<SoundSettings>): SoundSettings {
  settings = { ...settings, ...patch };
  saveSoundSettings(settings);
  applyVolumes();
  return getSoundSettings();
}

// ----- 시작(브라우저 정책: 사용자가 화면을 한 번 만지기 전에는 소리를 낼 수 없다) -----

function buildGraph(context: AudioContext): void {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 18;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.2;
  compressor.connect(context.destination);

  masterGain = context.createGain();
  masterGain.connect(compressor);

  sfxGain = context.createGain();
  sfxGain.connect(masterGain);

  dryBus = context.createGain();
  dryBus.connect(sfxGain);

  // 잔향: 지수적으로 사라지는 잡음으로 만든 "울림 방" 소리. 크리스털·종소리에 은은한 공간감을 준다.
  const seconds = 1.9;
  const length = Math.floor(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
    }
  }
  const convolver = context.createConvolver();
  convolver.buffer = impulse;
  const reverbReturn = context.createGain();
  reverbReturn.gain.value = 0.55;
  reverbIn = context.createGain();
  reverbIn.connect(convolver);
  convolver.connect(reverbReturn);
  reverbReturn.connect(sfxGain);

  const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const noiseData = noise.getChannelData(0);
  for (let i = 0; i < noiseData.length; i += 1) noiseData[i] = Math.random() * 2 - 1;
  noiseBuffer = noise;

  applyVolumes();
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor: AudioCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    createdAt = performance.now();
    buildGraph(ctx);
  } catch {
    ctx = null;
  }
  return ctx;
}

// 화면을 처음 만지는 순간(그리고 앱이 백그라운드에서 돌아와 소리가 멈춘 뒤 다시 만질 때) 소리를 켠다.
let unlockInstalled = false;
export function installAudioUnlock(): void {
  if (unlockInstalled) return;
  unlockInstalled = true;

  const handler = (): void => {
    const context = ensureContext();
    if (context && context.state !== 'running') void context.resume().catch(() => undefined);
  };
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach((type) => {
    window.addEventListener(type, handler, { capture: true, passive: true });
  });
}

// 지금 소리를 낼 수 있는 상태인가(첫 터치 전이거나 꺼짐 상태면 false).
export function canPlaySound(): boolean {
  if (!ctx || !settings.enabled || settings.master <= 0 || settings.sfx <= 0) return false;
  if (ctx.state === 'running') return true;
  // 첫 터치 직후에는 소리를 켜는 중(resume)이라 잠깐 'suspended'일 수 있다. 이 짧은 순간의 소리는 그대로 예약해 둔다.
  return ctx.state === 'suspended' && performance.now() - createdAt < 1000;
}

// 자주 나는(덜 중요한) 소리는 동시 발음이 너무 많을 때 건너뛴다.
export function hasVoiceRoom(): boolean {
  return activeVoices < MAX_VOICES;
}

// ----- 소리 재료 -----

interface Routing {
  send?: number; // 잔향으로 보내는 양 (0~1)
  pan?: number; // 좌우 위치 (-1~1)
}

function connectOut(node: AudioNode, context: AudioContext, routing: Routing): void {
  let source: AudioNode = node;
  if (routing.pan && typeof context.createStereoPanner === 'function') {
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, routing.pan));
    source.connect(panner);
    source = panner;
  }
  if (dryBus) source.connect(dryBus);
  if (routing.send && routing.send > 0 && reverbIn) {
    const send = context.createGain();
    send.gain.value = routing.send;
    source.connect(send);
    send.connect(reverbIn);
  }
}

function trackVoice(source: AudioScheduledSourceNode): void {
  activeVoices += 1;
  source.onended = () => {
    activeVoices = Math.max(0, activeVoices - 1);
  };
}

export interface ToneOptions extends Routing {
  freq: number;
  endFreq?: number; // 있으면 소리 높이가 이 값으로 미끄러진다
  type?: OscillatorType;
  dur: number;
  gain: number;
  attack?: number;
  delay?: number;
  lowpass?: number;
  highpass?: number;
  vibrato?: { rate: number; depth: number }; // depth: 떨림 폭(Hz)
}

// 한 음(사인파·삼각파 등)을 낸다.
export function tone(options: ToneOptions): void {
  if (!ctx) return;
  const context = ctx;
  const t0 = context.currentTime + (options.delay ?? 0);
  const attack = Math.min(options.attack ?? 0.004, options.dur * 0.6);
  const end = t0 + options.dur;

  const osc = context.createOscillator();
  osc.type = options.type ?? 'sine';
  osc.frequency.setValueAtTime(options.freq, t0);
  if (options.endFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.endFreq), end);
  }

  const env = context.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(options.gain, t0 + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, end);

  let last: AudioNode = osc;
  if (options.highpass) {
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = options.highpass;
    last.connect(filter);
    last = filter;
  }
  if (options.lowpass) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = options.lowpass;
    last.connect(filter);
    last = filter;
  }
  last.connect(env);
  connectOut(env, context, options);

  if (options.vibrato) {
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.frequency.value = options.vibrato.rate;
    lfoGain.gain.value = options.vibrato.depth;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(end + 0.05);
  }

  trackVoice(osc);
  osc.start(t0);
  osc.stop(end + 0.05);
}

export interface NoiseOptions extends Routing {
  dur: number;
  gain: number;
  filter: BiquadFilterType;
  freq: number;
  endFreq?: number;
  q?: number;
  attack?: number;
  delay?: number;
}

// 잡음(바람·타격의 "치익" 소리)을 필터로 다듬어 낸다.
export function noise(options: NoiseOptions): void {
  if (!ctx || !noiseBuffer) return;
  const context = ctx;
  const t0 = context.currentTime + (options.delay ?? 0);
  const attack = Math.min(options.attack ?? 0.003, options.dur * 0.6);
  const end = t0 + options.dur;

  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;

  const filter = context.createBiquadFilter();
  filter.type = options.filter;
  filter.frequency.setValueAtTime(options.freq, t0);
  if (options.endFreq) filter.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFreq), end);
  filter.Q.value = options.q ?? 0.9;

  const env = context.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(options.gain, t0 + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, end);

  source.connect(filter);
  filter.connect(env);
  connectOut(env, context, options);

  trackVoice(source);
  source.start(t0, Math.random() * 1.5);
  source.stop(end + 0.05);
}

export interface BellOptions extends Routing {
  freq: number;
  dur: number;
  gain: number;
  delay?: number;
  partials?: number; // 겹쳐 쓸 배음 수(적을수록 가볍다)
  metallic?: boolean; // true면 종·금속 느낌(배음 간격이 더 어긋남), false면 유리·크리스털 느낌
}

const CRYSTAL_RATIOS = [1, 2.32, 4.25, 6.63];
const METAL_RATIOS = [1, 2.76, 5.4, 8.93];
const PARTIAL_GAINS = [1, 0.45, 0.22, 0.1];

// 종·크리스털 소리: 서로 어긋난 배음 몇 개를 겹치면 "띠잉~" 하는 울림이 난다. 높은 배음일수록 빨리 사라진다.
export function bell(options: BellOptions): void {
  if (!ctx) return;
  const ratios = options.metallic ? METAL_RATIOS : CRYSTAL_RATIOS;
  const count = Math.max(1, Math.min(ratios.length, options.partials ?? 3));
  for (let i = 0; i < count; i += 1) {
    const freq = options.freq * ratios[i];
    if (freq > 14000) continue;
    tone({
      freq,
      type: 'sine',
      dur: options.dur / (1 + i * 0.75),
      gain: options.gain * PARTIAL_GAINS[i],
      attack: 0.002,
      delay: options.delay,
      send: options.send,
      pan: options.pan,
    });
  }
}

export function jitter(amount: number): number {
  return 1 + (Math.random() * 2 - 1) * amount;
}
