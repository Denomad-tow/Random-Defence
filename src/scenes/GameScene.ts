import Phaser from 'phaser';
import {
  computeBoardLayout,
  getCellPositions,
  cellIndex,
  FIELD_COLS,
  FIELD_ROWS,
  type CellPosition,
} from '../core/board';
import { computeMonsterPath, createInitialWaveState, nextSpawn, stageHpMultiplier, type WaveState } from '../core/wave';
import { MONSTER_KINDS, type MonsterKindId } from '../core/monsters';
import { NORMAL_UNITS, pickRandomUnit, ROLE_ATTACK_COLORS, type UnitDef } from '../core/units';
import {
  tickStatusEffects,
  applySlow,
  applyStun,
  applyArmorBreak,
  applyPoison,
  effectiveSpeedMultiplier,
  damageTakenMultiplier,
  type StatusEffects,
} from '../core/combat';
import {
  createInitialEconomy,
  currentSummonCost,
  canAffordSummon,
  spendForSummon,
  type EconomyState,
} from '../core/economy';
import { RARITIES } from '../core/graphics/gem';
import { ROLE_SIGILS } from '../core/graphics/sigils';
import {
  createNightSkyGlowTexture,
  createSlotTexture,
  createStarFieldTexture,
  createMonsterTexture,
  createGemTexture,
} from '../core/graphics/texture';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
const SPAWN_INTERVAL_MS = 1100;
const NORMAL_RARITY = RARITIES.find((r) => r.key === 'normal')!;

interface PlacedUnit {
  unit: UnitDef;
  star: number;
  cooldown: number;
}

