import { NORMAL_UNITS } from '../core/units';
import { getStat, type StatKey } from './stats';
import { addGold } from './gold';
import { addBox } from './boxes';
import { loadCollection } from './collection';
import { RARITY_ORDER, getBoxType } from './gacha';
import { computeRunReward } from './rewards';
import { totalResearchLevels } from './research';
import { getRarity } from '../core/graphics/gem';

// 업적: 조건을 달성하면 보상(골드·상자)을 한 번 받을 수 있다.
// 새 업적을 추가하고 싶으면 아래 "업적 목록 만들기"에 줄을 하나 더하면 된다.

const CLAIMED_KEY = 'rd_achv';

export const ACHIEVEMENT_CATEGORIES = ['스테이지', '몬스터', '성장', '수집', '기타'] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export interface AchievementReward {
  gold: number;
  boxId?: string;
  boxCount?: number;
}

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  name: string;
  desc: string;
  goal: number;
  reward: AchievementReward;
  progress: () => number;
  // 진행 문구를 "현재 / 목표" 숫자가 아닌 다른 모양으로 보여주고 싶을 때(등급·별 업적)
  progressText?: (value: number, goal: number) => string;
}

// ----- 진행도를 재는 재료 -----

function distinctUnits(): number {
  return new Set(loadCollection()).size;
}

// 가진 유닛 중 가장 높은 등급 번호(N=0 ... TR=8)
function highestRarityIndex(): number {
  const byId = new Map(NORMAL_UNITS.map((u) => [u.id, u.rarity]));
  let best = 0;
  new Set(loadCollection()).forEach((id) => {
    const rarity = byId.get(id);
    if (rarity) best = Math.max(best, RARITY_ORDER.indexOf(rarity));
  });
  return best;
}

const stat = (key: StatKey) => (): number => getStat(key);

// ----- 업적 목록 만들기 -----

