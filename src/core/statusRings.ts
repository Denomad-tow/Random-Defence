import type Phaser from 'phaser';
import {
  STATUS_FLAG_ARMOR,
  STATUS_FLAG_POISON,
  STATUS_FLAG_SLOW,
  STATUS_FLAG_STUN,
} from './effectsEngine';
import { fxRing, releaseFx } from './fx';
import { px } from './dpr';

export interface RingTarget {
  x: number;
  y: number;
  flags: number;
}

const shown = new WeakMap<Phaser.Scene, Phaser.GameObjects.Image[]>();

// 상태이상에 걸린 몬스터 주위에 색깔 링을 그린다: 파랑=감속, 노랑=기절, 초록=독,
// 빨강=방어 감소. 여러 개에 걸리면 링이 겹겹이 그려진다.
// 매 프레임 도형을 새로 그리지 않고, 미리 만든 링 이미지를 재사용해서 몬스터가 많아도 가볍다.
export function drawStatusRings(scene: Phaser.Scene, targets: RingTarget[], baseRadius: number): void {
  const previous = shown.get(scene) ?? [];
  previous.forEach((image) => releaseFx(image));
  const next: Phaser.GameObjects.Image[] = [];

  targets.forEach((target) => {
    if (target.flags === 0) return;
    let ring = 0;
    const draw = (color: number): void => {
      next.push(fxRing(scene, target.x, target.y, baseRadius + ring * px(4), color, 0.95).setDepth(2));
      ring += 1;
    };
    if (target.flags & STATUS_FLAG_STUN) draw(0xffe14d);
    if (target.flags & STATUS_FLAG_SLOW) draw(0x4fb4ff);
    if (target.flags & STATUS_FLAG_POISON) draw(0x7be07b);
    if (target.flags & STATUS_FLAG_ARMOR) draw(0xff6b6b);
  });

  shown.set(scene, next);
}