export class GameScene extends Phaser.Scene {
  private monsterPath!: Phaser.Curves.Path;
  private boardCells: CellPosition[] = [];
  private cellSize = 0;
  private boardStep = 0;
  private fieldBottomY = 0;
  private fieldLeftX = 0;
  private fieldRightX = 0;
  private waveState: WaveState = createInitialWaveState();
  private economy: EconomyState = createInitialEconomy();
  private placedUnits = new Map<number, PlacedUnit>();
  private monsters: Phaser.GameObjects.Image[] = [];
  private hudText!: Phaser.GameObjects.Text;
  private manaText!: Phaser.GameObjects.Text;
  private summonButtonText!: Phaser.GameObjects.Text;

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
    this.updateMonsters(dt);
    this.updateCombat(dt);
  }

  private updateMonsters(dt: number): void {
    this.monsters.forEach((monster) => {
      const status = (monster.getData('status') as StatusEffects) ?? {};
      const tickResult = tickStatusEffects(status, dt);
      monster.setData('status', tickResult.status);

      if (tickResult.poisonDamage > 0) {
        this.dealDamage(monster, tickResult.poisonDamage, '#8ee08e');
        if (!monster.active) return;
      }

      const speedMultiplier = effectiveSpeedMultiplier(tickResult.status);
      const phase = monster.getData('phase') as 'approach' | 'crawl';

      if (phase === 'approach') {
        const speed = (monster.getData('speed') as number) * speedMultiplier;
        const t = Math.min(1, (monster.getData('t') as number) + speed * dt);
        monster.setData('t', t);
        const point = this.monsterPath.getPoint(t);

        if (t >= 1) {
          const laneX = Phaser.Math.Clamp(
            point.x + (monster.getData('scatterX') as number),
            this.fieldLeftX,
            this.fieldRightX,
          );
          monster.setData('phase', 'crawl');
          monster.setPosition(laneX, point.y);
        } else {
          monster.setPosition(point.x, point.y);
        }
        return;
      }

      if (monster.y < this.fieldBottomY) {
        const crawlSpeed = (monster.getData('crawlSpeed') as number) * this.boardStep * speedMultiplier;
        const y = Math.min(this.fieldBottomY, monster.y + crawlSpeed * dt);
        monster.setPosition(monster.x, y);
      }
    });
  }

  private updateCombat(dt: number): void {
    const buffBonuses = this.computeBuffBonuses();

    this.placedUnits.forEach((placed, index) => {
      placed.cooldown -= dt;
      if (placed.cooldown > 0) return;

      const cell = this.boardCells.find((c) => cellIndex(c.row, c.col) === index);
      if (!cell) return;

      if (placed.unit.role === 'goldGen') {
        this.performGoldGen(cell, placed);
        return;
      }

      if (placed.unit.role === 'buff' || placed.unit.attack <= 0 || placed.unit.attackSpeed <= 0) {
        placed.cooldown = 1;
        return;
      }

      const rangePx = placed.unit.range * this.boardStep;
      const target = this.findNearestMonster(cell.x, cell.y, rangePx);
      if (!target) return;

      const bonus = buffBonuses.get(index) ?? 0;
      placed.cooldown = 1 / (placed.unit.attackSpeed * (1 + bonus));
      this.performAttack(cell, target, placed.unit);
    });
  }

  private computeBuffBonuses(): Map<number, number> {
    const bonuses = new Map<number, number>();

    this.placedUnits.forEach((buffer, buffIndex) => {
      if (buffer.unit.role !== 'buff') return;

      const bufferCell = this.boardCells.find((c) => cellIndex(c.row, c.col) === buffIndex);
      if (!bufferCell) return;

      const effect = buffer.unit.effects.find((e) => e.type === 'buff');
      const value = (effect?.value as number) ?? 0;
      const rangePx = buffer.unit.range * this.boardStep;

      this.placedUnits.forEach((_ally, allyIndex) => {
        if (allyIndex === buffIndex) return;
        const allyCell = this.boardCells.find((c) => cellIndex(c.row, c.col) === allyIndex);
        if (!allyCell) return;

        if (Phaser.Math.Distance.Between(bufferCell.x, bufferCell.y, allyCell.x, allyCell.y) <= rangePx) {
          bonuses.set(allyIndex, (bonuses.get(allyIndex) ?? 0) + value);
        }
      });
    });

    return bonuses;
  }

  private performGoldGen(cell: CellPosition, placed: PlacedUnit): void {
    const effect = placed.unit.effects[0];
    const interval = (effect?.interval as number) ?? 2;
    const value = (effect?.value as number) ?? 1;

    placed.cooldown = interval;
    this.economy = { ...this.economy, mana: this.economy.mana + value };
    this.refreshMana();
    this.spawnFloatingText(cell.x, cell.y, `+${value}마나`, '#9adfa0');
  }

  private findNearestMonster(x: number, y: number, rangePx: number): Phaser.GameObjects.Image | null {
    let nearest: Phaser.GameObjects.Image | null = null;
    let nearestDist = Infinity;

    this.monsters.forEach((monster) => {
      if (!monster.active) return;
      const dist = Phaser.Math.Distance.Between(x, y, monster.x, monster.y);
      if (dist <= rangePx && dist < nearestDist) {
        nearest = monster;
        nearestDist = dist;
      }
    });

    return nearest;
  }

  private performAttack(cell: CellPosition, target: Phaser.GameObjects.Image, unitDef: UnitDef): void {
    const color = ROLE_ATTACK_COLORS[unitDef.role] ?? 0xffffff;
    const targetX = target.x;
    const targetY = target.y;

    const projectile = this.add.circle(cell.x, cell.y, px(4), color, 1);

    this.tweens.add({
      targets: projectile,
      x: targetX,
      y: targetY,
      duration: 160,
      onComplete: () => {
        projectile.destroy();
        if (!target.active) return;
        this.applyUnitHit(target, unitDef);
      },
    });
  }

  private applyUnitHit(target: Phaser.GameObjects.Image, unitDef: UnitDef): void {
    this.dealDamage(target, unitDef.attack, '#fff5d6');
    if (!target.active) return;

    this.applyRoleEffect(target, unitDef);

    if (unitDef.role === 'aoe') {
      const effect = unitDef.effects.find((e) => e.type === 'aoe');
      const radius = ((effect?.radius as number) ?? 1) * this.boardStep;

      this.monsters.forEach((other) => {
        if (other === target || !other.active) return;
        if (Phaser.Math.Distance.Between(target.x, target.y, other.x, other.y) <= radius) {
          this.dealDamage(other, unitDef.attack, '#fff5d6');
        }
      });
    }
  }

  private applyRoleEffect(target: Phaser.GameObjects.Image, unitDef: UnitDef): void {
    const effect = unitDef.effects[0];
    if (!effect) return;

    let status = (target.getData('status') as StatusEffects) ?? {};

    switch (effect.type) {
      case 'slow':
        status = applySlow(status, effect.value as number, effect.duration as number);
        break;
      case 'stun':
        if (Math.random() < (effect.chance as number)) {
          status = applyStun(status, effect.duration as number);
        }
        break;
      case 'poison':
        status = applyPoison(status, effect.value as number, effect.duration as number);
        break;
      case 'armorBreak':
        status = applyArmorBreak(status, effect.value as number, effect.duration as number);
        break;
      default:
        return;
    }

    target.setData('status', status);
  }

  private dealDamage(target: Phaser.GameObjects.Image, baseDamage: number, color: string): void {
    const status = (target.getData('status') as StatusEffects) ?? {};
    const damage = Math.round(baseDamage * damageTakenMultiplier(status));
    const hp = (target.getData('hp') as number) - damage;
    target.setData('hp', hp);

    target.setTintFill(0xffffff);
    this.time.delayedCall(80, () => {
      if (target.active) target.clearTint();
    });

    this.spawnFloatingText(target.x, target.y, `-${damage}`, color);

    if (hp <= 0) {
      this.killMonster(target);
    }
  }

  private killMonster(target: Phaser.GameObjects.Image): void {
    const kindId = target.getData('kind') as MonsterKindId;
    const reward = MONSTER_KINDS[kindId]?.manaReward ?? 1;

    this.economy = { ...this.economy, mana: this.economy.mana + reward };
    this.refreshMana();

    this.spawnDeathBurst(target.x, target.y);

    this.monsters = this.monsters.filter((m) => m !== target);
    target.destroy();
  }

  private spawnFloatingText(x: number, y: number, message: string, color: string): void {
    const text = this.add
      .text(x, y - px(10), message, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color,
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: y - px(40),
      alpha: 0,
      duration: 550,
      onComplete: () => text.destroy(),
    });
  }

  private spawnDeathBurst(x: number, y: number): void {
    const count = 7;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const distance = this.cellSize * (0.3 + Math.random() * 0.25);
      const spark = this.add.circle(x, y, px(2.5), 0xf3dc9a, 0.9);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        duration: 380,
        onComplete: () => spark.destroy(),
      });
    }
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
    this.boardCells = getCellPositions(boardLayout);
    this.cellSize = boardLayout.cellSize;
    this.boardStep = boardLayout.cellSize + boardLayout.gap;
    this.fieldBottomY = boardLayout.originY + (FIELD_ROWS - 1) * this.boardStep + boardLayout.cellSize * 0.55;
    this.fieldLeftX = boardLayout.originX - boardLayout.cellSize * 0.5;
    this.fieldRightX = boardLayout.originX + (FIELD_COLS - 1) * this.boardStep + boardLayout.cellSize * 0.5;

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
    this.drawFieldSlots(this.boardCells, boardLayout.cellSize);

    this.placedUnits.forEach((placed, index) => {
      const cell = this.boardCells.find((c) => cellIndex(c.row, c.col) === index);
      if (cell) this.drawUnitSprite(cell, placed);
    });

    this.hudText = this.add
      .text(width / 2, headerHeight / 2, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(15)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);
    this.refreshHud();

    const buttonY = Math.min(height * 0.92, fieldTop + fieldAreaHeight + boardLayout.cellSize * 1.1);
    this.drawSummonButton(width / 2, buttonY);
    this.refreshMana();
  }

  private refreshHud(): void {
    const isBossStage = this.waveState.stage % 10 === 0;
    const label = isBossStage
      ? `초록 숲 · ${this.waveState.stage}스테이지 · 보스 웨이브`
      : `초록 숲 · ${this.waveState.stage}스테이지 · ${this.waveState.spawnedInStage}/10`;
    this.hudText?.setText(label);
  }

  private refreshMana(): void {
    this.manaText?.setText(`마나 ${this.economy.mana}`);
    this.summonButtonText?.setText(`소환 (${currentSummonCost(this.economy)}마나)`);
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

  private drawUnitSprite(cell: CellPosition, placed: PlacedUnit): void {
    const size = Math.round(this.cellSize * 0.86);
    const sigil = ROLE_SIGILS[placed.unit.role];
    const key = `unit-${placed.unit.rarity}-${placed.unit.role}-${size}`;
    createGemTexture(this, key, NORMAL_RARITY, sigil, 1, size);

    this.add.image(cell.x, cell.y, key).setDisplaySize(this.cellSize * 0.86, this.cellSize * 0.86);
    this.add
      .text(cell.x, cell.y + this.cellSize * 0.4, '★'.repeat(placed.star), {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
        color: '#f3dc9a',
      })
      .setOrigin(0.5);
  }

  private drawSummonButton(x: number, y: number): void {
    const buttonWidth = Math.min(this.cellSize * 3.4, this.scale.width * 0.7);
    const buttonHeight = this.cellSize * 0.9;

    const bg = this.add.graphics();
    bg.fillStyle(0x151a28, 0.95);
    bg.fillRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, px(10));
    bg.lineStyle(px(2), 0xd4b36a, 0.9);
    bg.strokeRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, px(10));

    this.summonButtonText = this.add
      .text(x, y, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(16)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .zone(x, y, buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.trySummon());

    this.manaText = this.add
      .text(x, y - buttonHeight / 2 - px(14), '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);
  }

  private trySummon(): void {
    if (!canAffordSummon(this.economy)) return;

    const emptyCell = this.boardCells.find((cell) => !this.placedUnits.has(cellIndex(cell.row, cell.col)));
    if (!emptyCell) return;

    this.economy = spendForSummon(this.economy);

    const unit = pickRandomUnit(NORMAL_UNITS);
    const placed: PlacedUnit = { unit, star: 1, cooldown: Math.random() * 0.3 };
    this.placedUnits.set(cellIndex(emptyCell.row, emptyCell.col), placed);
    this.drawUnitSprite(emptyCell, placed);

    this.refreshMana();
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
    monster.setData('phase', 'approach');
    monster.setData('t', 0);
    monster.setData('speed', kind.speed);
    monster.setData('crawlSpeed', kind.crawlSpeed);
    monster.setData('scatterX', (Math.random() - 0.5) * this.cellSize * 2.6);
    monster.setData('hp', hp);
    monster.setData('kind', kind.id);

    this.monsters.push(monster);
  }
}
