import type Phaser from 'phaser';
import {
  STATUS_FLAG_ARMOR,
  STATUS_FLAG_POISON,
  STATUS_FLAG_SLOW,
  STATUS_FLAG_STUN,
} from './effectsEngine';
import { px } from './dpr';

export interface RingTarget {
  x: number;
  y: number;
  flags: number;
}

// 상태이상에 걸린 몬스터 주위에 색깔 링을 그린다: 파랑=감속, 노랑=기절, 초록=독,
// 빨강=방어 감소. 여러 개에 걸리면 링이 겹겹이 그려진다.
export function drawStatusRings(g: Phaser.GameObjects.Graphics, targets: RingTarget[], baseRadius: number): void {
  g.clear();

  targets.forEach((target) => {
    let ring = 0;
    const draw = (color: number): void => {
      g.lineStyle(px(2.5), color, 0.95);
      g.strokeCircle(target.x, target.y, baseRadius + ring * px(4));
      ring += 1;
    };
    if (target.flags & STATUS_FLAG_STUN) draw(0xffe14d);
    if (target.flags & STATUS_FLAG_SLOW) draw(0x4fb4ff);
    if (target.flags & STATUS_FLAG_POISON) draw(0x7be07b);
    if (target.flags & STATUS_FLAG_ARMOR) draw(0xff6b6b);
  });
}
