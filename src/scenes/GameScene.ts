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
import { NORMAL_UNITS, pickRandomUnit, ROLE_ATTACK_COLORS, MAX_STAR, type UnitDef } from '../core/units';
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
import { enhanceCost, canEnhance, statMultiplier, MAX_ENHANCE_LEVEL } from '../core/enhancement';
import { loadBestStage, saveBestStage } from '../meta/progress';
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
const MAX_MONSTERS_ON_FIELD = 100;
const NORMAL_RARITY = RARITIES.find((r) => r.key === 'normal')!;

interface PlacedUnit {
  unit: UnitDef;
  star: number;
  cooldown: number;
  sprite?: Phaser.GameObjects.Image;
  label?: Phaser.GameObjects.Text;
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
  private enhanceLevels = new Map<string, number>();
  private monsters: Phaser.GameObjects.Image[] = [];
  private hudText!: Phaser.GameObjects.Text;
  private manaText!: Phaser.GameObjects.Text;
  private summonButtonText!: Phaser.GameObjects.Text;
  private spawnTimer!: Phaser.Time.TimerEvent;
  private gameOver = false;
  private bestStage = 0;
  private pendingSummon?: PlacedUnit;
  private pendingSummonPreEconomy?: EconomyState;
  private placementHighlights: Phaser.GameObjects.Arc[] = [];
  private deckUnitIds: string[] = NORMAL_UNITS.map((u) => u.id);

  constructor() {
    super('game');
  }

  init(data: { deck?: string[] }): void {
    if (data?.deck && data.deck.length > 0) {
      this.deckUnitIds = data.deck;
    }
  }

  private deckPool(): UnitDef[] {
    const pool = NORMAL_UNITS.filter((u) => this.deckUnitIds.includes(u.id));
    return pool.length > 0 ? pool : NORMAL_UNITS;
  }

