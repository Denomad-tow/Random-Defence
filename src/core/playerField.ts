import Phaser from 'phaser';
import { cellIndex, type CellPosition } from './board';
import { canAffordSummon, currentSummonCost, spendForSummon, type EconomyState } from './economy';
import { MAX_ENHANCE_LEVEL, canEnhance, enhanceCost, statMultiplier } from './enhancement';
import { MAX_STAR, ROLE_ATTACK_COLORS, pickRandomUnit, type UnitDef } from './units';
import { getRarity } from './graphics/gem';
import { ROLE_SIGILS } from './graphics/sigils';
import { createGemTexture } from './graphics/texture';
import { generalAttackMultiplier, generalAttackSpeedBonus, roleMultiplier } from '../meta/research';
import { getUnitLevel, levelStatMultiplier } from '../meta/levels';
import { px } from './dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
const DOUBLE_TAP_WINDOW_MS = 320;

export interface PlacedUnitState {
  unit: UnitDef;
  star: number;
  cooldown: number;
  sprite?: Phaser.GameObjects.Image;
  label?: Phaser.GameObjects.Text;
}

export interface ConfirmOptions {
  title: string;
  subtitle: string;
  confirmLabel: string;
  confirmColor: string;
  onConfirm: () => void;
}

// 협동전·경쟁전 화면이 이 도우미에게 알려줘야 하는 것들.
export interface FieldHost {
  scene: Phaser.Scene;
  geometry(): { cells: CellPosition[]; cellSize: number; boardStep: number };
  economy(): EconomyState;
  setEconomy(next: EconomyState): void;
  onEconomyChange(): void; // 마나·소환 버튼 표시 갱신
  deckPool(): UnitDef[];
  confirm(options: ConfirmOptions): void;
  floatText(x: number, y: number, message: string, color: string): void;
  // 연구·컬렉션 레벨 보너스를 쓸지 여부(경쟁전 균형 모드에서는 격차를 줄이려고 끈다).
  useMetaBonuses: boolean;
}

// 개인전(GameScene)의 "내 필드 다루기"를 협동전·경쟁전에서도 똑같이 쓰도록 옮긴 것:
// 소환 후 칸 직접 고르기, 드래그로 이동, 같은 유닛 합성(별), 더블 탭 강화, 사거리 보기,
// 그리고 연구·레벨·강화에 따른 능력치 배율 계산.
export class PlayerField {
  placedUnits = new Map<number, PlacedUnitState>();
  enhanceLevels = new Map<string, number>();
  pendingSummon?: PlacedUnitState;
  showRange = false;

  private pendingPreEconomy?: EconomyState;
  private highlights: Phaser.GameObjects.Arc[] = [];
  private rangeGraphics?: Phaser.GameObjects.Graphics;
  private lastTapIndex: number | null = null;
  private lastTapTime = 0;

  private readonly host: FieldHost;

  constructor(host: FieldHost) {
    this.host = host;
  }

  // ----- 능력치 배율 -----

  // 강화·레벨·연구가 합쳐진 공격력 배율.
  totalMultiplier(unit: UnitDef): number {
    const enhance = statMultiplier(this.enhanceLevels.get(unit.id) ?? 0);
    if (!this.host.useMetaBonuses) return enhance;
    return enhance * levelStatMultiplier(getUnitLevel(unit.id)) * generalAttackMultiplier() * roleMultiplier(unit.role);
  }

  attackOf(unit: UnitDef): number {
    return Math.round(unit.attack * this.totalMultiplier(unit));
  }

  // 감속·독·방어 감소 수치에 곱하는 배율(연구 직업 레벨).
  statusMagnitude(unit: UnitDef): number {
    return this.host.useMetaBonuses ? roleMultiplier(unit.role) : 1;
  }

  // 연구의 "공격속도" 보너스.
  attackSpeedBonus(): number {
    return this.host.useMetaBonuses ? generalAttackSpeedBonus() : 0;
  }

  // ----- 입력 -----

