import Phaser from 'phaser';
import { computeBoardLayout, getCellPositions, FIELD_COLS } from '../core/board';
import { computeMonsterPath } from '../core/wave';
import {
  createNightSkyGlowTexture,
  createSlotTexture,
  createStarFieldTexture,
} from '../core/graphics/texture';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create(): void {
    this.layout();
    this.scale.on('resize', () => this.layout());
  }

  private layout(): void {
    this.children.removeAll(true);

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#07080d');

    this.drawBackground(width, height);

    const headerHeight = height * 0.08;
    const fieldTop = height * 0.34;
    const fieldAreaHeight = height * 0.5;

    const boardLayout = computeBoardLayout(width, fieldTop, fieldAreaHeight);
    const cells = getCellPositions(boardLayout);

    const boardWidth = boardLayout.cellSize * FIELD_COLS + boardLayout.gap * (FIELD_COLS - 1);
    const laneWidth = Math.min(boardWidth * 1.15, width * 0.9);
    const pathPoints = computeMonsterPath(
      width / 2,
      laneWidth,
      headerHeight,
      fieldTop - boardLayout.cellSize / 2 - px(10),
    );
    this.drawPath(pathPoints);
    this.drawFieldSlots(cells, boardLayout.cellSize);

    this.add
      .text(width / 2, headerHeight / 2, '초록 숲 · 1스테이지', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(15)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);
  }

  private drawBackground(width: number, height: number): void {
    const glowKey = `bg-glow-${Math.round(width)}x${Math.round(height)}`;
    const glowSize = Math.round(Math.max(width, height) * 1.1);
    createNightSkyGlowTexture(this, glowKey, glowSize);
    this.add.image(width / 2, height * 0.02, glowKey).setOrigin(0.5, 0);

    const starKey = `bg-stars-${Math.round(width)}x${Math.round(height)}`;
    createStarFieldTexture(this, starKey, Math.round(width), Math.round(height), 7);
    this.add.image(0, 0, starKey).setOrigin(0, 0).setAlpha(0.8);
  }

  private drawPath(points: { x: number; y: number }[]): void {
    const curve = new Phaser.Curves.Path(points[0].x, points[0].y);
    curve.splineTo(points.slice(1).map((p) => new Phaser.Math.Vector2(p.x, p.y)));
    const samples = curve.getPoints(48);

    const outer = this.add.graphics();
    outer.lineStyle(px(9), 0x8a6a2c, 0.55);
    this.strokeThroughPoints(outer, samples);

    const inner = this.add.graphics();
    inner.lineStyle(px(3), 0xd4b36a, 0.9);
    this.strokeThroughPoints(inner, samples);

    samples
      .filter((_, i) => i % 8 === 0)
      .forEach((p) => {
        const dot = this.add.graphics();
        dot.fillStyle(0xf3dc9a, 0.9);
        dot.fillCircle(p.x, p.y, px(2.5));
      });
  }

  private strokeThroughPoints(graphics: Phaser.GameObjects.Graphics, points: Phaser.Math.Vector2[]): void {
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.strokePath();
  }

  private drawFieldSlots(cells: { x: number; y: number }[], cellSize: number): void {
    const slotKey = `slot-${Math.round(cellSize)}`;
    createSlotTexture(this, slotKey, Math.round(cellSize));

    cells.forEach((cell) => {
      this.add.image(cell.x, cell.y, slotKey);
    });
  }
}