function build(): AchievementDef[] {
  const list: AchievementDef[] = [];

  // 스테이지: 10 단위로 Stage 300까지. 보상은 판 종료 상자 기준과 같은 등급의 상자 + 골드.
  for (let stage = 10; stage <= 300; stage += 10) {
    const run = computeRunReward(stage);
    const boxId = stage < 30 ? 'wood' : run.boxId;
    const boxCount = stage < 30 ? stage / 10 : run.boxCount;
    list.push({
      id: `stage-${stage}`,
      category: '스테이지',
      name: `Stage ${stage} 클리어`,
      desc: `스테이지 ${stage}에 도달하기 (개인전·협동전·경쟁전 통틀어)`,
      goal: stage,
      reward: { gold: stage * 15, boxId, boxCount },
      progress: stat('bestStage'),
    });
  }

  // 몬스터 처치 수
  const kills: Array<[number, AchievementReward]> = [
    [100, { gold: 100, boxId: 'wood', boxCount: 1 }],
    [500, { gold: 200, boxId: 'wood', boxCount: 1 }],
    [1000, { gold: 300, boxId: 'wood', boxCount: 2 }],
    [3000, { gold: 500, boxId: 'silver', boxCount: 1 }],
    [5000, { gold: 800, boxId: 'silver', boxCount: 2 }],
    [10000, { gold: 1500, boxId: 'gold', boxCount: 1 }],
    [30000, { gold: 3000, boxId: 'gold', boxCount: 2 }],
    [50000, { gold: 5000, boxId: 'diamond', boxCount: 1 }],
    [100000, { gold: 8000, boxId: 'diamond', boxCount: 2 }],
    [300000, { gold: 15000, boxId: 'platinum', boxCount: 1 }],
    [500000, { gold: 25000, boxId: 'mithril', boxCount: 1 }],
    [1000000, { gold: 50000, boxId: 'orichalcum', boxCount: 1 }],
  ];
  kills.forEach(([goal, reward]) =>
    list.push({
      id: `kills-${goal}`,
      category: '몬스터',
      name: `몬스터 ${goal.toLocaleString('ko-KR')}마리 처치`,
      desc: '모든 모드에서 처치한 몬스터의 누적 수',
      goal,
      reward,
      progress: stat('kills'),
    }),
  );

  const bosses: Array<[number, AchievementReward]> = [
    [1, { gold: 150, boxId: 'wood', boxCount: 1 }],
    [5, { gold: 400, boxId: 'silver', boxCount: 1 }],
    [10, { gold: 800, boxId: 'silver', boxCount: 2 }],
    [30, { gold: 2000, boxId: 'gold', boxCount: 1 }],
    [50, { gold: 4000, boxId: 'gold', boxCount: 2 }],
    [100, { gold: 8000, boxId: 'diamond', boxCount: 1 }],
    [300, { gold: 20000, boxId: 'diamond', boxCount: 2 }],
    [500, { gold: 40000, boxId: 'platinum', boxCount: 1 }],
  ];
  bosses.forEach(([goal, reward]) =>
    list.push({
      id: `boss-${goal}`,
      category: '몬스터',
      name: `보스 ${goal}마리 처치`,
      desc: '10스테이지마다 나오는 보스를 처치한 누적 수',
      goal,
      reward,
      progress: stat('bossKills'),
    }),
  );

  // 성장: 소환·합성·별·강화·연구
  const summons: Array<[number, AchievementReward]> = [
    [50, { gold: 100, boxId: 'wood', boxCount: 1 }],
    [300, { gold: 300, boxId: 'wood', boxCount: 2 }],
    [1000, { gold: 800, boxId: 'silver', boxCount: 1 }],
    [5000, { gold: 3000, boxId: 'gold', boxCount: 1 }],
    [20000, { gold: 10000, boxId: 'diamond', boxCount: 1 }],
  ];
  summons.forEach(([goal, reward]) =>
    list.push({ id: `summon-${goal}`, category: '성장', name: `유닛 ${goal.toLocaleString('ko-KR')}번 소환`, desc: '소환·랜덤 소환 횟수의 합', goal, reward, progress: stat('summons') }),
  );

  const merges: Array<[number, AchievementReward]> = [
    [10, { gold: 150, boxId: 'wood', boxCount: 1 }],
    [50, { gold: 400, boxId: 'wood', boxCount: 2 }],
    [200, { gold: 1200, boxId: 'silver', boxCount: 1 }],
    [1000, { gold: 4000, boxId: 'gold', boxCount: 1 }],
    [5000, { gold: 12000, boxId: 'diamond', boxCount: 1 }],
  ];
  merges.forEach(([goal, reward]) =>
    list.push({ id: `merge-${goal}`, category: '성장', name: `합성 ${goal.toLocaleString('ko-KR')}번`, desc: '드래그·자동 합성으로 유닛을 합친 횟수', goal, reward, progress: stat('merges') }),
  );

  const stars: Array<[number, AchievementReward]> = [
    [2, { gold: 100, boxId: 'wood', boxCount: 1 }],
    [3, { gold: 300, boxId: 'silver', boxCount: 1 }],
    [4, { gold: 1000, boxId: 'gold', boxCount: 1 }],
    [5, { gold: 4000, boxId: 'diamond', boxCount: 1 }],
    [6, { gold: 10000, boxId: 'platinum', boxCount: 1 }],
    [7, { gold: 30000, boxId: 'mithril', boxCount: 1 }],
  ];
  stars.forEach(([goal, reward]) =>
    list.push({ id: `star-${goal}`, category: '성장', name: `★${goal} 유닛 만들기`, desc: `합성으로 별 ${goal}개 유닛을 만들어 보기`, goal, reward, progress: stat('maxStar'), progressText: (v, g) => `현재 ★${v} / ★${g}` }),
  );

  const enhances: Array<[number, AchievementReward]> = [
    [10, { gold: 100, boxId: 'wood', boxCount: 1 }],
    [50, { gold: 400, boxId: 'silver', boxCount: 1 }],
    [200, { gold: 1500, boxId: 'gold', boxCount: 1 }],
    [1000, { gold: 6000, boxId: 'diamond', boxCount: 1 }],
  ];
  enhances.forEach(([goal, reward]) =>
    list.push({ id: `enhance-${goal}`, category: '성장', name: `인게임 강화 ${goal.toLocaleString('ko-KR')}번`, desc: '유닛을 더블 탭해서 강화한 횟수', goal, reward, progress: stat('enhances') }),
  );

  const research: Array<[number, AchievementReward]> = [
    [10, { gold: 200, boxId: 'wood', boxCount: 1 }],
    [50, { gold: 800, boxId: 'silver', boxCount: 1 }],
    [100, { gold: 2000, boxId: 'gold', boxCount: 1 }],
    [300, { gold: 6000, boxId: 'diamond', boxCount: 1 }],
    [500, { gold: 12000, boxId: 'platinum', boxCount: 1 }],
    [1000, { gold: 30000, boxId: 'mithril', boxCount: 1 }],
  ];
  research.forEach(([goal, reward]) =>
    list.push({ id: `research-${goal}`, category: '성장', name: `연구 레벨 합계 ${goal}`, desc: '모든 연구 항목의 레벨을 더한 값', goal, reward, progress: totalResearchLevels }),
  );

  // 수집: 유닛 종류와 최고 등급
  const collect: Array<[number, AchievementReward]> = [
    [10, { gold: 200, boxId: 'wood', boxCount: 1 }],
    [20, { gold: 500, boxId: 'silver', boxCount: 1 }],
    [30, { gold: 1000, boxId: 'silver', boxCount: 2 }],
    [50, { gold: 2500, boxId: 'gold', boxCount: 1 }],
    [70, { gold: 5000, boxId: 'gold', boxCount: 2 }],
    [100, { gold: 12000, boxId: 'diamond', boxCount: 1 }],
    [135, { gold: 50000, boxId: 'orichalcum', boxCount: 1 }],
  ];
  collect.forEach(([goal, reward]) =>
    list.push({ id: `collect-${goal}`, category: '수집', name: `유닛 ${goal}종 모으기`, desc: '서로 다른 유닛을 모은 종류 수 (전체 135종)', goal, reward, progress: distinctUnits }),
  );

  const rarityGoals: Array<[number, string, AchievementReward]> = [
    [3, 'SSR', { gold: 500, boxId: 'silver', boxCount: 1 }],
    [4, 'SSSR', { gold: 1500, boxId: 'gold', boxCount: 1 }],
    [5, 'UR', { gold: 5000, boxId: 'diamond', boxCount: 1 }],
    [6, 'LR', { gold: 15000, boxId: 'platinum', boxCount: 1 }],
    [7, 'GR', { gold: 40000, boxId: 'mithril', boxCount: 1 }],
    [8, 'TR', { gold: 100000, boxId: 'orichalcum', boxCount: 1 }],
  ];
  rarityGoals.forEach(([index, label, reward]) =>
    list.push({ id: `rarity-${label}`, category: '수집', name: `${label} 등급 유닛 획득`, desc: `${label} 등급 유닛을 처음으로 얻기`, goal: index, reward, progress: highestRarityIndex, progressText: (v) => (v >= index ? '달성' : `현재 최고 ${getRarity(RARITY_ORDER[v]).label}`) }),
  );

  // 기타: 판 수, 협동·경쟁, 상자
  const runs: Array<[number, AchievementReward]> = [
    [1, { gold: 50, boxId: 'wood', boxCount: 1 }],
    [10, { gold: 300, boxId: 'wood', boxCount: 2 }],
    [50, { gold: 1000, boxId: 'silver', boxCount: 1 }],
    [100, { gold: 2500, boxId: 'silver', boxCount: 2 }],
    [500, { gold: 10000, boxId: 'gold', boxCount: 2 }],
  ];
  runs.forEach(([goal, reward]) =>
    list.push({ id: `runs-${goal}`, category: '기타', name: `${goal}판 플레이`, desc: '개인전·협동전·경쟁전 통틀어 끝까지 한 판 수', goal, reward, progress: stat('runs') }),
  );

  const coop: Array<[number, AchievementReward]> = [
    [1, { gold: 200, boxId: 'wood', boxCount: 2 }],
    [10, { gold: 1000, boxId: 'silver', boxCount: 2 }],
    [50, { gold: 5000, boxId: 'gold', boxCount: 2 }],
  ];
  coop.forEach(([goal, reward]) =>
    list.push({ id: `coop-${goal}`, category: '기타', name: `협동전 ${goal}판`, desc: '친구와 함께한 협동전 판 수', goal, reward, progress: stat('coopRuns') }),
  );

  const wins: Array<[number, AchievementReward]> = [
    [1, { gold: 300, boxId: 'silver', boxCount: 1 }],
    [5, { gold: 1500, boxId: 'silver', boxCount: 2 }],
    [10, { gold: 4000, boxId: 'gold', boxCount: 1 }],
    [30, { gold: 12000, boxId: 'diamond', boxCount: 1 }],
  ];
  wins.forEach(([goal, reward]) =>
    list.push({ id: `versus-${goal}`, category: '기타', name: `경쟁전 ${goal}승`, desc: '경쟁전에서 우승한 횟수', goal, reward, progress: stat('versusWins') }),
  );

  const boxes: Array<[number, AchievementReward]> = [
    [5, { gold: 100, boxId: 'wood', boxCount: 1 }],
    [20, { gold: 400, boxId: 'silver', boxCount: 1 }],
    [50, { gold: 1200, boxId: 'silver', boxCount: 2 }],
    [100, { gold: 3000, boxId: 'gold', boxCount: 1 }],
    [300, { gold: 9000, boxId: 'diamond', boxCount: 1 }],
    [1000, { gold: 30000, boxId: 'platinum', boxCount: 1 }],
  ];
  boxes.forEach(([goal, reward]) =>
    list.push({ id: `box-${goal}`, category: '기타', name: `상자 ${goal}개 열기`, desc: '상자를 연 누적 개수', goal, reward, progress: stat('boxesOpened') }),
  );

  return list;
}

