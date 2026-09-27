import { NORMAL_UNITS } from '../core/units';
import { getStats, type Stats } from './stats';
import { addGold } from './gold';
import { addBox } from './boxes';
import { loadCollection } from './collection';
import { RARITY_ORDER, BOX_TYPES, getBoxType } from './gacha';
import { computeRunReward } from './rewards';
import { getResearchSnapshot } from './research';
import { loadLevels, MAX_UNIT_LEVEL } from './levels';
import { getRarity } from '../core/graphics/gem';
import { ROLE_SIGILS } from '../core/graphics/sigils';

// 업적: 조건을 달성하면 보상(골드·상자)을 한 번 받을 수 있다.
// 새 업적을 추가하려면 아래 "업적 목록 만들기"에 목표 숫자 목록이나 chain(...) 줄을 하나 더하면 된다.

const CLAIMED_KEY = 'rd_achv';

export const ACHIEVEMENT_CATEGORIES = ['스테이지', '몬스터', '모드', '성장', '수집', '컬렉션', '연구', '상자', '기타'] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export interface AchievementReward {
  gold: number;
  boxId?: string;
  boxCount?: number;
}

// 진행도를 재는 재료. 업적이 천 개가 넘어서, 저장소를 매번 읽지 않고 한 번 읽어서 모두가 같이 쓴다.
export interface ProgressContext {
  stats: Stats;
  owned: Map<string, number>; // 유닛 id → 가진 장수
  levels: Record<string, number>;
  researchGeneral: Record<string, number>;
  researchRole: Record<string, number>;
  ownedByRarity: Map<string, number>; // 등급 키 → 가진 종류 수
  ownedByRole: Map<string, number>; // 역할 → 가진 종류 수
  levelSum: number; // 가진 유닛들의 레벨 합
  maxLevelCount: number; // 만렙 유닛 수
  lv5Count: number; // 레벨 5 이상 유닛 수
  duplicateCards: number; // 가진 카드 총 장수
  highestRarity: number; // 가진 유닛 중 최고 등급 번호(N=0 ... TR=8)
  researchTotal: number;
}

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  name: string;
  desc: string;
  goal: number;
  reward: AchievementReward;
  progress: (ctx: ProgressContext) => number;
  // 진행 문구를 "현재 / 목표" 숫자가 아닌 다른 모양으로 보여주고 싶을 때(등급·별·획득 업적)
  progressText?: (value: number, goal: number) => string;
}

function buildContext(): ProgressContext {
  const collection = loadCollection();
  const owned = new Map<string, number>();
  collection.forEach((id) => owned.set(id, (owned.get(id) ?? 0) + 1));
  const levels = loadLevels();
  const research = getResearchSnapshot();

  const ownedByRarity = new Map<string, number>();
  const ownedByRole = new Map<string, number>();
  let levelSum = 0;
  let maxLevelCount = 0;
  let lv5Count = 0;
  let highestRarity = 0;

  NORMAL_UNITS.forEach((unit) => {
    if (!owned.has(unit.id)) return;
    ownedByRarity.set(unit.rarity, (ownedByRarity.get(unit.rarity) ?? 0) + 1);
    ownedByRole.set(unit.role, (ownedByRole.get(unit.role) ?? 0) + 1);
    const level = levels[unit.id] ?? 1;
    levelSum += level;
    if (level >= MAX_UNIT_LEVEL) maxLevelCount += 1;
    if (level >= 5) lv5Count += 1;
    highestRarity = Math.max(highestRarity, RARITY_ORDER.indexOf(unit.rarity));
  });

  const sum = (record: Record<string, number>): number => Object.values(record).reduce((a, b) => a + (b ?? 0), 0);

  return {
    stats: getStats(),
    owned,
    levels,
    researchGeneral: research.general as Record<string, number>,
    researchRole: research.role,
    ownedByRarity,
    ownedByRole,
    levelSum,
    maxLevelCount,
    lv5Count,
    duplicateCards: collection.length,
    highestRarity,
    researchTotal: sum(research.general as Record<string, number>) + sum(research.role),
  };
}

