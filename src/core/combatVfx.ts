import Phaser from 'phaser';
import type { CellPosition } from './board';
import { getRarity } from './graphics/gem';
import { ROLE_ATTACK_COLORS, type UnitDef } from './units';
import { px } from './dpr';
import { fxDot, fxTween, projectileEnded, projectileSlotFree, projectileStarted, releaseFx, trySpark } from './fx';

// 개인전·협동전·경쟁전이 똑같이 쓰는 공격·처치 연출. 그리는 재료는 core/fx.ts의 가벼운 원 이미지를 쓴다.

// 발사체가 유닛 한가운데서 나가면 유닛 모양이 가려지므로, 목표 방향으로 유닛 가장자리 바깥에서 출발시킨다.
export function projectileStart(
  from: { x: number; y: number },
  target: { x: number; y: number },
  cellSize: number,
): { x: number; y: number } {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return { x: from.x, y: from.y };
  const offset = Math.min(cellSize * 0.5, dist * 0.5);
  return { x: from.x + (dx / dist) * offset, y: from.y + (dy / dist) * offset };
}

// 유닛에서 몬스터까지 날아가는 발사체. 등급이 높을수록 크고 반짝인다. 도착하면 onArrive를 부른다.
// 화면에 동시에 떠 있는 발사체가 너무 많으면(후반 스테이지) 그림 없이 바로 효과만 적용해서 프레임을 지킨다.
export function playProjectile(
  scene: Phaser.Scene,
  cellFrom: CellPosition,
  unit: UnitDef,
  getTarget: () => { x: number; y: number } | null,
  onArrive: () => void,
  cellSize: number,
): void {
  const target = getTarget();
  if (!target) return;

  if (!projectileSlotFree()) {
    onArrive();
    return;
  }

  const from = projectileStart(cellFrom, target, cellSize);
  const color = ROLE_ATTACK_COLORS[unit.role] ?? 0xffffff;
  const rarity = getRarity(unit.rarity);
  const vfxScale = 1 + rarity.glow;

  if (rarity.glow > 0.25) {
    const glow = fxDot(scene, from.x, from.y, px(9) * vfxScale, color, 0.35);
    fxTween(scene, glow, { alpha: 0, scale: glow.scale * 1.6 }, 200);
  }

  const projectile = fxDot(scene, from.x, from.y, px(4) * vfxScale, color, 1);
  projectileStarted();
  const trailCount = Math.min(4, rarity.sparkleCount);

  scene.tweens.add({
    targets: projectile,
    x: target.x,
    y: target.y,
    duration: 160,
    onUpdate: () => {
      if (trailCount === 0 || Math.random() > 0.5) return;
      trySpark(scene, projectile.x, projectile.y, px(2), color, 0.7, 220);
    },
    onComplete: () => {
      releaseFx(projectile);
      projectileEnded();
      onArrive();
    },
  });
}

// 몬스터가 죽을 때 사방으로 튀는 반짝임(동시에 너무 많으면 일부만 그린다).
export function spawnDeathBurst(scene: Phaser.Scene, x: number, y: number, cellSize: number): void {
  const count = 6;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const distance = cellSize * (0.3 + Math.random() * 0.25);
    trySpark(scene, x, y, px(2.5), 0xf3dc9a, 0.9, 380, {
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
    });
  }
}

// 사슬 번개처럼 한 점에서 다른 점으로 짧게 튀는 불꽃.
export function playBolt(scene: Phaser.Scene, fromX: number, fromY: number, toX: number, toY: number, color: number, duration: number, onArrive?: () => void): void {
  const bolt = fxDot(scene, fromX, fromY, px(3), color, 1);
  fxTween(scene, bolt, { x: toX, y: toY }, duration, onArrive);
}