export const ACHIEVEMENTS: AchievementDef[] = build();

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
  return ACHIEVEMENTS.map((def) => {
    const value = def.progress();
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

// 달성한 업적의 보상을 받는다. 받을 수 없으면 null.
export function claimAchievement(id: string): AchievementReward | null {
  const status = getAchievementStatuses().find((s) => s.def.id === id);
  if (!status || status.state !== 'claimable') return null;

  const reward = status.def.reward;
  addGold(reward.gold);
  if (reward.boxId && reward.boxCount) addBox(reward.boxId, reward.boxCount);

  const claimed = loadClaimed();
  claimed.add(id);
  saveClaimed(claimed);
  return reward;
}

// 받을 수 있는 보상을 전부 받는다. 받은 개수와 합쳐진 보상을 돌려준다.
export function claimAllAchievements(): { count: number; gold: number; boxes: Record<string, number> } {
  const result = { count: 0, gold: 0, boxes: {} as Record<string, number> };
  getAchievementStatuses()
    .filter((s) => s.state === 'claimable')
    .forEach((s) => {
      const reward = claimAchievement(s.def.id);
      if (!reward) return;
      result.count += 1;
      result.gold += reward.gold;
      if (reward.boxId && reward.boxCount) result.boxes[reward.boxId] = (result.boxes[reward.boxId] ?? 0) + reward.boxCount;
    });
  return result;
}