const stat =
  (key: string) =>
  (ctx: ProgressContext): number =>
    ctx.stats[key] ?? 0;

// ----- 보상 만들기 -----
// 같은 줄기(chain)의 업적은 뒤로 갈수록 보상이 커진다. p는 줄기 안에서의 위치(0~1).
const REWARD_BOXES = ['wood', 'wood', 'silver', 'silver', 'gold', 'gold', 'diamond', 'platinum', 'mithril', 'orichalcum'];

function rewardAt(p: number, baseGold: number): AchievementReward {
  const clamped = Math.min(1, Math.max(0, p));
  const scaled = clamped * REWARD_BOXES.length;
  const index = Math.min(REWARD_BOXES.length - 1, Math.floor(scaled));
  const count = scaled - Math.floor(scaled) >= 0.5 ? 2 : 1;
  return { gold: Math.round((baseGold * (1 + clamped * 19)) / 10) * 10, boxId: REWARD_BOXES[index], boxCount: count };
}

// 유닛 등급(N=0 ... TR=8)에 따른 보상. mult는 어려운 업적일수록 크게.
const UNIT_BOX_BY_RARITY = ['wood', 'wood', 'silver', 'silver', 'gold', 'gold', 'diamond', 'platinum', 'mithril'];
function unitReward(rarityIndex: number, mult: number): AchievementReward {
  const gold = [50, 100, 200, 400, 800, 1500, 3000, 6000, 12000][rarityIndex] ?? 50;
  return { gold: gold * mult, boxId: UNIT_BOX_BY_RARITY[rarityIndex] ?? 'wood', boxCount: mult >= 4 ? 2 : 1 };
}

const num = (n: number): string => n.toLocaleString('ko-KR');

// ----- 업적 목록 만들기 -----

