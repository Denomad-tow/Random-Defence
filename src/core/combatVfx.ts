import Phaser from 'phaser';
import type { CellPosition } from './board';
import { getRarity } from './graphics/gem';
import { ROLE_ATTACK_COLORS, type UnitDef } from './units';
import { px } from './dpr';

// 개인전(GameScene)과 똑같은 공격·처치 연출을 협동전·경쟁전에서도 쓰기 위한 공용 함수들.

// 유닛에서 몬스터까지 날아가는 발사체. 등급이 높을수록 크고 반짝인다. 도착하면 onArrive를 부른다.
export function playProjectile(
  scene: Phaser.Scene,
  from: CellPosition,
  unit: UnitDef,
  getTarget: () => { x: number; y: number } | null,
  onArrive: () => void,
): void {
  const target = getTarget();
  if (!target) return;

  const color = ROLE_ATTACK_COLORS[unit.role] ?? 0xffffff;
  const rarity = getRarity(unit.rarity);
  const vfxScale = 1 + rarity.glow;

  if (rarity.glow > 0.25) {
    const glow = scene.add.circle(from.x, from.y, px(9) * vfxScale, color, 0.35);
    scene.tweens.add({ targets: glow, alpha: 0, scale: 1.6, duration: 200, onComplete: () => glow.destroy() });
  }

  const projectile = scene.add.circle(from.x, from.y, px(4) * vfxScale, color, 1);
  const trailCount = Math.min(4, rarity.sparkleCount);

  scene.tweens.add({
    targets: projectile,
    x: target.x,
    y: target.y,
    duration: 160,
    onUpdate: () => {
      if (trailCount === 0 || Math.random() > 0.5) return;
      const spark = scene.add.circle(projectile.x, projectile.y, px(2), color, 0.7);
      scene.tweens.add({ targets: spark, alpha: 0, duration: 220, onComplete: () => spark.destroy() });
    },
    onComplete: () => {
      projectile.destroy();
      onArrive();
    },
  });
}

// 몬스터가 죽을 때 사방으로 튀는 반짝임.
export function spawnDeathBurst(scene: Phaser.Scene, x: number, y: number, cellSize: number): void {
  const count = 7;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const distance = cellSize * (0.3 + Math.random() * 0.25);
    const spark = scene.add.circle(x, y, px(2.5), 0xf3dc9a, 0.9);

    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      alpha: 0,
      duration: 380,
      onComplete: () => spark.destroy(),
    });
  }
}
