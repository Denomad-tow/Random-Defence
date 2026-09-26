// 플레이 기록(누적 통계). 업적 달성 여부를 계산하는 재료다.
// 몬스터를 잡을 때마다 저장소에 쓰면 무거우니, 메모리에 모아뒀다가 몇 초에 한 번(또는 판이 끝날 때) 저장한다.
const KEY = 'rd_stats';

export type StatKey =
  | 'bestStage' // 모든 모드를 통틀어 가장 멀리 간 스테이지
  | 'kills' // 처치한 몬스터 수(전체)
  | 'bossKills' // 처치한 보스 수
  | 'runs' // 끝까지 플레이한 판 수(전체)
  | 'coopRuns' // 협동전 판 수
  | 'versusWins' // 경쟁전 우승 횟수
  | 'summons' // 유닛 소환 횟수
  | 'merges' // 합성 횟수
  | 'maxStar' // 만들어 본 가장 높은 별
  | 'enhances' // 인게임 강화 횟수
  | 'boxesOpened'; // 연 상자 수

export type Stats = Record<StatKey, number>;

const EMPTY: Stats = {
  bestStage: 0,
  kills: 0,
  bossKills: 0,
  runs: 0,
  coopRuns: 0,
  versusWins: 0,
  summons: 0,
  merges: 0,
  maxStar: 1,
  enhances: 0,
  boxesOpened: 0,
};

let cache: Stats | null = null;
let dirty = false;
let timer: number | undefined;

function load(): Stats {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Stats>) : {};
    cache = { ...EMPTY, ...parsed };
  } catch {
    cache = { ...EMPTY };
  }
  return cache;
}

export function getStats(): Stats {
  return { ...load() };
}

export function getStat(key: StatKey): number {
  return load()[key];
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
  stats[key] += amount;
  markDirty();
}

// 최고 기록 형태(가장 멀리 간 스테이지, 가장 높은 별)는 더 클 때만 바꾼다.
export function maxStat(key: StatKey, value: number): void {
  const stats = load();
  if (value > stats[key]) {
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
  if (mode === 'coop') addStat('coopRuns');
  if (mode === 'versus' && won) addStat('versusWins');
  flushStats();
}

document.addEventListener('visibilitychange', flushStats);
window.addEventListener('pagehide', flushStats);
window.addEventListener('beforeunload', flushStats);
