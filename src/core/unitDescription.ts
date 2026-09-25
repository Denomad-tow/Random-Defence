import type { UnitDef, UnitEffect } from './units';

// 유닛 데이터(units.json)의 실제 수치를 읽어서 사람이 읽는 설명 문장을 만든다.
// 수치가 바뀌어도 설명이 저절로 따라가도록, 문장은 여기서 만들고 숫자는 데이터에서 가져온다.
// 값이 빠져 있는 효과는 전투 코드(GameScene 등)가 쓰는 기본값과 똑같이 맞춘다.

const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`;
const sec = (v: number): string => `${Math.round(v * 10) / 10}초`;

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function targetsNote(effect: UnitEffect): string {
  const n = num(effect.targets, 1);
  return n > 1 ? ` 맞은 몬스터 근처까지 포함해 최대 ${n}마리에게 적용돼요.` : '';
}

function effectLine(effect: UnitEffect): string {
  switch (effect.type) {
    case 'slow':
      return `공격이 맞으면 그 몬스터의 이동속도를 ${pct(num(effect.value, 0))} 늦춰요 (${sec(num(effect.duration, 0))} 지속).${targetsNote(effect)}`;
    case 'stun':
      return `공격할 때마다 ${pct(num(effect.chance, 0))} 확률로 몬스터를 ${sec(num(effect.duration, 0))} 동안 멈춰 세워요.${targetsNote(effect)}`;
    case 'poison':
      return `${sec(num(effect.duration, 0))} 동안 매초 ${num(effect.value, 0)}의 독 피해를 줘요.${targetsNote(effect)}`;
    case 'armorBreak':
      return `${sec(num(effect.duration, 0))} 동안 그 몬스터가 받는 모든 피해를 ${pct(num(effect.value, 0))} 늘려요.${targetsNote(effect)}`;
    case 'aoe':
      return `맞은 몬스터 주변 반경 ${num(effect.radius, 1)}칸 안의 다른 몬스터도 같은 피해를 입어요.`;
    case 'pierce':
      return `맞은 몬스터와 같은 세로줄(폭 ${num(effect.bandWidth, 0.5)}칸) 안의 몬스터를 모두 같은 피해로 꿰뚫어요.`;
    case 'chain':
      return `맞은 몬스터 근처의 다른 몬스터로 최대 ${num(effect.bounces, 2)}번 튕겨요. 튕길 때마다 피해가 60%로 줄어요.`;
    case 'multishot':
      return `한 번에 가장 가까운 몬스터 ${num(effect.count, 2)}마리를 동시에 공격해요.`;
    case 'execute':
      return `몬스터 체력이 ${pct(num(effect.threshold, 0.25))} 이하로 떨어져 있으면 피해가 ${num(effect.multiplier, 1.8)}배가 돼요.`;
    case 'critStrike':
      return `${pct(num(effect.chance, 0.2))} 확률로 ${num(effect.multiplier, 3)}배 치명타를 넣어요.`;
    case 'manaLeech':
      return `공격할 때마다 ${pct(num(effect.chance, 0.3))} 확률로 마나 ${num(effect.value, 2)}을(를) 얻어요.`;
    case 'goldGen':
      return `공격하지 않고 ${sec(num(effect.interval, 0))}마다 마나 ${num(effect.value, 0)}을(를) 만들어요.`;
    case 'buff':
      return `사거리 안 아군 유닛의 공격속도를 ${pct(num(effect.value, 0))} 올려줘요. (직접 공격은 하지 않아요)`;
    case 'frostAura':
      return `공격하지 않고, 사거리 안 몬스터의 이동속도를 항상 ${pct(num(effect.value, 0))} 늦춰요.`;
    default:
      return '';
  }
}

// 상세 설명: 효과마다 한 줄씩. 별도 효과가 없는 유닛은 기본 성격을 한 줄로 설명한다.
export function detailLines(unit: UnitDef): string[] {
  const lines = unit.effects.map(effectLine).filter((line) => line.length > 0);
  if (lines.length === 0) {
    lines.push('특별한 효과 없이, 한 마리를 강하게 때리는 기본 공격이에요.');
  }
  return lines;
}

// 카드에 들어갈 짧은 요약(핵심 수치만).
export function shortSummary(unit: UnitDef): string {
  const effect = unit.effects[0];
  if (!effect) return '강력한 단일 공격';

  switch (effect.type) {
    case 'slow':
      return `이동속도 -${pct(num(effect.value, 0))}`;
    case 'stun':
      return `기절 ${pct(num(effect.chance, 0))} · ${sec(num(effect.duration, 0))}`;
    case 'poison':
      return `독 ${num(effect.value, 0)}/초 · ${sec(num(effect.duration, 0))}`;
    case 'armorBreak':
      return `받는 피해 +${pct(num(effect.value, 0))}`;
    case 'aoe':
      return `범위 반경 ${num(effect.radius, 1)}칸`;
    case 'pierce':
      return `관통 폭 ${num(effect.bandWidth, 0.5)}칸`;
    case 'chain':
      return `${num(effect.bounces, 2)}회 연쇄`;
    case 'multishot':
      return `${num(effect.count, 2)}마리 동시`;
    case 'execute':
      return `체력 ${pct(num(effect.threshold, 0.25))}↓ ×${num(effect.multiplier, 1.8)}`;
    case 'critStrike':
      return `치명 ${pct(num(effect.chance, 0.2))} ×${num(effect.multiplier, 3)}`;
    case 'manaLeech':
      return `마나 +${num(effect.value, 2)} (${pct(num(effect.chance, 0.3))})`;
    case 'goldGen':
      return `${sec(num(effect.interval, 0))}마다 마나 +${num(effect.value, 0)}`;
    case 'buff':
      return `공격속도 +${pct(num(effect.value, 0))}`;
    case 'frostAura':
      return `이동속도 -${pct(num(effect.value, 0))}`;
    default:
      return '';
  }
}