function build(): AchievementDef[] {
  const list: AchievementDef[] = [];
  const add = (def: AchievementDef): void => {
    list.push(def);
  };

  // 목표 숫자 목록으로 한 줄기(chain)를 만드는 도우미. 이름·설명·진행도만 정하면 보상은 자동으로 커진다.
  const chain = (
    idPrefix: string,
    category: AchievementCategory,
    goals: number[],
    name: (goal: number) => string,
    desc: string,
    progress: (ctx: ProgressContext) => number,
    baseGold: number,
    progressText?: (value: number, goal: number) => string,
  ): void => {
    goals.forEach((goal, i) =>
      add({
        id: `${idPrefix}-${goal}`,
        category,
        name: name(goal),
        desc,
        goal,
        reward: rewardAt(goals.length <= 1 ? 0 : i / (goals.length - 1), baseGold),
        progress,
        progressText,
      }),
    );
  };

  // ===== 스테이지: 5 단위로 Stage 500까지 (예전에 만든 10 단위 업적은 id와 보상을 그대로 유지) =====
  for (let stage = 5; stage <= 500; stage += 5) {
    const run = computeRunReward(stage);
    const boxId = stage < 30 ? 'wood' : run.boxId;
    const boxCount = stage < 30 ? Math.max(1, Math.floor(stage / 10)) : run.boxCount;
    add({
      id: `stage-${stage}`,
      category: '스테이지',
      name: `Stage ${stage} 클리어`,
      desc: `스테이지 ${stage}에 도달하기 (개인전·협동전·경쟁전 통틀어)`,
      goal: stage,
      reward: { gold: stage * (stage % 10 === 0 ? 15 : 10), boxId, boxCount },
      progress: stat('bestStage'),
    });
  }

  // ===== 몬스터: 처치 수 / 보스 처치 =====
  const killGoals = [
    100, 200, 300, 400, 500, 700, 1000, 1500, 2000, 3000, 4000, 5000, 7000, 10000, 15000, 20000, 30000, 40000, 50000, 70000,
    100000, 150000, 200000, 300000, 400000, 500000, 700000, 1000000, 1500000, 2000000, 3000000, 5000000,
  ];
  chain('kills', '몬스터', killGoals, (g) => `몬스터 ${num(g)}마리 처치`, '모든 모드에서 처치한 몬스터의 누적 수', stat('kills'), 100);

  const bossGoals = [1, 2, 3, 5, 7, 10, 15, 20, 30, 40, 50, 70, 100, 150, 200, 300, 400, 500, 700, 1000, 1500, 2000];
  chain('boss', '몬스터', bossGoals, (g) => `보스 ${num(g)}마리 처치`, '10스테이지마다 나오는 보스를 처치한 누적 수', stat('bossKills'), 150);

  // ===== 모드: 모드별 최고 스테이지, 판 수, 협동·경쟁 =====
  const soloGoals = Array.from({ length: 30 }, (_, i) => (i + 1) * 10);
  chain('solo', '모드', soloGoals, (g) => `개인전 Stage ${g}`, '개인전에서 도달한 최고 스테이지', stat('soloBest'), 100);
  const coopGoals = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
  chain('coopstage', '모드', coopGoals, (g) => `협동전 Stage ${g}`, '협동전에서 도달한 최고 스테이지', stat('coopBest'), 150);
  chain('versusstage', '모드', coopGoals, (g) => `경쟁전 Stage ${g}`, '경쟁전에서 도달한 최고 스테이지', stat('versusBest'), 150);
  chain('runs', '모드', [1, 2, 3, 5, 10, 20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000], (g) => `${num(g)}판 플레이`, '개인전·협동전·경쟁전 통틀어 끝까지 한 판 수', stat('runs'), 60);
  chain('coop', '모드', [1, 2, 3, 5, 10, 20, 30, 50, 100, 200], (g) => `협동전 ${num(g)}판`, '친구와 함께한 협동전 판 수', stat('coopRuns'), 150);
  chain('versus', '모드', [1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 100], (g) => `경쟁전 ${num(g)}승`, '경쟁전에서 우승한 횟수', stat('versusWins'), 250);

  // ===== 성장: 소환·합성·별·강화·컬렉션 레벨업 =====
  const summonGoals = [50, 100, 150, 200, 300, 500, 700, 1000, 2000, 3000, 5000, 7000, 10000, 20000, 30000, 50000, 100000];
  chain('summon', '성장', summonGoals, (g) => `유닛 ${num(g)}번 소환`, '소환·랜덤 소환 횟수의 합', stat('summons'), 100);
  const mergeGoals = [10, 20, 30, 50, 100, 150, 200, 300, 500, 1000, 2000, 3000, 5000, 7000, 10000, 20000];
  chain('merge', '성장', mergeGoals, (g) => `합성 ${num(g)}번`, '드래그·자동 합성으로 유닛을 합친 횟수', stat('merges'), 120);
  chain('star', '성장', [2, 3, 4, 5, 6, 7], (g) => `★${g} 유닛 만들기`, '합성으로 높은 별의 유닛을 만들어 보기', stat('maxStar'), 100, (v, g) => `현재 ★${v} / ★${g}`);
  const enhanceGoals = [5, 10, 20, 30, 50, 100, 150, 200, 300, 500, 1000, 2000, 3000];
  chain('enhance', '성장', enhanceGoals, (g) => `인게임 강화 ${num(g)}번`, '유닛을 더블 탭해서 강화한 횟수', stat('enhances'), 100);
  const levelUpGoals = [1, 5, 10, 20, 30, 50, 80, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000];
  chain('levelup', '성장', levelUpGoals, (g) => `컬렉션 레벨업 ${num(g)}번`, '컬렉션에서 유닛을 레벨업한 누적 횟수(일괄 레벨업 포함)', stat('levelUps'), 150);
  chain('fullfield', '성장', [1, 5, 10, 30, 100, 300], (g) => `필드 가득 채우기 ${num(g)}번`, '필드 20칸을 유닛으로 가득 채운 횟수', stat('fullField'), 150);

  // 등급별 소환 횟수(9등급). 높은 등급일수록 목표를 작게 잡는다.
  const summonTierGoals: number[][] = [
    [10, 50, 100, 300, 1000, 3000],
    [10, 50, 100, 300, 1000, 3000],
    [10, 50, 100, 300, 1000, 3000],
    [10, 50, 100, 300, 1000, 3000],
    [5, 10, 30, 100, 300],
    [3, 10, 30, 100, 300],
    [1, 5, 10, 30, 100],
    [1, 5, 10, 30, 100],
    [1, 5, 10, 30, 100],
  ];
  RARITY_ORDER.forEach((key, i) => {
    const label = getRarity(key).label;
    chain(`summonr-${key}`, '성장', summonTierGoals[i], (g) => `${label} 등급 유닛 ${num(g)}번 소환`, `${label} 등급 유닛을 소환한 횟수`, stat(`summon_${key}`), 80 + i * 40);
  });

  // ===== 수집: 유닛 종류, 등급별·역할별 수집, 유닛 하나하나 획득 =====
  const collectGoals = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135];
  chain('collect', '수집', collectGoals, (g) => `유닛 ${g}종 모으기`, '서로 다른 유닛을 모은 종류 수 (전체 135종)', (ctx) => ctx.owned.size, 150);

  const rarityFirstGoals: Array<[number, string, AchievementReward]> = [
    [3, 'SSR', { gold: 500, boxId: 'silver', boxCount: 1 }],
    [4, 'SSSR', { gold: 1500, boxId: 'gold', boxCount: 1 }],
    [5, 'UR', { gold: 5000, boxId: 'diamond', boxCount: 1 }],
    [6, 'LR', { gold: 15000, boxId: 'platinum', boxCount: 1 }],
    [7, 'GR', { gold: 40000, boxId: 'mithril', boxCount: 1 }],
    [8, 'TR', { gold: 100000, boxId: 'orichalcum', boxCount: 1 }],
  ];
  rarityFirstGoals.forEach(([index, label, reward]) =>
    add({
      id: `rarity-${label}`,
      category: '수집',
      name: `${label} 등급 유닛 획득`,
      desc: `${label} 등급 유닛을 처음으로 얻기`,
      goal: index,
      reward,
      progress: (ctx) => ctx.highestRarity,
      progressText: (v) => (v >= index ? '달성' : `현재 최고 ${getRarity(RARITY_ORDER[v]).label}`),
    }),
  );

  RARITY_ORDER.forEach((key, i) => {
    const label = getRarity(key).label;
    chain(`rarown-${key}`, '수집', [5, 10, 15], (g) => `${label} 등급 ${g}종 모으기`, `${label} 등급 유닛을 서로 다른 종류로 모은 수 (등급마다 15종)`, (ctx) => ctx.ownedByRarity.get(key) ?? 0, 200 + i * 100);
  });

  const roleIds = Object.keys(ROLE_SIGILS);
  roleIds.forEach((role, i) => {
    const label = ROLE_SIGILS[role]?.label ?? role;
    chain(`roleown-${role}`, '수집', [3, 6, 9], (g) => `${label} 유닛 ${g}종 모으기`, `${label} 역할 유닛을 등급별로 모은 종류 수 (역할마다 9등급)`, (ctx) => ctx.ownedByRole.get(role) ?? 0, 150 + (i % 5) * 20);
  });

  NORMAL_UNITS.forEach((unit) => {
    const rarityIndex = RARITY_ORDER.indexOf(unit.rarity);
    add({
      id: `unit-${unit.id}`,
      category: '수집',
      name: `${unit.name} 획득`,
      desc: `${getRarity(unit.rarity).label} · ${ROLE_SIGILS[unit.role]?.label ?? unit.role} 유닛을 얻기`,
      goal: 1,
      reward: unitReward(rarityIndex, 1),
      progress: (ctx) => (ctx.owned.has(unit.id) ? 1 : 0),
      progressText: (v) => (v >= 1 ? '획득' : '미획득'),
    });
  });

  // ===== 컬렉션: 유닛별 레벨, 레벨 합계·만렙 수·중복 카드 =====
  NORMAL_UNITS.forEach((unit) => {
    const rarityIndex = RARITY_ORDER.indexOf(unit.rarity);
    [5, MAX_UNIT_LEVEL].forEach((level) => {
      add({
        id: `ulv${level}-${unit.id}`,
        category: '컬렉션',
        name: `${unit.name} Lv.${level}`,
        desc: `${getRarity(unit.rarity).label} ${unit.name}을(를) 레벨 ${level}까지 올리기`,
        goal: level,
        reward: unitReward(rarityIndex, level === 5 ? 2 : 5),
        progress: (ctx) => (ctx.owned.has(unit.id) ? ctx.levels[unit.id] ?? 1 : 0),
        progressText: (v, g) => (v <= 0 ? '미획득' : `Lv.${Math.min(v, g)} / Lv.${g}`),
      });
    });
  });

  chain('levelsum', '컬렉션', [10, 30, 50, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000], (g) => `유닛 레벨 합계 ${num(g)}`, '가진 모든 유닛의 레벨을 더한 값', (ctx) => ctx.levelSum, 150);
  chain('maxlevel', '컬렉션', [1, 2, 3, 5, 7, 10, 15, 20, 30, 40, 60, 80, 100, 135], (g) => `만렙 유닛 ${g}종`, `레벨 ${MAX_UNIT_LEVEL}(최대)에 도달한 유닛의 종류 수`, (ctx) => ctx.maxLevelCount, 250);
  chain('lv5count', '컬렉션', [5, 10, 20, 30, 50, 70, 100, 135], (g) => `Lv.5 이상 유닛 ${g}종`, '레벨 5 이상인 유닛의 종류 수', (ctx) => ctx.lv5Count, 150);
  chain('dups', '컬렉션', [20, 50, 100, 200, 500, 1000, 2000, 5000], (g) => `카드 ${num(g)}장 보유`, '가진 유닛 카드(중복 포함)의 총 장수', (ctx) => ctx.duplicateCards, 100);

  // ===== 연구 =====
  const researchGoals = [5, 10, 20, 30, 40, 50, 60, 70, 80, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1500, 1700];
  chain('research', '연구', researchGoals, (g) => `연구 레벨 합계 ${num(g)}`, '모든 연구 항목의 레벨을 더한 값', (ctx) => ctx.researchTotal, 200);
  const tens = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  chain('rsch-attack', '연구', tens, (g) => `공격력 연구 Lv.${g}`, '공격력 연구의 레벨', (ctx) => ctx.researchGeneral.attack ?? 0, 300);
  chain('rsch-speed', '연구', tens, (g) => `공격속도 연구 Lv.${g}`, '공격속도 연구의 레벨', (ctx) => ctx.researchGeneral.attackSpeed ?? 0, 300);
  roleIds.forEach((role) => {
    const label = ROLE_SIGILS[role]?.label ?? role;
    chain(`rsch-role-${role}`, '연구', [10, 30, 50, 70, 100], (g) => `${label} 연구 Lv.${g}`, `${label} 역할 연구의 레벨`, (ctx) => ctx.researchRole[role] ?? 0, 250);
  });

  // ===== 상자 =====
  const boxGoals = [1, 2, 3, 5, 10, 15, 20, 30, 40, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000, 3000];
  chain('box', '상자', boxGoals, (g) => `상자 ${num(g)}개 열기`, '상자를 연 누적 개수', stat('boxesOpened'), 80);
  BOX_TYPES.forEach((box, i) => {
    chain(`open-${box.id}`, '상자', [1, 5, 10, 30, 100], (g) => `${box.name} ${num(g)}개 열기`, `${box.name}를 연 횟수`, stat(`open_${box.id}`), 100 + i * 60);
  });
  const drawGoals: number[][] = [
    [10, 50, 100, 300, 1000, 3000],
    [10, 50, 100, 300, 1000, 3000],
    [10, 50, 100, 300, 1000],
    [5, 10, 30, 100, 300],
    [3, 10, 30, 100],
    [1, 3, 10, 30],
    [1, 3, 10],
    [1, 3, 10],
    [1, 3, 5],
  ];
  RARITY_ORDER.forEach((key, i) => {
    const label = getRarity(key).label;
    chain(`draw-${key}`, '상자', drawGoals[i], (g) => `${label} 등급 카드 ${num(g)}장 뽑기`, `상자에서 ${label} 등급 카드를 뽑은 누적 장수`, stat(`draw_${key}`), 100 + i * 50);
  });

  // ===== 기타 =====
  chain('attend', '기타', [1, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 240, 365], (g) => `출석 ${g}일`, '출석 보상을 받은 누적 일수', stat('attendanceDays'), 120);
  chain('chat', '기타', [1, 5, 10, 30, 50, 100, 200, 500, 1000], (g) => `채팅 ${num(g)}번`, '채팅으로 보낸 메시지 수', stat('chatMessages'), 60);

  return list;
}

