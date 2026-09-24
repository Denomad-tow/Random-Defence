import Phaser from 'phaser';
import {
  computeBoardLayout,
  getCellPositions,
  cellIndex,
  resolveCorridorPoint,
  FIELD_ROWS,
  type BoardLayout,
  type CellPosition,
} from '../core/board';
import { createInitialWaveState, nextSpawn, stageHpMultiplier, type WaveState } from '../core/wave';
import { MONSTER_KINDS, pickRandomSpecies, type MonsterKindId } from '../core/monsters';
import { pickRandomMapPreset, type MapPreset } from '../core/mapPresets';
import { NORMAL_UNITS, pickRandomUnit, ROLE_ATTACK_COLORS, MAX_STAR, type UnitDef, type UnitEffect } from '../core/units';
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
import { addGold } from '../meta/gold';
import { addBox } from '../meta/boxes';
import { getBoxType } from '../meta/gacha';
import { computeRunReward, type RunReward } from '../meta/rewards';
import { getUnitLevel, levelStatMultiplier } from '../meta/levels';
import { generalAttackMultiplier, generalAttackSpeedBonus, roleMultiplier } from '../meta/research';
import { getCurrentNickname } from '../meta/auth';
import { getRarity } from '../core/graphics/gem';
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
const FIRST_SPAWN_DELAY_MS = 10000;
const MAX_MONSTERS_ON_FIELD = 100;

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
  private currentMap!: MapPreset;
  private waveState: WaveState = createInitialWaveState();
  private economy: EconomyState = createInitialEconomy();
  private placedUnits = new Map<number, PlacedUnit>();
  private enhanceLevels = new Map<string, number>();
  private monsters: Phaser.GameObjects.Image[] = [];
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private summonButtonText!: Phaser.GameObjects.Text;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private firstSpawnTimer?: Phaser.Time.TimerEvent;
  private gameOver = false;
  private bestStage = 0;
  private lastReward?: RunReward;
  private pendingSummon?: PlacedUnit;
  private pendingSummonPreEconomy?: EconomyState;
  private placementHighlights: Phaser.GameObjects.Arc[] = [];
  private deckUnitIds: string[] = NORMAL_UNITS.map((u) => u.id);
  private showRange = false;
  private rangeGraphics?: Phaser.GameObjects.Graphics;
  private rangeToggleText?: Phaser.GameObjects.Text;
  private enhanceConfirmContainer?: Phaser.GameObjects.Container;
  private currentNickname = '';
  private nicknameText?: Phaser.GameObjects.Text;

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
    // Phaser의 드래그 감지 최소 거리가 기본값 0이라, 살짝 떨리는 탭도 드래그로
    // 인식돼 탭 동작(강화 확인 창 등)이 씹히는 문제가 있었다. 일정 거리 이상
    // 움직여야만 드래그로 인정하도록 최소 거리를 둔다.
    this.input.dragDistanceThreshold = px(10);

    this.waveState = createInitialWaveState();
    this.economy = createInitialEconomy();
    this.placedUnits = new Map();
    this.enhanceLevels = new Map();
    this.gameOver = false;
    this.lastReward = undefined;
    this.bestStage = loadBestStage();
    this.pendingSummon = undefined;
    this.pendingSummonPreEconomy = undefined;
    this.placementHighlights = [];
    this.currentMap = pickRandomMapPreset();

    this.layout();
    this.scale.on('resize', () => this.layout());

    void getCurrentNickname().then((nick) => {
      this.currentNickname = nick ?? '';
      this.nicknameText?.setText(this.currentNickname ? `${this.currentNickname}님` : '');
    });

    this.firstSpawnTimer = this.time.delayedCall(FIRST_SPAWN_DELAY_MS, () => {
      this.spawnMonster();
      this.spawnTimer = this.time.addEvent({
        delay: SPAWN_INTERVAL_MS,
        loop: true,
        callback: () => this.spawnMonster(),
      });
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
    this.firstSpawnTimer?.remove();
    if (this.spawnTimer) this.spawnTimer.paused = true;
    this.bestStage = saveBestStage(this.waveState.stage);

    const reward = computeRunReward(this.waveState.stage);
    addGold(reward.gold);
    addBox(reward.boxId);
    this.lastReward = reward;

    this.showGameOverOverlay(reward);
  }

  private showGameOverOverlay(reward: RunReward | undefined = this.lastReward): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72).setDepth(1000);

    this.add
      .text(width / 2, height * 0.32, '패배', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(36)}px`,
        color: '#ff6b6b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(1001);

    this.add
      .text(width / 2, height * 0.4, `도달 스테이지 ${this.waveState.stage} · 최고 기록 ${this.bestStage}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#f6e6b4',
      })
      .setOrigin(0.5)
      .setDepth(1001);

    if (reward) {
      const boxName = getBoxType(reward.boxId).name;
      this.add
        .text(width / 2, height * 0.46, `보상: 골드 +${reward.gold} · ${boxName} +1`, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(13)}px`,
          color: '#ffd98a',
        })
        .setOrigin(0.5)
        .setDepth(1001);
    }

    const buttonWidth = Math.min(this.cellSize * 3.4, width * 0.6);
    const buttonHeight = this.cellSize * 0.9;
    const restartY = height * 0.58;
    const deckY = restartY + buttonHeight * 1.3;

    this.drawOverlayButton(width / 2, restartY, buttonWidth, buttonHeight, '다시 시작', () =>
      this.scene.restart({ deck: this.deckUnitIds }),
    );
    this.drawOverlayButton(width / 2, deckY, buttonWidth, buttonHeight, '컬렉션 / 상자', () =>
      this.scene.start('deck-select', { forceEdit: true }),
    );
  }

  private drawOverlayButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    onClick: () => void,
  ): void {
    const bg = this.add.graphics().setDepth(1001);
    bg.fillStyle(0x151a28, 1);
    bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, px(10));
    bg.lineStyle(px(2), 0xd4b36a, 1);
    bg.strokeRoundedRect(x - width / 2, y - height / 2, width, height, px(10));

    this.add
      .text(x, y, label, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(16)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(1001);

    this.add
      .zone(x, y, width, height)
      .setInteractive({ useHandCursor: true })
      .setDepth(1001)
      .on('pointerdown', onClick);
  }

  private updateMonsters(dt: number): void {
    const pathLength = this.monsterPath.getLength();

    this.monsters.forEach((monster) => {
      const status = (monster.getData('status') as StatusEffects) ?? {};
      const tickResult = tickStatusEffects(status, dt);
      monster.setData('status', tickResult.status);

      if (tickResult.poisonDamage > 0) {
        this.dealDamage(monster, tickResult.poisonDamage, '#8ee08e');
        if (!monster.active) return;
      }

      const speedMultiplier = effectiveSpeedMultiplier(tickResult.status);
      const pxPerSec = (monster.getData('crawlSpeed') as number) * this.boardStep * speedMultiplier;
      const tStep = pathLength > 0 ? (pxPerSec * dt) / pathLength : 0;
      const t = Math.min(1, (monster.getData('t') as number) + tStep);
      monster.setData('t', t);

      const point = this.monsterPath.getPoint(t);
      monster.setPosition(point.x, point.y);
    });
  }

  private updateCombat(dt: number): void {
    const buffBonuses = this.computeBuffBonuses();
    this.applyFrostAuras();

    this.placedUnits.forEach((placed, index) => {
      placed.cooldown -= dt;
      if (placed.cooldown > 0) return;

      const cell = this.boardCells.find((c) => cellIndex(c.row, c.col) === index);
      if (!cell) return;

      if (placed.unit.effects.some((e) => e.type === 'goldGen')) {
        this.performGoldGen(cell, placed);
        return;
      }

      if (placed.unit.attack <= 0 || placed.unit.attackSpeed <= 0) {
        placed.cooldown = 1;
        return;
      }

      const rangePx = placed.unit.range * this.boardStep;
      const bonus = (buffBonuses.get(index) ?? 0) + generalAttackSpeedBonus();
      const attack = Math.round(placed.unit.attack * this.totalMultiplier(placed.unit));

      if (placed.unit.effects.some((e) => e.type === 'multishot')) {
        const effect = placed.unit.effects.find((e) => e.type === 'multishot');
        const shotCount = (effect?.count as number) ?? 2;
        const targets = this.findNearestMonsters(cell.x, cell.y, rangePx, shotCount);
        if (targets.length === 0) return;
        placed.cooldown = 1 / (placed.unit.attackSpeed * (1 + bonus));
        targets.forEach((target) => this.performAttack(cell, target, placed.unit, attack));
        return;
      }

      const target = this.findNearestMonster(cell.x, cell.y, rangePx);
      if (!target) return;

      placed.cooldown = 1 / (placed.unit.attackSpeed * (1 + bonus));
      this.performAttack(cell, target, placed.unit, attack);
    });
  }

  private applyFrostAuras(): void {
    this.placedUnits.forEach((placed, index) => {
      const effect = placed.unit.effects.find((e) => e.type === 'frostAura');
      if (!effect) return;

      const cell = this.boardCells.find((c) => cellIndex(c.row, c.col) === index);
      if (!cell) return;

      const value = ((effect?.value as number) ?? 0.2) * this.totalMultiplier(placed.unit);
      const rangePx = placed.unit.range * this.boardStep;

      this.monsters.forEach((monster) => {
        if (!monster.active) return;
        if (Phaser.Math.Distance.Between(cell.x, cell.y, monster.x, monster.y) <= rangePx) {
          const status = (monster.getData('status') as StatusEffects) ?? {};
          monster.setData('status', applySlow(status, value, 0.4));
        }
      });
    });
  }

  private computeBuffBonuses(): Map<number, number> {
    const bonuses = new Map<number, number>();

    this.placedUnits.forEach((buffer, buffIndex) => {
      const effect = buffer.unit.effects.find((e) => e.type === 'buff');
      if (!effect) return;

      const bufferCell = this.boardCells.find((c) => cellIndex(c.row, c.col) === buffIndex);
      if (!bufferCell) return;

      const value = ((effect?.value as number) ?? 0) * this.totalMultiplier(buffer.unit);
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
    const value = Math.round(((effect?.value as number) ?? 1) * this.totalMultiplier(placed.unit));

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

  private findNearestMonsters(x: number, y: number, rangePx: number, count: number): Phaser.GameObjects.Image[] {
    return this.monsters
      .filter((m) => m.active && Phaser.Math.Distance.Between(x, y, m.x, m.y) <= rangePx)
      .sort(
        (a, b) =>
          Phaser.Math.Distance.Between(x, y, a.x, a.y) - Phaser.Math.Distance.Between(x, y, b.x, b.y),
      )
      .slice(0, count);
  }

  private performAttack(
    cell: CellPosition,
    target: Phaser.GameObjects.Image,
    unitDef: UnitDef,
    attack: number,
  ): void {
    const color = ROLE_ATTACK_COLORS[unitDef.role] ?? 0xffffff;
    const rarity = getRarity(unitDef.rarity);
    const vfxScale = 1 + rarity.glow;
    const targetX = target.x;
    const targetY = target.y;

    if (rarity.glow > 0.25) {
      const glow = this.add.circle(cell.x, cell.y, px(9) * vfxScale, color, 0.35);
      this.tweens.add({ targets: glow, alpha: 0, scale: 1.6, duration: 200, onComplete: () => glow.destroy() });
    }

    const projectile = this.add.circle(cell.x, cell.y, px(4) * vfxScale, color, 1);
    const trailCount = Math.min(4, rarity.sparkleCount);

    this.tweens.add({
      targets: projectile,
      x: targetX,
      y: targetY,
      duration: 160,
      onUpdate: () => {
        if (trailCount === 0 || Math.random() > 0.5) return;
        const spark = this.add.circle(projectile.x, projectile.y, px(2), color, 0.7);
        this.tweens.add({ targets: spark, alpha: 0, duration: 220, onComplete: () => spark.destroy() });
      },
      onComplete: () => {
        projectile.destroy();
        if (!target.active) return;
        this.applyUnitHit(target, unitDef, attack);
      },
    });
  }

  private applyUnitHit(target: Phaser.GameObjects.Image, unitDef: UnitDef, attack: number): void {
    const damage = this.computeHitDamage(target, unitDef, attack);
    this.dealDamage(target, damage, '#fff5d6');
    this.applyManaLeech(unitDef);
    if (!target.active) return;

    this.applyRoleEffect(target, unitDef);

    const aoeEffect = unitDef.effects.find((e) => e.type === 'aoe');
    if (aoeEffect) {
      const radius = ((aoeEffect.radius as number) ?? 1) * this.boardStep;

      this.monsters.forEach((other) => {
        if (other === target || !other.active) return;
        if (Phaser.Math.Distance.Between(target.x, target.y, other.x, other.y) <= radius) {
          this.dealDamage(other, attack, '#fff5d6');
        }
      });
    }

    const pierceEffect = unitDef.effects.find((e) => e.type === 'pierce');
    if (pierceEffect) {
      const bandWidth = ((pierceEffect.bandWidth as number) ?? 0.5) * this.cellSize;

      this.monsters.forEach((other) => {
        if (other === target || !other.active) return;
        if (Math.abs(other.x - target.x) <= bandWidth) {
          this.dealDamage(other, attack, '#fff5d6');
        }
      });
    }

    const chainEffect = unitDef.effects.find((e) => e.type === 'chain');
    if (chainEffect) {
      const bounces = (chainEffect.bounces as number) ?? 2;
      this.chainBounce(target.x, target.y, attack, new Set([target]), bounces);
    }
  }

  private computeHitDamage(target: Phaser.GameObjects.Image, unitDef: UnitDef, attack: number): number {
    let damage = attack;

    const executeEffect = unitDef.effects.find((e) => e.type === 'execute');
    if (executeEffect) {
      const threshold = (executeEffect.threshold as number) ?? 0.25;
      const multiplier = (executeEffect.multiplier as number) ?? 1.8;
      const hp = target.getData('hp') as number;
      const maxHp = (target.getData('maxHp') as number) ?? hp;
      if (maxHp > 0 && hp / maxHp <= threshold) {
        damage = Math.round(damage * multiplier);
      }
    }

    const critEffect = unitDef.effects.find((e) => e.type === 'critStrike');
    if (critEffect) {
      const chance = (critEffect.chance as number) ?? 0.2;
      const multiplier = (critEffect.multiplier as number) ?? 3;
      if (Math.random() < chance) {
        damage = Math.round(damage * multiplier);
      }
    }

    return damage;
  }

  private applyManaLeech(unitDef: UnitDef): void {
    const effect = unitDef.effects.find((e) => e.type === 'manaLeech');
    if (!effect) return;

    const chance = (effect.chance as number) ?? 0.3;
    const value = (effect.value as number) ?? 2;

    if (Math.random() < chance) {
      this.economy = { ...this.economy, mana: this.economy.mana + value };
      this.refreshMana();
    }
  }

  private chainBounce(
    fromX: number,
    fromY: number,
    damage: number,
    hit: Set<Phaser.GameObjects.Image>,
    remaining: number,
  ): void {
    if (remaining <= 0) return;

    const rangePx = this.cellSize * 1.6;
    let nearest: Phaser.GameObjects.Image | null = null;
    let nearestDist = Infinity;

    this.monsters.forEach((monster) => {
      if (hit.has(monster) || !monster.active) return;
      const dist = Phaser.Math.Distance.Between(fromX, fromY, monster.x, monster.y);
      if (dist <= rangePx && dist < nearestDist) {
        nearest = monster;
        nearestDist = dist;
      }
    });

    if (!nearest) return;

    const bounceTarget = nearest as Phaser.GameObjects.Image;
    const bounceDamage = Math.round(damage * 0.6);
    hit.add(bounceTarget);

    const bolt = this.add.circle(fromX, fromY, px(3), ROLE_ATTACK_COLORS.chain, 1);

    this.tweens.add({
      targets: bolt,
      x: bounceTarget.x,
      y: bounceTarget.y,
      duration: 120,
      onComplete: () => {
        bolt.destroy();
        if (!bounceTarget.active) return;
        this.dealDamage(bounceTarget, bounceDamage, '#fff5d6');
        this.chainBounce(bounceTarget.x, bounceTarget.y, bounceDamage, hit, remaining - 1);
      },
    });
  }

  private applyRoleEffect(target: Phaser.GameObjects.Image, unitDef: UnitDef): void {
    const statusTypes = ['slow', 'stun', 'poison', 'armorBreak'];
    const magnitude = roleMultiplier(unitDef.role);

    unitDef.effects
      .filter((effect) => statusTypes.includes(effect.type))
      .forEach((effect) => {
        this.applyStatusEffect(target, effect, magnitude);

        const extraTargets = ((effect.targets as number) ?? 1) - 1;
        if (extraTargets > 0) {
          const nearby = this.findNearestMonsters(target.x, target.y, this.cellSize * 1.8, extraTargets + 1).filter(
            (m) => m !== target,
          );
          nearby.slice(0, extraTargets).forEach((m) => this.applyStatusEffect(m, effect, magnitude));
        }
      });
  }

  private applyStatusEffect(target: Phaser.GameObjects.Image, effect: UnitEffect, magnitude = 1): void {
    let status = (target.getData('status') as StatusEffects) ?? {};

    switch (effect.type) {
      case 'slow':
        status = applySlow(status, (effect.value as number) * magnitude, effect.duration as number);
        break;
      case 'stun':
        if (Math.random() < (effect.chance as number)) {
          status = applyStun(status, effect.duration as number);
        }
        break;
      case 'poison':
        status = applyPoison(status, (effect.value as number) * magnitude, effect.duration as number);
        break;
      case 'armorBreak':
        status = applyArmorBreak(status, (effect.value as number) * magnitude, effect.duration as number);
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
    this.spawnDeathBurst(target.x, target.y);

    this.monsters = this.monsters.filter((m) => m !== target);
    target.destroy();
    this.refreshMana();
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
    this.enhanceConfirmContainer = undefined;

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

    const buttonY = Math.min(height * 0.92, fieldTop + fieldAreaHeight + boardLayout.cellSize * 1.1);
    const buttonHeight = boardLayout.cellSize * 0.9;
    const naturalFieldBottomY =
      boardLayout.originY + (FIELD_ROWS - 1) * this.boardStep + boardLayout.cellSize * 0.55;
    this.fieldBottomY = Math.min(naturalFieldBottomY, buttonY - buttonHeight / 2 - boardLayout.cellSize * 0.35);

    const pathPoints = this.resolveMapPathPoints(boardLayout, headerHeight);
    this.monsterPath = this.buildCurve(pathPoints);
    this.drawPath(this.monsterPath);
    this.drawFieldSlots(this.boardCells, boardLayout.cellSize);
    this.rangeGraphics = this.add.graphics();

    this.placedUnits.forEach((placed, index) => {
      const cell = this.boardCells.find((c) => cellIndex(c.row, c.col) === index);
      if (cell) this.drawUnitSprite(cell, placed);
    });

    this.hudText = this.add
      .text(width / 2, headerHeight * 0.4, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);
    this.refreshHud();

    this.statusText = this.add
      .text(width / 2, headerHeight * 0.78, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#f6e6b4',
      })
      .setOrigin(0.5);
    this.refreshStatus();

    const exitButton = this.add
      .text(px(12), headerHeight * 0.4, '나가기', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(16.5)}px`,
        color: '#ff9a9a',
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('deck-select', { forceEdit: true }));
    exitButton.setPadding(px(6), px(6), px(6), px(6));

    this.nicknameText = this.add
      .text(px(12), headerHeight * 0.78, this.currentNickname ? `${this.currentNickname}님` : '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(12)}px`,
        color: '#9fd8ff',
      })
      .setOrigin(0, 0.5);

    const deckButton = this.add
      .text(width - px(12), headerHeight * 0.4, '덱 변경', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(16.5)}px`,
        color: '#9a917d',
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('deck-select', { forceEdit: true }));
    deckButton.setPadding(px(6), px(6), px(6), px(6));

    this.rangeToggleText = this.add
      .text(width - px(12), headerHeight * 0.78, this.showRange ? '사거리 끄기' : '사거리 보기', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(16.5)}px`,
        color: this.showRange ? '#9fd8ff' : '#6a6458',
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
      .setPadding(px(6), px(6), px(6), px(6))
      .on('pointerdown', () => this.toggleRange());

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
    this.summonButtonText?.setText(
      this.pendingSummon ? '놓을 칸 선택 (취소)' : `소환 (${currentSummonCost(this.economy)}마나)`,
    );
    this.refreshStatus();
  }

  private refreshStatus(): void {
    this.statusText?.setText(`마나 ${this.economy.mana} · 몬스터 ${this.monsters.length}/${MAX_MONSTERS_ON_FIELD}`);
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

  // 현재 판에 고른 맵(this.currentMap)의 길 좌표(칸 사이 틈)를 실제 화면 픽셀
  // 좌표로 바꾼다. 맨 위는 화면 상단(입구), 맨 아래는 기존 "몬스터가 멈춰서
  // 공격받는 위치"(fieldBottomY)에 맞춰 길이 끝나도록 한다.
  private resolveMapPathPoints(boardLayout: BoardLayout, headerHeight: number): { x: number; y: number }[] {
    const waypoints = this.currentMap.waypoints;
    const entry = resolveCorridorPoint(waypoints[0].gapCol, waypoints[0].gapRow, boardLayout);
    const topPoint = { x: entry.x, y: headerHeight };

    const corridorPoints = waypoints.map((wp) => resolveCorridorPoint(wp.gapCol, wp.gapRow, boardLayout));
    const lastPoint = corridorPoints[corridorPoints.length - 1];
    corridorPoints[corridorPoints.length - 1] = { x: lastPoint.x, y: this.fieldBottomY };

    return [topPoint, ...corridorPoints];
  }

  private buildCurve(points: { x: number; y: number }[]): Phaser.Curves.Path {
    const curve = new Phaser.Curves.Path(points[0].x, points[0].y);
    curve.splineTo(points.slice(1).map((p) => new Phaser.Math.Vector2(p.x, p.y)));
    return curve;
  }

  private drawPath(curve: Phaser.Curves.Path): void {
    const samples = curve.getPoints(64);

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
    createGemTexture(this, key, getRarity(placed.unit.rarity), sigil, 1, size);

    const index = cellIndex(cell.row, cell.col);
    const sprite = this.add
      .image(cell.x, cell.y, key)
      .setDisplaySize(this.cellSize * 0.86, this.cellSize * 0.86)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => sprite.setData('dragMoved', false))
      .on('pointerup', () => {
        if (!sprite.getData('dragMoved')) this.handleUnitTap(index);
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

    this.refreshRangeOverlay();
  }

  private toggleRange(): void {
    this.showRange = !this.showRange;
    this.refreshRangeOverlay();
    this.rangeToggleText?.setText(this.showRange ? '사거리 끄기' : '사거리 보기');
    this.rangeToggleText?.setColor(this.showRange ? '#9fd8ff' : '#6a6458');
  }

  private refreshRangeOverlay(): void {
    if (!this.rangeGraphics) return;
    this.rangeGraphics.clear();
    if (!this.showRange) return;

    this.placedUnits.forEach((placed, index) => {
      const cell = this.boardCells.find((c) => cellIndex(c.row, c.col) === index);
      if (!cell) return;

      const radius = placed.unit.range * this.boardStep;
      const color = ROLE_ATTACK_COLORS[placed.unit.role] ?? 0x9fd8ff;
      this.rangeGraphics!.fillStyle(color, 0.07);
      this.rangeGraphics!.fillCircle(cell.x, cell.y, radius);
      this.rangeGraphics!.lineStyle(px(1.5), color, 0.55);
      this.rangeGraphics!.strokeCircle(cell.x, cell.y, radius);
    });
  }

  private totalMultiplier(unit: UnitDef): number {
    const enhanceLevel = this.enhanceLevels.get(unit.id) ?? 0;
    return (
      statMultiplier(enhanceLevel) *
      levelStatMultiplier(getUnitLevel(unit.id)) *
      generalAttackMultiplier() *
      roleMultiplier(unit.role)
    );
  }

  private handleUnitTap(index: number): void {
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

    this.showEnhanceConfirm(index, placed, level, cost);
  }

  private showEnhanceConfirm(index: number, placed: PlacedUnit, level: number, cost: number): void {
    this.enhanceConfirmContainer?.destroy(true);

    const { width, height } = this.scale;
    const container = this.add.container(0, 0).setDepth(900);
    this.enhanceConfirmContainer = container;

    const backdrop = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55);
    container.add(backdrop);

    const cardWidth = Math.min(width * 0.78, px(320));
    const cardHeight = height * 0.22;
    const cardY = height * 0.5;

    const cardBg = this.add.graphics();
    cardBg.fillStyle(0x151a28, 0.97);
    cardBg.fillRoundedRect(width / 2 - cardWidth / 2, cardY - cardHeight / 2, cardWidth, cardHeight, px(14));
    cardBg.lineStyle(px(2), 0xd4b36a, 0.9);
    cardBg.strokeRoundedRect(width / 2 - cardWidth / 2, cardY - cardHeight / 2, cardWidth, cardHeight, px(14));
    container.add(cardBg);

    const title = this.add
      .text(width / 2, cardY - cardHeight * 0.28, `${placed.unit.name} 강화할까요?`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(15)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    container.add(title);

    const subtitle = this.add
      .text(width / 2, cardY - cardHeight * 0.02, `강화 ${level} → ${level + 1} · 비용 ${cost}마나`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(12)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);
    container.add(subtitle);

    const buttonY = cardY + cardHeight * 0.28;
    const buttonWidth = cardWidth * 0.42;
    const buttonHeight = cardHeight * 0.32;
    const gap = cardWidth * 0.06;
    const cancelX = width / 2 - buttonWidth / 2 - gap / 2;
    const confirmX = width / 2 + buttonWidth / 2 + gap / 2;

    const cancelBg = this.add.graphics();
    cancelBg.fillStyle(0x1f2536, 1);
    cancelBg.fillRoundedRect(cancelX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(8));
    cancelBg.lineStyle(px(1.5), 0x555555, 0.9);
    cancelBg.strokeRoundedRect(cancelX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(8));
    container.add(cancelBg);

    const cancelText = this.add
      .text(cancelX, buttonY, '취소', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#9a917d',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    container.add(cancelText);

    const cancelZone = this.add.zone(cancelX, buttonY, buttonWidth, buttonHeight).setInteractive({ useHandCursor: true });
    container.add(cancelZone);

    const confirmBg = this.add.graphics();
    confirmBg.fillStyle(0x2a2416, 1);
    confirmBg.fillRoundedRect(confirmX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(8));
    confirmBg.lineStyle(px(1.5), 0xd4b36a, 1);
    confirmBg.strokeRoundedRect(confirmX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(8));
    container.add(confirmBg);

    const confirmText = this.add
      .text(confirmX, buttonY, '강화', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#ffd98a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    container.add(confirmText);

    const confirmZone = this.add
      .zone(confirmX, buttonY, buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true });
    container.add(confirmZone);

    const close = () => {
      if (this.enhanceConfirmContainer === container) this.enhanceConfirmContainer = undefined;
      container.destroy(true);
    };

    cancelZone.on('pointerdown', close);
    confirmZone.on('pointerdown', () => {
      close();
      this.performEnhance(index);
    });
  }

  private performEnhance(index: number): void {
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

    if (canMerge && targetPlaced) {
      this.mergeUnits(sourceIndex, sourcePlaced, targetIndex, targetPlaced, sourceCell, targetCell);
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
    sourcePlaced: PlacedUnit,
    targetIndex: number,
    targetPlaced: PlacedUnit,
    sourceCell: CellPosition,
    targetCell: CellPosition,
  ): void {
    sourcePlaced.sprite?.destroy();
    sourcePlaced.label?.destroy();
    targetPlaced.sprite?.destroy();
    targetPlaced.label?.destroy();

    this.placedUnits.delete(sourceIndex);
    this.placedUnits.delete(targetIndex);

    // 합성 결과는 합쳐진 두 유닛과 같은 등급의 덱 유닛 중에서만 무작위로
    // 나오게 한다 (등급이 갑자기 뛰거나 떨어지면 밸런스가 안 맞으므로).
    const rarity = sourcePlaced.unit.rarity;
    const sameRarityPool = this.deckPool().filter((u) => u.rarity === rarity);
    const resultUnit = pickRandomUnit(sameRarityPool.length > 0 ? sameRarityPool : this.deckPool());
    const result: PlacedUnit = {
      unit: resultUnit,
      star: Math.min(MAX_STAR, sourcePlaced.star + 1),
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
    const species = pickRandomSpecies();
    const hp = Math.round(kind.baseHp * stageHpMultiplier(result.stage));

    const size = Math.round(this.cellSize * kind.sizeRatio);
    const textureKey = `monster-${kind.id}-${species.id}-${size}`;
    createMonsterTexture(this, textureKey, size, { ...kind, shape: species.id });

    const start = this.monsterPath.getPoint(0);
    const monster = this.add.image(start.x, start.y, textureKey);
    monster.setData('t', 0);
    monster.setData('crawlSpeed', kind.crawlSpeed);
    monster.setData('hp', hp);
    monster.setData('maxHp', hp);
    monster.setData('kind', kind.id);

    this.monsters.push(monster);
    this.refreshStatus();

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
