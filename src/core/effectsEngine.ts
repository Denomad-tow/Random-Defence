import {
  applyArmorBreak,
  applyPoison,
  applySlow,
  applyStun,
  damageTakenMultiplier,
  tickStatusEffects,
  type StatusEffects,
} from './combat';
import type { UnitDef, UnitEffect } from './units';

// 협동전·경쟁전에서 쓰는 "유닛 특수 효과" 계산. 화면(Phaser)을 전혀 모르는 순수
// 계산이라, 몬스터를 (x, y, 체력, 상태이상) 정보로만 다룬다. 결과는 "누가 얼마나
// 맞는지" 목록으로 돌려주고, 체력을 깎고 죽이는 일은 각 화면이 한다.
// 개인전(GameScene)은 자기 방식으로 같은 규칙을 이미 구현하고 있으므로 수치의 뜻은
// 그쪽과 똑같이 맞춘다(기본값 포함).

export interface FxMonster {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  status: StatusEffects;
}

export interface FxGeometry {
  cellSize: number;
  boardStep: number;
}

export interface FxDamage {
  monsterId: number;
  amount: number;
}

export interface FxBolt {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface HitResult {
  damages: FxDamage[];
  bolts: FxBolt[];
}

const STATUS_TYPES = ['slow', 'stun', 'poison', 'armorBreak'];
const CHAIN_DAMAGE_FALLOFF = 0.6;
const CHAIN_RANGE_CELLS = 1.6;
const EXTRA_TARGET_RANGE_CELLS = 1.8;
const AURA_REFRESH_SECONDS = 0.4;

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function findEffect(unit: UnitDef, type: string): UnitEffect | undefined {
  return unit.effects.find((e) => e.type === type);
}

// 사거리 안의 가까운 몬스터를 가까운 순으로 최대 count마리.
export function nearestMonsters<T extends FxMonster>(
  monsters: T[],
  x: number,
  y: number,
  rangePx: number,
  count: number,
): T[] {
  return monsters
    .filter((m) => m.hp > 0 && distance(x, y, m.x, m.y) <= rangePx)
    .sort((a, b) => distance(x, y, a.x, a.y) - distance(x, y, b.x, b.y))
    .slice(0, count);
}

// 한 번 공격에 몇 마리를 노리는지(다중 사격은 여러 마리, 나머지는 1마리).
export function attackTargetCount(unit: UnitDef): number {
  const multishot = findEffect(unit, 'multishot');
  return multishot ? num(multishot.count, 2) : 1;
}

function applyStatusEffect(target: FxMonster, effect: UnitEffect, rand: () => number): void {
  switch (effect.type) {
    case 'slow':
      target.status = applySlow(target.status, num(effect.value, 0), num(effect.duration, 0));
      break;
    case 'stun':
      if (rand() < num(effect.chance, 0)) {
        target.status = applyStun(target.status, num(effect.duration, 0));
      }
      break;
    case 'poison':
      target.status = applyPoison(target.status, num(effect.value, 0), num(effect.duration, 0));
      break;
    case 'armorBreak':
      target.status = applyArmorBreak(target.status, num(effect.value, 0), num(effect.duration, 0));
      break;
    default:
      break;
  }
}

function computeHitDamage(target: FxMonster, unit: UnitDef, attack: number, rand: () => number): number {
  let damage = attack;

  const execute = findEffect(unit, 'execute');
  if (execute) {
    const threshold = num(execute.threshold, 0.25);
    const multiplier = num(execute.multiplier, 1.8);
    if (target.maxHp > 0 && target.hp / target.maxHp <= threshold) {
      damage = Math.round(damage * multiplier);
    }
  }

  const crit = findEffect(unit, 'critStrike');
  if (crit && rand() < num(crit.chance, 0.2)) {
    damage = Math.round(damage * num(crit.multiplier, 3));
  }

  return damage;
}

function taken(monster: FxMonster, base: number): number {
  return Math.round(base * damageTakenMultiplier(monster.status));
}

// 공격 한 번이 target에 맞았을 때의 모든 결과(피해 + 상태이상 + 광역/관통/연쇄).
// 상태이상은 monsters 안의 몬스터 객체에 바로 걸리고, 피해는 목록으로 돌려준다.
export function resolveHit(
  target: FxMonster,
  unit: UnitDef,
  attack: number,
  monsters: FxMonster[],
  geo: FxGeometry,
  rand: () => number = Math.random,
): HitResult {
  const damages: FxDamage[] = [];
  const bolts: FxBolt[] = [];

  damages.push({ monsterId: target.id, amount: taken(target, computeHitDamage(target, unit, attack, rand)) });

  unit.effects
    .filter((effect) => STATUS_TYPES.includes(effect.type))
    .forEach((effect) => {
      applyStatusEffect(target, effect, rand);

      const extra = num(effect.targets, 1) - 1;
      if (extra > 0) {
        nearestMonsters(monsters, target.x, target.y, geo.cellSize * EXTRA_TARGET_RANGE_CELLS, extra + 1)
          .filter((m) => m !== target)
          .slice(0, extra)
          .forEach((m) => applyStatusEffect(m, effect, rand));
      }
    });

  const aoe = findEffect(unit, 'aoe');
  if (aoe) {
    const radius = num(aoe.radius, 1) * geo.boardStep;
    monsters.forEach((other) => {
      if (other === target || other.hp <= 0) return;
      if (distance(target.x, target.y, other.x, other.y) <= radius) {
        damages.push({ monsterId: other.id, amount: taken(other, attack) });
      }
    });
  }

  const pierce = findEffect(unit, 'pierce');
  if (pierce) {
    const band = num(pierce.bandWidth, 0.5) * geo.cellSize;
    monsters.forEach((other) => {
      if (other === target || other.hp <= 0) return;
      if (Math.abs(other.x - target.x) <= band) {
        damages.push({ monsterId: other.id, amount: taken(other, attack) });
      }
    });
  }

  const chain = findEffect(unit, 'chain');
  if (chain) {
    const hit = new Set<FxMonster>([target]);
    let fromX = target.x;
    let fromY = target.y;
    let bounceDamage = attack;

    for (let i = 0; i < num(chain.bounces, 2); i += 1) {
      const next = nearestMonsters(
        monsters.filter((m) => !hit.has(m)),
        fromX,
        fromY,
        geo.cellSize * CHAIN_RANGE_CELLS,
        1,
      )[0];
      if (!next) break;

      bounceDamage = Math.round(bounceDamage * CHAIN_DAMAGE_FALLOFF);
      hit.add(next);
      bolts.push({ fromX, fromY, toX: next.x, toY: next.y });
      damages.push({ monsterId: next.id, amount: taken(next, bounceDamage) });
      fromX = next.x;
      fromY = next.y;
    }
  }

  return { damages, bolts };
}

// 공격할 때마다 확률로 얻는 마나(마나 흡수). 못 얻으면 0.
export function rollManaLeech(unit: UnitDef, rand: () => number = Math.random): number {
  const leech = findEffect(unit, 'manaLeech');
  if (!leech) return 0;
  return rand() < num(leech.chance, 0.3) ? num(leech.value, 2) : 0;
}

// 골드 생성(마나 생성) 유닛의 주기와 양. 해당 유닛이 아니면 null.
export function goldGenInfo(unit: UnitDef): { interval: number; value: number } | null {
  const effect = findEffect(unit, 'goldGen');
  if (!effect) return null;
  return { interval: num(effect.interval, 2), value: Math.round(num(effect.value, 1)) };
}

// 냉기 결계 유닛의 감속량. 해당 유닛이 아니면 null.
export function frostAuraValue(unit: UnitDef): number | null {
  const effect = findEffect(unit, 'frostAura');
  return effect ? num(effect.value, 0.2) : null;
}

// 냉기 결계: 사거리 안 몬스터를 아주 짧게(0.4초) 계속 갱신하며 느리게 만든다.
export function applyFrostAura(monsters: FxMonster[], value: number): void {
  monsters.forEach((m) => {
    m.status = applySlow(m.status, value, AURA_REFRESH_SECONDS);
  });
}

export interface BuffSource {
  index: number;
  unit: UnitDef;
  x: number;
  y: number;
}

// 버프 유닛 주변(사거리 안) 아군 유닛이 받는 공격속도 보너스(칸 번호 -> 보너스 합).
export function computeBuffBonuses(units: BuffSource[], boardStep: number): Map<number, number> {
  const bonuses = new Map<number, number>();

  units.forEach((buffer) => {
    const effect = findEffect(buffer.unit, 'buff');
    if (!effect) return;

    const value = num(effect.value, 0);
    const rangePx = buffer.unit.range * boardStep;

    units.forEach((ally) => {
      if (ally.index === buffer.index) return;
      if (distance(buffer.x, buffer.y, ally.x, ally.y) <= rangePx) {
        bonuses.set(ally.index, (bonuses.get(ally.index) ?? 0) + value);
      }
    });
  });

  return bonuses;
}

// 매 프레임: 몬스터의 상태이상 시간을 줄이고, 이번 프레임에 들어갈 독 피해를 돌려준다.
export function tickMonsterStatus(monster: FxMonster, dt: number): number {
  const result = tickStatusEffects(monster.status, dt);
  monster.status = result.status;
  return result.poisonDamage;
}

// 화면에 표시할 상태이상 표시 비트(파티원에게 몬스터 위치와 함께 전달하는 용도).
export const STATUS_FLAG_SLOW = 1;
export const STATUS_FLAG_STUN = 2;
export const STATUS_FLAG_POISON = 4;
export const STATUS_FLAG_ARMOR = 8;

export function statusFlags(status: StatusEffects): number {
  let flags = 0;
  if (status.slowFactor !== undefined) flags |= STATUS_FLAG_SLOW;
  if (status.stunRemaining !== undefined) flags |= STATUS_FLAG_STUN;
  if (status.poisonRemaining !== undefined) flags |= STATUS_FLAG_POISON;
  if (status.armorBreakRemaining !== undefined) flags |= STATUS_FLAG_ARMOR;
  return flags;
}
