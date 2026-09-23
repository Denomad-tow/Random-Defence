import Phaser from 'phaser';
import { computeBoardLayout, getCellPositions, FIELD_COLS } from '../core/board';
import { computeMonsterPath, createInitialWaveState, nextSpawn, stageHpMultiplier, type WaveState } from '../core/wave';
import { MONSTER_KINDS } from '../core/monsters';
import {
  createNightSkyGlowTexture,
  createSlotTexture,
  createStarFieldTexture,
  createMonsterTexture,
} from '../core/graphics/texture';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
const SPAWN_INTERVAL_MS = 1100;

export class GameScene extends Phaser.Scene {
  private monsterPath!: Phaser.Curves.Path;
  private cellSize = 0;
  private waveState: WaveState = createInitialWaveState();
  private monsters: Phaser.GameObjects.Image[] = [];
  private hudText!: Phaser.GameObjects.Text;

  constructor() {
    super('game');
  }

  create(): void {
    this.layout();
    this.scale.on('resize', () => this.layout());
    this.time.addEvent({ delay: SPAWN_INTERVAL_MS, loop: true, callback: () => this.spawnMonster() });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    this.monsters.forEach((monster) => {
      if (monster.getData('settled')) return;

      const speed = monster.getData('speed') as number;
      const t = Math.min(1, (monster.getData('t') as number) + speed * dt);
      monster.setData('t', t);

      const point = this.monsterPath.getPoint(t);

      if (t >= 1) {
        monster.setData('settled', true);
        monster.setPosition(point.x + (monster.getData('scatterX') as number), point.y + (monster.getData('scatterY') as number));
      } else {
        monster.setPosition(point.x, point.y);
      }
    });
  }

  private layout(): void {
    this.children.removeAll(true);
    this.monsters = [];

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#07080d');

    this.drawBackground(width, height);

    const headerHeight = height * 0.08;
    const fieldTop = height * 0.34;
    const fieldAreaHeight = height * 0.5;

    const boardLayout = computeBoardLayout(width, fieldTop, fieldAreaHeight);
    const cells = getCellPositions(boardLayout);
    this.cellSize = boardLayout.cellSize;

    const boardWidth = boardLayout.cellSize * FIELD_COLS + boardLayout.gap * (FIELD_COLS - 1);
    const laneWidth = Math.min(boardWidth * 1.15, width * 0.9);
    const pathPoints = computeMonsterPath(
      width / 2,
      laneWidth,
      headerHeight,
      fieldTop - boardLayout.cellSize / 2 - px(10),
    );
    this.monsterPath = this.buildCurve(pathPoints);
    this.drawPath(this.monsterPath);
    this.drawFieldSlots(cells, boardLayout.cellSize);

    this.hudText = this.add
      .text(width / 2, headerHeight / 2, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(15)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);
    this.refreshHud();
  }

  private refreshHud(): void {
    const isBossStage = this.waveState.stage % 10 === 0;
    const label = isBossStage
      ? `초록 숲 · ${this.waveState.stage}스테이지 · 보스 웨이브`
      : `초록 숲 · ${this.waveState.stage}스테이지 · ${this.waveState.spawnedInStage}/10`;
    this.hudText?.setText(label);
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

  private buildCurve(points: { x: number; y: number }[]): Phaser.Curves.Path {
    const curve = new Phaser.Curves.Path(points[0].x, points[0].y);
    curve.splineTo(points.slice(1).map((p) => new Phaser.Math.Vector2(p.x, p.y)));
    return curve;
  }

  private drawPath(curve: Phaser.Curves.Path): void {
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

  private spawnMonster(): void {
    const result = nextSpawn(this.waveState);
    this.waveState = result.nextState;
    this.refreshHud();

    const kind = MONSTER_KINDS[result.kind];
    const hp = Math.round(kind.baseHp * stageHpMultiplier(result.stage));

    const size = Math.round(this.cellSize * kind.sizeRatio);
    const textureKey = `monster-${kind.id}-${size}`;
    createMonsterTexture(this, textureKey, size, kind);

    const start = this.monsterPath.getPoint(0);
    const monster = this.add.image(start.x, start.y, textureKey);
    monster.setData('t', 0);
    monster.setData('speed', kind.speed);
    monster.setData('settled', false);
    monster.setData('scatterX', (Math.random() - 0.5) * this.cellSize * 2.6);
    monster.setData('scatterY', Math.random() * this.cellSize * 1.1);
    monster.setData('hp', hp);
    monster.setData('kind', kind.id);

    this.monsters.push(monster);
  }
}