// 업적 골드 보상 배율. 값을 줄이면 골드 보상이 전체적으로 줄어든다(상자 보상은 그대로).
// 0.2 = 처음 계산한 값의 20%. (전부 달성했을 때 총합이 약 470만 → 약 95만)
export const ACHIEVEMENT_GOLD_SCALE = 0.2;

export const ACHIEVEMENTS: AchievementDef[] = build().map((def) => ({
  ...def,
  reward: { ...def.reward, gold: Math.max(10, Math.round((def.reward.gold * ACHIEVEMENT_GOLD_SCALE) / 10) * 10) },
}));

// ----- 받은 업적 기록 -----

function loadClaimed(): Set<string> {
  try {
    const raw = localStorage.getItem(CLAIMED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveClaimed(set: Set<string>): void {
  try {
    localStorage.setItem(CLAIMED_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}

export type AchievementState = 'claimed' | 'claimable' | 'locked';

export interface AchievementStatus {
  def: AchievementDef;
  value: number;
  state: AchievementState;
}

export function getAchievementStatuses(): AchievementStatus[] {
  const claimed = loadClaimed();
  const ctx = buildContext();
  return ACHIEVEMENTS.map((def) => {
    const value = def.progress(ctx);
    const state: AchievementState = claimed.has(def.id) ? 'claimed' : value >= def.goal ? 'claimable' : 'locked';
    return { def, value, state };
  });
}

export function claimableCount(): number {
  return getAchievementStatuses().filter((s) => s.state === 'claimable').length;
}

export function rewardText(reward: AchievementReward): string {
  const parts = [`골드 ${reward.gold.toLocaleString('ko-KR')}`];
  if (reward.boxId && reward.boxCount) parts.push(`${getBoxType(reward.boxId).name} ${reward.boxCount}개`);
  return parts.join(' + ');
}

function grant(def: AchievementDef, claimed: Set<string>): AchievementReward {
  const reward = def.reward;
  addGold(reward.gold);
  if (reward.boxId && reward.boxCount) addBox(reward.boxId, reward.boxCount);
  claimed.add(def.id);
  return reward;
}

// 달성한 업적의 보상을 받는다. 받을 수 없으면 null.
export function claimAchievement(id: string): AchievementReward | null {
  const status = getAchievementStatuses().find((s) => s.def.id === id);
  if (!status || status.state !== 'claimable') return null;
  const claimed = loadClaimed();
  const reward = grant(status.def, claimed);
  saveClaimed(claimed);
  return reward;
}

// 받을 수 있는 보상을 전부 받는다. 받은 개수와 합쳐진 보상을 돌려준다.
export function claimAllAchievements(): { count: number; gold: number; boxes: Record<string, number> } {
  const result = { count: 0, gold: 0, boxes: {} as Record<string, number> };
  const claimed = loadClaimed();
  getAchievementStatuses()
    .filter((s) => s.state === 'claimable')
    .forEach((s) => {
      const reward = grant(s.def, claimed);
      result.count += 1;
      result.gold += reward.gold;
      if (reward.boxId && reward.boxCount) result.boxes[reward.boxId] = (result.boxes[reward.boxId] ?? 0) + reward.boxCount;
    });
  saveClaimed(claimed);
  return result;
}
