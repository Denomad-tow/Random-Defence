import { MAX_SLOW_FACTOR } from './starBalance';

export interface StatusEffects {
  slowFactor?: number;
  slowRemaining?: number;
  stunRemaining?: number;
  armorBreakFactor?: number;
  armorBreakRemaining?: number;
  poisonDamage?: number;
  poisonRemaining?: number;
  poisonTickRemaining?: number;
}

export interface StatusTickResult {
  status: StatusEffects;
  poisonDamage: number;
}

const POISON_TICK_INTERVAL = 1;

export function tickStatusEffects(status: StatusEffects, dt: number): StatusTickResult {
  const next: StatusEffects = { ...status };
  let poisonDamage = 0;

  if (next.slowRemaining !== undefined) {
    next.slowRemaining -= dt;
    if (next.slowRemaining <= 0) {
      delete next.slowFactor;
      delete next.slowRemaining;
    }
  }

  if (next.stunRemaining !== undefined) {
    next.stunRemaining -= dt;
    if (next.stunRemaining <= 0) {
      delete next.stunRemaining;
    }
  }

  if (next.armorBreakRemaining !== undefined) {
    next.armorBreakRemaining -= dt;
    if (next.armorBreakRemaining <= 0) {
      delete next.armorBreakFactor;
      delete next.armorBreakRemaining;
    }
  }

  if (next.poisonRemaining !== undefined && next.poisonDamage !== undefined) {
    next.poisonRemaining -= dt;
    next.poisonTickRemaining = (next.poisonTickRemaining ?? POISON_TICK_INTERVAL) - dt;

    if (next.poisonTickRemaining <= 0 && next.poisonRemaining > 0) {
      poisonDamage = next.poisonDamage;
      next.poisonTickRemaining += POISON_TICK_INTERVAL;
    }

    if (next.poisonRemaining <= 0) {
      delete next.poisonDamage;
      delete next.poisonRemaining;
      delete next.poisonTickRemaining;
    }
  }

  return { status: next, poisonDamage };
}

export function applySlow(status: StatusEffects, factor: number, duration: number): StatusEffects {
  return { ...status, slowFactor: Math.min(factor, MAX_SLOW_FACTOR), slowRemaining: duration };
}

export function applyStun(status: StatusEffects, duration: number): StatusEffects {
  return { ...status, stunRemaining: duration };
}

export function applyArmorBreak(status: StatusEffects, factor: number, duration: number): StatusEffects {
  return { ...status, armorBreakFactor: factor, armorBreakRemaining: duration };
}

export function applyPoison(status: StatusEffects, damage: number, duration: number): StatusEffects {
  return {
    ...status,
    poisonDamage: damage,
    poisonRemaining: duration,
    poisonTickRemaining: status.poisonTickRemaining ?? POISON_TICK_INTERVAL,
  };
}

export function effectiveSpeedMultiplier(status: StatusEffects): number {
  if (status.stunRemaining !== undefined) return 0;
  if (status.slowFactor !== undefined) return Math.max(0, 1 - status.slowFactor);
  return 1;
}

export function damageTakenMultiplier(status: StatusEffects): number {
  return 1 + (status.armorBreakFactor ?? 0);
}