  // 씬의 create()에서 한 번 호출: 유닛 드래그 이동/합성을 처리한다.
  registerDragHandlers(): void {
    const scene = this.host.scene;

    scene.input.dragDistanceThreshold = px(10);

    scene.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      gameObject.setData('dragMoved', true);
      scene.children.bringToTop(gameObject);
    });

    scene.input.on(
      'drag',
      (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Image, dragX: number, dragY: number) => {
        gameObject.setPosition(dragX, dragY);
      },
    );

    scene.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      this.handleUnitDrop(gameObject, pointer);
    });
  }

  // ----- 그리기 -----

  // 씬이 화면을 다시 그린 뒤(모든 오브젝트가 지워진 뒤)에 호출한다.
  afterLayout(): void {
    this.highlights = [];
    this.rangeGraphics = this.host.scene.add.graphics();

    const { cells } = this.host.geometry();
    this.placedUnits.forEach((placed, index) => {
      const cell = cells.find((c) => cellIndex(c.row, c.col) === index);
      if (cell) this.drawUnit(cell, placed);
    });

    if (this.pendingSummon) this.enterPlacementMode();
  }

  drawUnit(cell: CellPosition, placed: PlacedUnitState, animate = false): void {
    const scene = this.host.scene;
    const { cellSize } = this.host.geometry();

    placed.sprite?.destroy();
    placed.label?.destroy();

    const size = Math.round(cellSize * 0.86);
    const key = `unit-${placed.unit.rarity}-${placed.unit.role}-${size}`;
    createGemTexture(scene, key, getRarity(placed.unit.rarity), ROLE_SIGILS[placed.unit.role], 1, size);

    const index = cellIndex(cell.row, cell.col);
    const sprite = scene.add
      .image(cell.x, cell.y, key)
      .setDisplaySize(cellSize * 0.86, cellSize * 0.86)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => sprite.setData('dragMoved', false))
      .on('pointerup', () => {
        if (sprite.getData('dragMoved')) return;
        this.registerUnitTap(index);
      });
    sprite.setData('cellIndex', index);
    scene.input.setDraggable(sprite);

    if (animate) {
      const targetScaleX = sprite.scaleX;
      const targetScaleY = sprite.scaleY;
      sprite.setScale(targetScaleX * 0.1, targetScaleY * 0.1);
      scene.tweens.add({ targets: sprite, scaleX: targetScaleX, scaleY: targetScaleY, duration: 280, ease: 'Back.Out' });
    }

    const level = this.enhanceLevels.get(placed.unit.id) ?? 0;
    const labelText = level > 0 ? `${'★'.repeat(placed.star)} · 강화${level}` : '★'.repeat(placed.star);
    placed.label = scene.add
      .text(cell.x, cell.y + cellSize * 0.4, labelText, { fontFamily: TITLE_FONT, fontSize: `${px(11)}px`, color: '#f3dc9a' })
      .setOrigin(0.5);
    placed.sprite = sprite;

    this.refreshRangeOverlay();
  }

  // ----- 소환과 칸 고르기 -----

  hasEmptyCell(): boolean {
    return this.host.geometry().cells.some((c) => !this.placedUnits.has(cellIndex(c.row, c.col)));
  }

  summonLabel(): string {
    return this.pendingSummon ? '놓을 칸 선택 (취소)' : `소환 (${currentSummonCost(this.host.economy())}마나)`;
  }

  canSummon(): boolean {
    return !!this.pendingSummon || (canAffordSummon(this.host.economy()) && this.hasEmptyCell());
  }

  trySummon(): void {
    if (this.pendingSummon) {
      this.cancelPendingSummon();
      return;
    }
    if (!canAffordSummon(this.host.economy()) || !this.hasEmptyCell()) return;

    this.pendingPreEconomy = this.host.economy();
    this.host.setEconomy(spendForSummon(this.host.economy()));

    const unit = pickRandomUnit(this.host.deckPool());
    this.pendingSummon = { unit, star: 1, cooldown: Math.random() * 0.3 };

    this.host.onEconomyChange();
    this.enterPlacementMode();
  }

  cancelPendingSummon(): void {
    if (!this.pendingSummon) return;

    this.pendingSummon = undefined;
    if (this.pendingPreEconomy) {
      this.host.setEconomy(this.pendingPreEconomy);
      this.pendingPreEconomy = undefined;
    }

    this.clearHighlights();
    this.host.onEconomyChange();
  }

  // 빈 칸(슬롯)을 탭했을 때 호출한다.
  handleCellTap(cell: CellPosition): void {
    if (!this.pendingSummon) return;

    const index = cellIndex(cell.row, cell.col);
    if (this.placedUnits.has(index)) return;

    this.placedUnits.set(index, this.pendingSummon);
    this.drawUnit(cell, this.pendingSummon, true);

    this.pendingSummon = undefined;
    this.pendingPreEconomy = undefined;
    this.clearHighlights();
    this.host.onEconomyChange();
  }

  private enterPlacementMode(): void {
    this.clearHighlights();
    const { cells, cellSize } = this.host.geometry();

    cells.forEach((cell) => {
      if (this.placedUnits.has(cellIndex(cell.row, cell.col))) return;

      const ring = this.host.scene.add.circle(cell.x, cell.y, cellSize * 0.48, 0xffd98a, 0.16);
      ring.setStrokeStyle(px(2), 0xffd98a, 0.9);
      this.host.scene.tweens.add({ targets: ring, alpha: { from: 0.9, to: 0.35 }, duration: 500, yoyo: true, repeat: -1 });
      this.highlights.push(ring);
    });
  }

  private clearHighlights(): void {
    this.highlights.forEach((ring) => ring.destroy());
    this.highlights = [];
  }

  // ----- 드래그 이동 / 합성 -----

  private findNearestCell(x: number, y: number): CellPosition | null {
    const { cells, cellSize } = this.host.geometry();
    let nearest: CellPosition | null = null;
    let nearestDist = Infinity;

    cells.forEach((cell) => {
      const dist = Phaser.Math.Distance.Between(x, y, cell.x, cell.y);
      if (dist <= cellSize * 0.6 && dist < nearestDist) {
        nearest = cell;
        nearestDist = dist;
      }
    });

    return nearest;
  }

  private handleUnitDrop(gameObject: Phaser.GameObjects.GameObject, pointer: Phaser.Input.Pointer): void {
    const { cells } = this.host.geometry();
    const sourceIndex = gameObject.getData('cellIndex') as number;
    const sourcePlaced = this.placedUnits.get(sourceIndex);
    const sourceCell = cells.find((c) => cellIndex(c.row, c.col) === sourceIndex);
    if (!sourcePlaced || !sourceCell) return;

    const targetCell = this.findNearestCell(pointer.x, pointer.y);
    if (!targetCell) {
      this.drawUnit(sourceCell, sourcePlaced);
      return;
    }

    const targetIndex = cellIndex(targetCell.row, targetCell.col);
    if (targetIndex === sourceIndex) {
      this.drawUnit(sourceCell, sourcePlaced);
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

    this.drawUnit(targetCell, sourcePlaced);
    if (targetPlaced) this.drawUnit(sourceCell, targetPlaced);
  }

  private mergeUnits(
    sourceIndex: number,
    sourcePlaced: PlacedUnitState,
    targetIndex: number,
    targetPlaced: PlacedUnitState,
    sourceCell: CellPosition,
    targetCell: CellPosition,
  ): void {
    sourcePlaced.sprite?.destroy();
    sourcePlaced.label?.destroy();
    targetPlaced.sprite?.destroy();
    targetPlaced.label?.destroy();

    this.placedUnits.delete(sourceIndex);
    this.placedUnits.delete(targetIndex);

    // 합성 결과는 합쳐진 두 유닛과 같은 등급의 덱 유닛 중에서만 무작위로 나온다(개인전과 동일).
    const rarity = sourcePlaced.unit.rarity;
    const pool = this.host.deckPool();
    const sameRarityPool = pool.filter((u) => u.rarity === rarity);
    const resultUnit = pickRandomUnit(sameRarityPool.length > 0 ? sameRarityPool : pool);
    const result: PlacedUnitState = {
      unit: resultUnit,
      star: Math.min(MAX_STAR, sourcePlaced.star + 1),
      cooldown: Math.random() * 0.3,
    };
    this.placedUnits.set(targetIndex, result);

    this.playMergeEffect(sourceCell, targetCell, () => this.drawUnit(targetCell, result, true));
  }

  private playMergeEffect(from: CellPosition, to: CellPosition, onComplete: () => void): void {
    const scene = this.host.scene;
    const { cellSize } = this.host.geometry();

    for (let i = 0; i < 10; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const dist = cellSize * 0.4;
      const spark = scene.add.circle(to.x + Math.cos(angle) * dist, to.y + Math.sin(angle) * dist, px(3), 0xffe9b0, 0.9);
      scene.tweens.add({ targets: spark, x: to.x, y: to.y, alpha: 0, duration: 320, onComplete: () => spark.destroy() });
    }

    const ghost = scene.add.circle(from.x, from.y, cellSize * 0.3, 0xffe9b0, 0.6);
    scene.tweens.add({
      targets: ghost,
      x: to.x,
      y: to.y,
      alpha: 0,
      scale: 0.2,
      duration: 320,
      onComplete: () => {
        ghost.destroy();
        const flash = scene.add.circle(to.x, to.y, cellSize * 0.55, 0xffffff, 0.9);
        scene.tweens.add({
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

  // ----- 강화 (같은 유닛을 짧은 시간 안에 두 번 탭) -----

  private registerUnitTap(index: number): void {
    const now = this.host.scene.time.now;
    const isDoubleTap = this.lastTapIndex === index && now - this.lastTapTime < DOUBLE_TAP_WINDOW_MS;

    if (isDoubleTap) {
      this.lastTapIndex = null;
      this.lastTapTime = 0;
      this.handleUnitTap(index);
      return;
    }

    this.lastTapIndex = index;
    this.lastTapTime = now;
  }

  private handleUnitTap(index: number): void {
    const placed = this.placedUnits.get(index);
    const cell = this.host.geometry().cells.find((c) => cellIndex(c.row, c.col) === index);
    if (!placed || !cell) return;

    const level = this.enhanceLevels.get(placed.unit.id) ?? 0;
    if (!canEnhance(level)) {
      this.host.floatText(cell.x, cell.y, `최대 강화(Lv.${MAX_ENHANCE_LEVEL})`, '#9a917d');
      return;
    }

    const cost = enhanceCost(level);
    if (this.host.economy().mana < cost) {
      this.host.floatText(cell.x, cell.y, '마나 부족', '#ff8a8a');
      return;
    }

    this.host.confirm({
      title: `${placed.unit.name} 강화할까요?`,
      subtitle: `강화 ${level} → ${level + 1} · 비용 ${cost}마나`,
      confirmLabel: '강화',
      confirmColor: '#ffd98a',
      onConfirm: () => this.performEnhance(index),
    });
  }

  private performEnhance(index: number): void {
    const placed = this.placedUnits.get(index);
    const { cells } = this.host.geometry();
    const cell = cells.find((c) => cellIndex(c.row, c.col) === index);
    if (!placed || !cell) return;

    const level = this.enhanceLevels.get(placed.unit.id) ?? 0;
    if (!canEnhance(level)) return;

    const cost = enhanceCost(level);
    if (this.host.economy().mana < cost) {
      this.host.floatText(cell.x, cell.y, '마나 부족', '#ff8a8a');
      return;
    }

    this.host.setEconomy({ ...this.host.economy(), mana: this.host.economy().mana - cost });
    this.enhanceLevels.set(placed.unit.id, level + 1);
    this.host.onEconomyChange();

    this.placedUnits.forEach((entry, entryIndex) => {
      if (entry.unit.id !== placed.unit.id) return;
      const entryCell = cells.find((c) => cellIndex(c.row, c.col) === entryIndex);
      if (entryCell) this.drawUnit(entryCell, entry);
    });

    this.host.floatText(cell.x, cell.y, `강화 Lv.${level + 1}!`, '#ffd98a');
  }

  // ----- 사거리 보기 -----

  toggleRange(): boolean {
    this.showRange = !this.showRange;
    this.refreshRangeOverlay();
    return this.showRange;
  }

  private refreshRangeOverlay(): void {
    if (!this.rangeGraphics || !this.rangeGraphics.active) return;
    this.rangeGraphics.clear();
    if (!this.showRange) return;

    const { cells, boardStep } = this.host.geometry();
    this.placedUnits.forEach((placed, index) => {
      const cell = cells.find((c) => cellIndex(c.row, c.col) === index);
      if (!cell) return;

      const radius = placed.unit.range * boardStep;
      const color = ROLE_ATTACK_COLORS[placed.unit.role] ?? 0x9fd8ff;
      this.rangeGraphics!.fillStyle(color, 0.07);
      this.rangeGraphics!.fillCircle(cell.x, cell.y, radius);
      this.rangeGraphics!.lineStyle(px(1.5), color, 0.55);
      this.rangeGraphics!.strokeCircle(cell.x, cell.y, radius);
    });
  }
}