  create(): void {
    this.waveState = createInitialWaveState();
    this.economy = createInitialEconomy();
    this.placedUnits = new Map();
    this.enhanceLevels = new Map();
    this.gameOver = false;
    this.bestStage = loadBestStage();
    this.pendingSummon = undefined;
    this.pendingSummonPreEconomy = undefined;
    this.placementHighlights = [];

    this.layout();
    this.scale.on('resize', () => this.layout());
    this.spawnTimer = this.time.addEvent({
      delay: SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => this.spawnMonster(),
    });

    this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      gameObject.setData('dragMoved', true);
      this.children.bringToTop(gameObject);
    });

    this.input.on(
      'drag',
      (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Image, dragX: number, dragY: number) => {
        gameObject.setPosition(dragX, dragY);
      },
    );

    this.input.on(
      'dragend',
      (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
        this.handleUnitDrop(gameObject, pointer);
      },
    );
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;

    const dt = delta / 1000;
    this.updateMonsters(dt);
    this.updateCombat(dt);

    if (this.monsters.length >= MAX_MONSTERS_ON_FIELD) {
      this.triggerGameOver();
    }
  }

  private triggerGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.spawnTimer.paused = true;
    this.bestStage = saveBestStage(this.waveState.stage);
    this.showGameOverOverlay();
  }

  private showGameOverOverlay(): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72).setDepth(1000);

    this.add
      .text(width / 2, height * 0.38, '패배', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(36)}px`,
        color: '#ff6b6b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(1001);

    this.add
      .text(width / 2, height * 0.46, `도달 스테이지 ${this.waveState.stage} · 최고 기록 ${this.bestStage}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#f6e6b4',
      })
      .setOrigin(0.5)
      .setDepth(1001);

    const buttonWidth = Math.min(this.cellSize * 3.4, width * 0.6);
    const buttonHeight = this.cellSize * 0.9;
    const buttonY = height * 0.56;

    const bg = this.add.graphics().setDepth(1001);
    bg.fillStyle(0x151a28, 1);
    bg.fillRoundedRect(width / 2 - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(10));
    bg.lineStyle(px(2), 0xd4b36a, 1);
    bg.strokeRoundedRect(width / 2 - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(10));

    this.add
      .text(width / 2, buttonY, '다시 시작', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(16)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(1001);

    this.add
      .zone(width / 2, buttonY, buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true })
      .setDepth(1001)
      .on('pointerdown', () => this.scene.restart({ deck: this.deckUnitIds }));
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

      const enhanceLevel = this.enhanceLevels.get(placed.unit.id) ?? 0;
      const attack = Math.round(placed.unit.attack * statMultiplier(enhanceLevel));
      this.performAttack(cell, target, placed.unit, attack);
    });
  }

  private computeBuffBonuses(): Map<number, number> {
    const bonuses = new Map<number, number>();

    this.placedUnits.forEach((buffer, buffIndex) => {
      if (buffer.unit.role !== 'buff') return;

      const bufferCell = this.boardCells.find((c) => cellIndex(c.row, c.col) === buffIndex);
      if (!bufferCell) return;

      const effect = buffer.unit.effects.find((e) => e.type === 'buff');
      const enhanceLevel = this.enhanceLevels.get(buffer.unit.id) ?? 0;
      const value = ((effect?.value as number) ?? 0) * statMultiplier(enhanceLevel);
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
    const enhanceLevel = this.enhanceLevels.get(placed.unit.id) ?? 0;
    const value = Math.round(((effect?.value as number) ?? 1) * statMultiplier(enhanceLevel));

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

  private performAttack(
    cell: CellPosition,
    target: Phaser.GameObjects.Image,
    unitDef: UnitDef,
    attack: number,
  ): void {
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
        this.applyUnitHit(target, unitDef, attack);
      },
    });
  }

  private applyUnitHit(target: Phaser.GameObjects.Image, unitDef: UnitDef, attack: number): void {
    this.dealDamage(target, attack, '#fff5d6');
    if (!target.active) return;

    this.applyRoleEffect(target, unitDef);

    if (unitDef.role === 'aoe') {
      const effect = unitDef.effects.find((e) => e.type === 'aoe');
      const radius = ((effect?.radius as number) ?? 1) * this.boardStep;

      this.monsters.forEach((other) => {
        if (other === target || !other.active) return;
        if (Phaser.Math.Distance.Between(target.x, target.y, other.x, other.y) <= radius) {
          this.dealDamage(other, attack, '#fff5d6');
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

    this.placementHighlights = [];
    if (this.pendingSummon) this.enterPlacementMode();
    if (this.gameOver) this.showGameOverOverlay();
  }

  private refreshHud(): void {
    const isBossStage = this.waveState.stage % 10 === 0;
    const progress = isBossStage ? '보스 웨이브' : `${this.waveState.spawnedInStage}/10`;
    const bestSuffix = this.bestStage > 0 ? ` (최고 ${this.bestStage})` : '';
    this.hudText?.setText(`초록 숲 · ${this.waveState.stage}스테이지 · ${progress}${bestSuffix}`);
  }

  private refreshMana(): void {
    this.manaText?.setText(`마나 ${this.economy.mana}`);
    this.summonButtonText?.setText(
      this.pendingSummon ? '놓을 칸 선택 (취소)' : `소환 (${currentSummonCost(this.economy)}마나)`,
    );
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

  private drawFieldSlots(cells: CellPosition[], cellSize: number): void {
    const slotKey = `slot-${Math.round(cellSize)}`;
    createSlotTexture(this, slotKey, Math.round(cellSize));

    cells.forEach((cell) => {
      this.add
        .image(cell.x, cell.y, slotKey)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.handleCellTap(cell));
    });
  }

  private drawUnitSprite(cell: CellPosition, placed: PlacedUnit, animate = false): void {
    placed.sprite?.destroy();
    placed.label?.destroy();

    const size = Math.round(this.cellSize * 0.86);
    const sigil = ROLE_SIGILS[placed.unit.role];
    const key = `unit-${placed.unit.rarity}-${placed.unit.role}-${size}`;
    createGemTexture(this, key, NORMAL_RARITY, sigil, 1, size);

    const index = cellIndex(cell.row, cell.col);
    const sprite = this.add
      .image(cell.x, cell.y, key)
      .setDisplaySize(this.cellSize * 0.86, this.cellSize * 0.86)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => sprite.setData('dragMoved', false))
      .on('pointerup', () => {
        if (!sprite.getData('dragMoved')) this.tryEnhance(index);
      });
    sprite.setData('cellIndex', index);
    this.input.setDraggable(sprite);

    if (animate) {
      const targetScaleX = sprite.scaleX;
      const targetScaleY = sprite.scaleY;
      sprite.setScale(targetScaleX * 0.1, targetScaleY * 0.1);
      this.tweens.add({
        targets: sprite,
        scaleX: targetScaleX,
        scaleY: targetScaleY,
        duration: 280,
        ease: 'Back.Out',
      });
    }

    const level = this.enhanceLevels.get(placed.unit.id) ?? 0;
    const labelText = level > 0 ? `${'★'.repeat(placed.star)} · 강화${level}` : '★'.repeat(placed.star);
    const label = this.add
      .text(cell.x, cell.y + this.cellSize * 0.4, labelText, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
        color: '#f3dc9a',
      })
      .setOrigin(0.5);

    placed.sprite = sprite;
    placed.label = label;
  }

  private tryEnhance(index: number): void {
    const placed = this.placedUnits.get(index);
    if (!placed) return;

    const cell = this.boardCells.find((c) => cellIndex(c.row, c.col) === index);
    if (!cell) return;

    const level = this.enhanceLevels.get(placed.unit.id) ?? 0;

    if (!canEnhance(level)) {
      this.spawnFloatingText(cell.x, cell.y, `최대 강화(Lv.${MAX_ENHANCE_LEVEL})`, '#9a917d');
      return;
    }

    const cost = enhanceCost(level);
    if (this.economy.mana < cost) {
      this.spawnFloatingText(cell.x, cell.y, '마나 부족', '#ff8a8a');
      return;
    }

    this.economy = { ...this.economy, mana: this.economy.mana - cost };
    this.enhanceLevels.set(placed.unit.id, level + 1);
    this.refreshMana();

    this.placedUnits.forEach((entry, entryIndex) => {
      if (entry.unit.id !== placed.unit.id) return;
      const entryCell = this.boardCells.find((c) => cellIndex(c.row, c.col) === entryIndex);
      if (entryCell) this.drawUnitSprite(entryCell, entry);
    });

    this.spawnFloatingText(cell.x, cell.y, `강화 Lv.${level + 1}!`, '#ffd98a');
  }

  private handleCellTap(cell: CellPosition): void {
    if (!this.pendingSummon) return;

    const index = cellIndex(cell.row, cell.col);
    if (this.placedUnits.has(index)) return;

    this.placedUnits.set(index, this.pendingSummon);
    this.drawUnitSprite(cell, this.pendingSummon, true);

    this.pendingSummon = undefined;
    this.pendingSummonPreEconomy = undefined;
    this.clearPlacementHighlights();
    this.refreshMana();
  }

  private findNearestCell(x: number, y: number): CellPosition | null {
    let nearest: CellPosition | null = null;
    let nearestDist = Infinity;

    this.boardCells.forEach((cell) => {
      const dist = Phaser.Math.Distance.Between(x, y, cell.x, cell.y);
      if (dist <= this.cellSize * 0.6 && dist < nearestDist) {
        nearest = cell;
        nearestDist = dist;
      }
    });

    return nearest;
  }

  private handleUnitDrop(gameObject: Phaser.GameObjects.GameObject, pointer: Phaser.Input.Pointer): void {
    const sourceIndex = gameObject.getData('cellIndex') as number;
    const sourcePlaced = this.placedUnits.get(sourceIndex);
    const sourceCell = this.boardCells.find((c) => cellIndex(c.row, c.col) === sourceIndex);
    if (!sourcePlaced || !sourceCell) return;

    const targetCell = this.findNearestCell(pointer.x, pointer.y);
    if (!targetCell) {
      this.drawUnitSprite(sourceCell, sourcePlaced);
      return;
    }

    const targetIndex = cellIndex(targetCell.row, targetCell.col);
    if (targetIndex === sourceIndex) {
      this.drawUnitSprite(sourceCell, sourcePlaced);
      return;
    }

    const targetPlaced = this.placedUnits.get(targetIndex);

    const canMerge =
      targetPlaced &&
      targetPlaced.unit.id === sourcePlaced.unit.id &&
      targetPlaced.star === sourcePlaced.star &&
      sourcePlaced.star < MAX_STAR;

    if (canMerge) {
      this.mergeUnits(sourceIndex, sourceCell, targetIndex, targetCell, sourcePlaced.star);
      return;
    }

    this.placedUnits.set(targetIndex, sourcePlaced);
    if (targetPlaced) {
      this.placedUnits.set(sourceIndex, targetPlaced);
    } else {
      this.placedUnits.delete(sourceIndex);
    }

    this.drawUnitSprite(targetCell, sourcePlaced);
    if (targetPlaced) {
      this.drawUnitSprite(sourceCell, targetPlaced);
    }
  }

  private mergeUnits(
    sourceIndex: number,
    sourceCell: CellPosition,
    targetIndex: number,
    targetCell: CellPosition,
    fromStar: number,
  ): void {
    this.placedUnits.delete(sourceIndex);
    this.placedUnits.delete(targetIndex);

    const resultUnit = pickRandomUnit(this.deckPool());
    const result: PlacedUnit = {
      unit: resultUnit,
      star: Math.min(MAX_STAR, fromStar + 1),
      cooldown: Math.random() * 0.3,
    };
    this.placedUnits.set(targetIndex, result);

    this.playMergeEffect(sourceCell, targetCell, () => {
      this.drawUnitSprite(targetCell, result, true);
    });
  }

  private playMergeEffect(from: CellPosition, to: CellPosition, onComplete: () => void): void {
    const count = 10;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const dist = this.cellSize * 0.4;
      const spark = this.add.circle(to.x + Math.cos(angle) * dist, to.y + Math.sin(angle) * dist, px(3), 0xffe9b0, 0.9);

      this.tweens.add({
        targets: spark,
        x: to.x,
        y: to.y,
        alpha: 0,
        duration: 320,
        onComplete: () => spark.destroy(),
      });
    }

    const ghost = this.add.circle(from.x, from.y, this.cellSize * 0.3, 0xffe9b0, 0.6);

    this.tweens.add({
      targets: ghost,
      x: to.x,
      y: to.y,
      alpha: 0,
      scale: 0.2,
      duration: 320,
      onComplete: () => {
        ghost.destroy();
        const flash = this.add.circle(to.x, to.y, this.cellSize * 0.55, 0xffffff, 0.9);

        this.tweens.add({
          targets: flash,
          alpha: 0,
          scale: 1.6,
          duration: 250,
          onComplete: () => {
            flash.destroy();
            onComplete();
          },
        });
      },
    });
  }

  private enterPlacementMode(): void {
    this.clearPlacementHighlights();

    this.boardCells.forEach((cell) => {
      const index = cellIndex(cell.row, cell.col);
      if (this.placedUnits.has(index)) return;

      const ring = this.add.circle(cell.x, cell.y, this.cellSize * 0.48, 0xffd98a, 0.16);
      ring.setStrokeStyle(px(2), 0xffd98a, 0.9);

      this.tweens.add({
        targets: ring,
        alpha: { from: 0.9, to: 0.35 },
        duration: 500,
        yoyo: true,
        repeat: -1,
      });

      this.placementHighlights.push(ring);
    });
  }

  private clearPlacementHighlights(): void {
    this.placementHighlights.forEach((ring) => ring.destroy());
    this.placementHighlights = [];
  }

  private cancelPendingSummon(): void {
    if (!this.pendingSummon) return;

    this.pendingSummon = undefined;
    if (this.pendingSummonPreEconomy) {
      this.economy = this.pendingSummonPreEconomy;
      this.pendingSummonPreEconomy = undefined;
    }

    this.clearPlacementHighlights();
    this.refreshMana();
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
    if (this.pendingSummon) {
      this.cancelPendingSummon();
      return;
    }

    if (!canAffordSummon(this.economy)) return;

    const hasEmptyCell = this.boardCells.some((cell) => !this.placedUnits.has(cellIndex(cell.row, cell.col)));
    if (!hasEmptyCell) return;

    this.pendingSummonPreEconomy = this.economy;
    this.economy = spendForSummon(this.economy);

    const unit = pickRandomUnit(this.deckPool());
    this.pendingSummon = { unit, star: 1, cooldown: Math.random() * 0.3 };

    this.refreshMana();
    this.enterPlacementMode();
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

    if (result.kind === 'boss') {
      this.announceBoss();
    }
  }

  private announceBoss(): void {
    const { width, height } = this.scale;

    this.cameras.main.shake(400, 0.006);

    const flash = this.add.rectangle(width / 2, height / 2, width, height, 0xff3b3b, 0.35).setDepth(900);
    this.tweens.add({ targets: flash, alpha: 0, duration: 500, onComplete: () => flash.destroy() });

    const banner = this.add
      .text(width / 2, height * 0.22, '보스 출현!', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(26)}px`,
        color: '#ffcf5a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(901)
      .setAlpha(0);

    this.tweens.add({
      targets: banner,
      alpha: 1,
      duration: 200,
      yoyo: true,
      hold: 800,
      onComplete: () => banner.destroy(),
    });
  }
}
