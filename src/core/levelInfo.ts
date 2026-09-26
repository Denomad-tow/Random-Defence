import type { UnitDef } from './units';
import type { InfoModalContent } from './infoModal';
import {
  GENERAL_BONUS_PER_LEVEL,
  ROLE_BONUS_PER_LEVEL,
  MAX_RESEARCH_LEVEL,
  getGeneralLabel,
  researchCost,
  type GeneralResearchKey,
} from '../meta/research';
import { MAX_UNIT_LEVEL, levelStatMultiplier, levelUpCost, availableDuplicates } from '../meta/levels';

// 연구·컬렉션 카드를 눌렀을 때 "레벨이 오르면 무엇이 얼마나 좋아지는지"를 알려주는 문구를 만든다.
// 수치는 실제 전투 계산에 쓰는 값(levels.ts / research.ts)에서 그대로 가져온다.

const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`;
const times = (v: number): string => `×${Math.round(v * 100) / 100}`;
const trim = (v: number): number => Math.round(v * 100) / 100;

function numericEffect(unit: UnitDef, type: string): number | null {
  const effect = unit.effects.find((e) => e.type === type);
  return effect && typeof effect.value === 'number' ? effect.value : null;
}

// 컬렉션: 유닛 레벨 정보
export function unitLevelInfo(unit: UnitDef, level: number, ownedCount: number): InfoModalContent {
  const lines: string[] = [];

  if (level >= MAX_UNIT_LEVEL) {
    lines.push(`최대 레벨(Lv.${MAX_UNIT_LEVEL})이에요. 지금 공격력 배율은 ${times(levelStatMultiplier(level))}예요.`);
    return { title: `${unit.name} · Lv.${level}`, subtitle: '레벨 정보', lines };
  }

  const now = levelStatMultiplier(level);
  const next = levelStatMultiplier(level + 1);
  lines.push(`• 공격력 배율: ${times(now)} → ${times(next)} (레벨당 +${pct(next - now)})`);

  if (unit.attack > 0) {
    lines.push(`• 기본 공격력: ${Math.round(unit.attack * now)} → ${Math.round(unit.attack * next)}  (기본 ${unit.attack} 기준)`);
  }

  const buff = numericEffect(unit, 'buff');
  if (buff !== null) lines.push(`• 주변 아군 공격속도 버프: +${pct(buff * now)} → +${pct(buff * next)}`);
  const gold = numericEffect(unit, 'goldGen');
  if (gold !== null) lines.push(`• 마나 생성량: ${Math.round(gold * now)} → ${Math.round(gold * next)} (한 번에)`);
  const frost = numericEffect(unit, 'frostAura');
  if (frost !== null) lines.push(`• 이동속도 감소: ${pct(frost * now)} → ${pct(frost * next)}`);

  lines.push('• 둔화·독 같은 상태 효과 수치는 레벨이 아니라 "연구"의 역할 연구로 커져요.');

  const cost = levelUpCost(level);
  const available = availableDuplicates(ownedCount);
  lines.push(`• 레벨업 비용: 중복 카드 ${cost.duplicates}장 + 골드 ${cost.gold} (지금 남는 중복 카드 ${available}장)`);

  return { title: `${unit.name} · Lv.${level} → Lv.${level + 1}`, subtitle: '레벨업하면 이렇게 좋아져요', lines };
}

// 연구: 일반 연구(공격력 / 공격속도)
export function generalResearchInfo(key: GeneralResearchKey, level: number): InfoModalContent {
  const perLevel = GENERAL_BONUS_PER_LEVEL[key];
  const label = getGeneralLabel(key);
  const what = key === 'attack' ? '모든 유닛의 공격력' : '모든 유닛의 공격속도';

  if (level >= MAX_RESEARCH_LEVEL) {
    return {
      title: `${label} · Lv.${level}`,
      subtitle: '최대 레벨',
      lines: [`${what}이 +${pct(level * perLevel)} 올라 있어요.`],
    };
  }

  return {
    title: `${label} · Lv.${level} → Lv.${level + 1}`,
    subtitle: '연구하면 이렇게 좋아져요',
    lines: [
      `• ${what}이 레벨당 +${pct(perLevel)}씩 올라가요.`,
      `• 지금 +${pct(level * perLevel)} → 다음 +${pct((level + 1) * perLevel)}`,
      '• 개인전·협동전·경쟁전(일반)에 모두 적용돼요. 경쟁전 균형 모드에서는 적용되지 않아요.',
      `• 연구 비용: 골드 ${researchCost(level)}`,
    ],
  };
}

// 연구: 역할 연구
export function roleResearchInfo(roleLabel: string, level: number): InfoModalContent {
  if (level >= MAX_RESEARCH_LEVEL) {
    return {
      title: `${roleLabel} 연구 · Lv.${level}`,
      subtitle: '최대 레벨',
      lines: [`이 역할 유닛의 공격력과 상태 효과 수치가 ${times(1 + level * ROLE_BONUS_PER_LEVEL)}로 올라 있어요.`],
    };
  }

  const now = 1 + level * ROLE_BONUS_PER_LEVEL;
  const next = 1 + (level + 1) * ROLE_BONUS_PER_LEVEL;

  return {
    title: `${roleLabel} 연구 · Lv.${level} → Lv.${level + 1}`,
    subtitle: '연구하면 이렇게 좋아져요',
    lines: [
      `• 이 역할 유닛의 공격력: ${times(now)} → ${times(next)} (레벨당 +${pct(ROLE_BONUS_PER_LEVEL)})`,
      `• 둔화 %, 독 피해, 방어 감소 %, 버프·냉기 결계·마나 생성 수치도 같은 비율(${times(trim(next / now))})로 커져요.`,
      '• 개인전·협동전·경쟁전(일반)에 모두 적용돼요. 경쟁전 균형 모드에서는 적용되지 않아요.',
      `• 연구 비용: 골드 ${researchCost(level)}`,
    ],
  };
}
