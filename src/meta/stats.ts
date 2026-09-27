// 플레이 기록(누적 통계). 업적 달성 여부를 계산하는 재료다.
// 몬스터를 잡을 때마다 저장소에 쓰면 무거우니, 메모리에 모아뒀다가 몇 초에 한 번(또는 판이 끝날 때) 저장한다.
const KEY = 'rd_stats';

// 기록 이름. 자주 쓰는 것:
//  bestStage(모든 모드 최고 스테이지) kills bossKills runs coopRuns versusWins summons merges maxStar enhances boxesOpened
//  levelUps(컬렉션 레벨업 횟수) soloBest coopBest versusBest fullField(필드를 가득 채운 횟수)
//  attendanceDays chatMessages  summon_<등급키> draw_<등급키> open_<상자id>
export type StatKey = string;
export type Stats = Record<string, number>;

const EMPTY: Stats = { maxStar: 1 };

let cache: Stats | null = null;
let dirty = false;
let timer: number | undefined;

function load(): Stats {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Stats) : {};
    cache = { ...EMPTY, ...parsed };
  } catch {
    cache = { ...EMPTY };
  }
  return cache as Stats;
}

export function getStats(): Stats {
  return { ...load() };
}

export function getStat(key: StatKey): number {
  return load()[key] ?? 0;
}

// 지금까지 모은 값을 저장소에 쓴다. (서버 저장 직전과 판이 끝날 때도 부른다)
export function flushStats(): void {
  if (!dirty || !cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
  dirty = false;
}

function markDirty(): void {
  dirty = true;
  if (timer === undefined) {
    timer = window.setTimeout(() => {
      timer = undefined;
      flushStats();
    }, 3000);
  }
}

export function addStat(key: StatKey, amount = 1): void {
  const stats = load();
  stats[key] = (stats[key] ?? 0) + amount;
  markDirty();
}

// 최고 기록 형태(가장 멀리 간 스테이지, 가장 높은 별)는 더 클 때만 바꾼다.
export function maxStat(key: StatKey, value: number): void {
  const stats = load();
  if (value > (stats[key] ?? 0)) {
    stats[key] = value;
    markDirty();
  }
}

// 몬스터 한 마리 처치(종류별로 보스 수도 센다).
export function recordKill(kind: string): void {
  addStat('kills');
  if (kind === 'boss') addStat('bossKills');
}

// 판 하나가 끝났을 때.
export function recordRun(stage: number, mode: 'solo' | 'coop' | 'versus', won = false): void {
  addStat('runs');
  maxStat('bestStage', stage);
  maxStat(mode === 'solo' ? 'soloBest' : mode === 'coop' ? 'coopBest' : 'versusBest', stage);
  if (mode === 'coop') addStat('coopRuns');
  if (mode === 'versus' && won) addStat('versusWins');
  flushStats();
}

document.addEventListener('visibilitychange', flushStats);
window.addEventListener('pagehide', flushStats);
window.addEventListener('beforeunload', flushStats);
