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

interface ActionButton {
  id: 'summon' | 'random' | 'merge' | 'remove';
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  x: number;
  y: number;
  w: number;
  h: number;
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

// 개인전·협동전·경쟁전이 똑같이 쓰는 "내 필드 다루기":
// 칸을 골라 소환 / 랜덤 소환, 드래그로 이동, 같은 유닛 합성(별) / 자동 합성,
// 더블 탭 강화, 유닛 제거, 유닛을 눌러 사거리 보기,
// 그리고 연구·레벨·강화에 따른 능력치 배율 계산.
export class PlayerField {
  placedUnits = new Map<number, PlacedUnitState>();
  enhanceLevels = new Map<string, number>();
  pendingSummon?: PlacedUnitState;
  removeMode = false;
  private selected?: PlacedUnitState;
  private actionButtons: ActionButton[] = [];

  private pendingPreEconomy?: EconomyState;
  private highlights: Phaser.GameObjects.Arc[] = [];
  private rangeGraphics?: Phaser.GameObjects.Graphics;
  private lastTapIndex: number | null = null;
  private lastTapTime = 0;

  private readonly host: FieldHost;

  private notifyChange(): void {
    this.host.onEconomyChange();
    this.refreshActionBar();
  }

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
    this.actionButtons = [];
    this.rangeGraphics = this.host.scene.add.graphics();

    const { cells } = this.host.geometry();
    this.placedUnits.forEach((placed, index) => {
      const cell = cells.find((c) => cellIndex(c.row, c.col) === index);
      if (cell) this.drawUnit(cell, placed);
    });

    if (this.pendingSummon) this.enterPlacementMode();
    if (this.removeMode) this.enterRemoveMode();
    this.refreshRangeOverlay();
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
        if (this.removeMode) {
          this.askRemove(index);
          return;
        }
        this.select(index);
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

  private summonCostText(): string {
    return `${currentSummonCost(this.host.economy())}마나`;
  }

  // 마나가 넉넉하고 빈 칸이 있어서 지금 소환할 수 있는가(칸 선택·랜덤 소환 공통).
  canSummon(): boolean {
    return canAffordSummon(this.host.economy()) && this.hasEmptyCell();
  }

  // "칸 선택 소환": 마나를 먼저 내고, 유닛을 놓을 칸을 직접 고른다. 한 번 더 누르면 취소(마나 환불).
  trySummon(): void {
    if (this.pendingSummon) {
      this.cancelPendingSummon();
      return;
    }
    if (!this.canSummon()) return;
    this.cancelRemoveMode();

    this.pendingPreEconomy = this.host.economy();
    this.host.setEconomy(spendForSummon(this.host.economy()));

    const unit = pickRandomUnit(this.host.deckPool());
    this.pendingSummon = { unit, star: 1, cooldown: Math.random() * 0.3 };

    this.notifyChange();
    this.enterPlacementMode();
  }

  // "랜덤 소환": 빈 칸 중 무작위 한 곳에 바로 소환한다. 비용(소환 횟수에 따라 오르는 값)은 칸 선택 소환과 같다.
  randomSummon(): void {
    if (this.pendingSummon) return;
    if (!this.canSummon()) return;
    this.cancelRemoveMode();

    const { cells } = this.host.geometry();
    const empty = cells.filter((c) => !this.placedUnits.has(cellIndex(c.row, c.col)));
    const cell = empty[Math.floor(Math.random() * empty.length)];

    this.host.setEconomy(spendForSummon(this.host.economy()));
    const placed: PlacedUnitState = { unit: pickRandomUnit(this.host.deckPool()), star: 1, cooldown: Math.random() * 0.3 };
    this.placedUnits.set(cellIndex(cell.row, cell.col), placed);
    this.drawUnit(cell, placed, true);
    this.notifyChange();
  }

  cancelPendingSummon(): void {
    if (!this.pendingSummon) return;

    this.pendingSummon = undefined;
    if (this.pendingPreEconomy) {
      this.host.setEconomy(this.pendingPreEconomy);
      this.pendingPreEconomy = undefined;
    }

    this.clearHighlights();
    this.notifyChange();
  }

  // 빈 칸(슬롯)을 탭했을 때 호출한다.
  handleCellTap(cell: CellPosition): void {
    if (!this.pendingSummon) {
      this.select(undefined);
      return;
    }

    const index = cellIndex(cell.row, cell.col);
    if (this.placedUnits.has(index)) return;

    this.placedUnits.set(index, this.pendingSummon);
    this.drawUnit(cell, this.pendingSummon, true);

    this.pendingSummon = undefined;
    this.pendingPreEconomy = undefined;
    this.clearHighlights();
    this.notifyChange();
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
    this.refreshActionBar();
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

    const result = this.createMergeResult(sourcePlaced);
    this.placedUnits.set(targetIndex, result);
    if (this.selected === sourcePlaced || this.selected === targetPlaced) this.selected = result;

    this.playMergeEffect(sourceCell, targetCell, () => {
      this.drawUnit(targetCell, result, true);
      this.refreshActionBar();
    });
  }

  // 합성 결과는 합쳐진 두 유닛과 같은 등급의 덱 유닛 중에서만 무작위로 나온다(개인전과 동일).
  private createMergeResult(source: PlacedUnitState): PlacedUnitState {
    const pool = this.host.deckPool();
    const sameRarityPool = pool.filter((u) => u.rarity === source.unit.rarity);
    return {
      unit: pickRandomUnit(sameRarityPool.length > 0 ? sameRarityPool : pool),
      star: Math.min(MAX_STAR, source.star + 1),
      cooldown: Math.random() * 0.3,
    };
  }

  private isMergeable(a: PlacedUnitState, b: PlacedUnitState): boolean {
    return a !== b && a.unit.id === b.unit.id && a.star === b.star && a.star < MAX_STAR;
  }

  // 지금 합성할 수 있는 쌍의 수(같은 유닛·같은 별끼리 둘씩 묶은 수).
  mergeablePairCount(): number {
    const groups = new Map<string, number>();
    this.placedUnits.forEach((placed) => {
      if (placed.star >= MAX_STAR) return;
      const key = `${placed.unit.id}:${placed.star}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    });
    let pairs = 0;
    groups.forEach((count) => {
      pairs += Math.floor(count / 2);
    });
    return pairs;
  }

  // "자동 합성": 합성할 수 있는 같은 유닛(같은 별)을 짝지어 더 이상 합칠 게 없을 때까지 계속 합친다.
  autoMerge(): number {
    if (this.pendingSummon) return 0;
    this.cancelRemoveMode();

    const { cells, cellSize } = this.host.geometry();
    const changed = new Set<number>();
    let merges = 0;

    for (let guard = 0; guard < 200; guard += 1) {
      const entries = Array.from(this.placedUnits.entries());
      let found: [number, number] | null = null;
      for (let i = 0; i < entries.length && !found; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          if (this.isMergeable(entries[i][1], entries[j][1])) {
            found = [entries[i][0], entries[j][0]];
            break;
          }
        }
      }
      if (!found) break;

      const [sourceIndex, targetIndex] = found;
      const source = this.placedUnits.get(sourceIndex)!;
      const target = this.placedUnits.get(targetIndex)!;
      source.sprite?.destroy();
      source.label?.destroy();
      target.sprite?.destroy();
      target.label?.destroy();

      const result = this.createMergeResult(source);
      if (this.selected === source || this.selected === target) this.selected = result;
      this.placedUnits.delete(sourceIndex);
      this.placedUnits.set(targetIndex, result);
      changed.delete(sourceIndex);
      changed.add(targetIndex);
      merges += 1;
    }

    changed.forEach((index) => {
      const placed = this.placedUnits.get(index);
      const cell = cells.find((c) => cellIndex(c.row, c.col) === index);
      if (placed && cell) {
        this.drawUnit(cell, placed, true);
        this.host.floatText(cell.x, cell.y - cellSize * 0.5, '합성!', '#ffe9b0');
      }
    });

    this.refreshRangeOverlay();
    this.refreshActionBar();
    return merges;
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
    this.notifyChange();

    this.placedUnits.forEach((entry, entryIndex) => {
      if (entry.unit.id !== placed.unit.id) return;
      const entryCell = cells.find((c) => cellIndex(c.row, c.col) === entryIndex);
      if (entryCell) this.drawUnit(entryCell, entry);
    });

    this.host.floatText(cell.x, cell.y, `강화 Lv.${level + 1}!`, '#ffd98a');
  }

  // ----- 유닛 제거 -----

  toggleRemoveMode(): void {
    if (this.removeMode) {
      this.cancelRemoveMode();
      return;
    }
    if (this.placedUnits.size === 0) return;
    this.cancelPendingSummon();
    this.removeMode = true;
    this.enterRemoveMode();
    this.refreshActionBar();
  }

  private cancelRemoveMode(): void {
    if (!this.removeMode) return;
    this.removeMode = false;
    this.clearHighlights();
    this.refreshActionBar();
  }

  private enterRemoveMode(): void {
    this.clearHighlights();
    const { cells, cellSize } = this.host.geometry();
    this.placedUnits.forEach((_placed, index) => {
      const cell = cells.find((c) => cellIndex(c.row, c.col) === index);
      if (!cell) return;
      const ring = this.host.scene.add.circle(cell.x, cell.y, cellSize * 0.5, 0xff6b6b, 0.12);
      ring.setStrokeStyle(px(2), 0xff6b6b, 0.9);
      this.host.scene.tweens.add({ targets: ring, alpha: { from: 0.95, to: 0.4 }, duration: 450, yoyo: true, repeat: -1 });
      this.highlights.push(ring);
    });
  }

  private askRemove(index: number): void {
    const placed = this.placedUnits.get(index);
    if (!placed) return;

    this.host.confirm({
      title: `${placed.unit.name} 제거할까요?`,
      subtitle: '제거한 유닛은 되돌릴 수 없고 마나도 돌려받지 못해요',
      confirmLabel: '제거',
      confirmColor: '#ff9a9a',
      onConfirm: () => this.removeUnit(index),
    });
  }

  private removeUnit(index: number): void {
    const placed = this.placedUnits.get(index);
    if (!placed) return;

    placed.sprite?.destroy();
    placed.label?.destroy();
    this.placedUnits.delete(index);
    if (this.selected === placed) this.selected = undefined;

    this.removeMode = false;
    this.clearHighlights();
    this.refreshRangeOverlay();
    this.refreshActionBar();
  }

  // ----- 사거리 보기 (유닛을 누르면 그 유닛의 사거리만 보인다) -----

  private select(index: number | undefined): void {
    this.selected = index === undefined ? undefined : this.placedUnits.get(index);
    this.refreshRangeOverlay();
  }

  private refreshRangeOverlay(): void {
    if (!this.rangeGraphics || !this.rangeGraphics.active) return;
    this.rangeGraphics.clear();

    const placed = this.selected;
    if (!placed) return;

    const { cells, boardStep } = this.host.geometry();
    let index: number | undefined;
    this.placedUnits.forEach((entry, entryIndex) => {
      if (entry === placed) index = entryIndex;
    });
    if (index === undefined) {
      this.selected = undefined;
      return;
    }

    const cell = cells.find((c) => cellIndex(c.row, c.col) === index);
    if (!cell) return;

    const radius = placed.unit.range * boardStep;
    const color = ROLE_ATTACK_COLORS[placed.unit.role] ?? 0x9fd8ff;
    this.rangeGraphics.fillStyle(color, 0.1);
    this.rangeGraphics.fillCircle(cell.x, cell.y, radius);
    this.rangeGraphics.lineStyle(px(2), color, 0.75);
    this.rangeGraphics.strokeCircle(cell.x, cell.y, radius);
  }

  // ----- 아래쪽 버튼 4개(소환 / 랜덤 소환 / 자동 합성 / 유닛 제거) -----

  // 화면 아래에 2×2 버튼을 그린다. topY는 첫 줄의 위쪽 가장자리, rowHeight는 버튼 한 줄 높이.
  drawActionBar(centerX: number, topY: number, totalWidth: number, rowHeight: number): void {
    const scene = this.host.scene;
    const gap = px(8);
    const w = (totalWidth - gap) / 2;
    const defs: Array<{ id: ActionButton['id']; col: number; row: number; action: () => void }> = [
      { id: 'summon', col: 0, row: 0, action: () => this.trySummon() },
      { id: 'random', col: 1, row: 0, action: () => this.randomSummon() },
      { id: 'merge', col: 0, row: 1, action: () => this.reportAutoMerge() },
      { id: 'remove', col: 1, row: 1, action: () => this.toggleRemoveMode() },
    ];

    this.actionButtons = defs.map((def) => {
      const x = centerX - totalWidth / 2 + w / 2 + def.col * (w + gap);
      const y = topY + rowHeight / 2 + def.row * (rowHeight + gap);
      const bg = scene.add.graphics();
      const text = scene.add
        .text(x, y, '', { fontFamily: TITLE_FONT, fontSize: `${px(12.5)}px`, fontStyle: 'bold', align: 'center' })
        .setOrigin(0.5);
      scene.add
        .zone(x, y, w, rowHeight)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          scene.tweens.add({ targets: text, scale: 0.88, duration: 60, yoyo: true, ease: 'Quad.Out' });
          def.action();
        });
      return { id: def.id, bg, text, x, y, w, h: rowHeight };
    });

    this.refreshActionBar();
  }

  private reportAutoMerge(): void {
    const { cellSize } = this.host.geometry();
    const merges = this.autoMerge();
    if (merges === 0) {
      const button = this.actionButtons.find((b) => b.id === 'merge');
      if (button) this.host.floatText(button.x, button.y - cellSize * 0.6, '합성할 유닛이 없어요', '#9a917d');
    }
  }

  // 마나·유닛 수가 바뀔 때마다 버튼 글씨와 색을 갱신한다.
  refreshActionBar(): void {
    const affordable = this.canSummon();
    const full = !this.hasEmptyCell();
    const pairs = this.mergeablePairCount();

    this.actionButtons.forEach((button) => {
      if (!button.text.active) return;
      let label = '';
      let enabled = false;
      let highlight = false;

      switch (button.id) {
        case 'summon':
          if (this.pendingSummon) {
            label = '놓을 칸 선택\n(누르면 취소)';
            enabled = true;
            highlight = true;
          } else {
            label = full ? '칸이 가득 찼어요' : `소환 (칸 선택)\n${this.summonCostText()}`;
            enabled = affordable;
          }
          break;
        case 'random':
          label = full ? '칸이 가득 찼어요' : `랜덤 소환\n${this.summonCostText()}`;
          enabled = affordable && !this.pendingSummon;
          break;
        case 'merge':
          label = pairs > 0 ? `자동 합성\n${pairs}쌍 가능` : '자동 합성\n(가능한 쌍 없음)';
          enabled = pairs > 0 && !this.pendingSummon;
          break;
        case 'remove':
          if (this.removeMode) {
            label = '제거할 유닛 선택\n(누르면 취소)';
            enabled = true;
            highlight = true;
          } else {
            label = full ? '유닛 제거\n(칸이 가득 참)' : '유닛 제거';
            enabled = this.placedUnits.size > 0;
          }
          break;
      }

      const border = highlight ? 0xff9a6a : enabled ? 0xd4b36a : 0x555555;
      button.bg.clear();
      button.bg.fillStyle(0x151a28, enabled ? 0.95 : 0.5);
      button.bg.fillRoundedRect(button.x - button.w / 2, button.y - button.h / 2, button.w, button.h, px(9));
      button.bg.lineStyle(px(2), border, 0.9);
      button.bg.strokeRoundedRect(button.x - button.w / 2, button.y - button.h / 2, button.w, button.h, px(9));
      button.text.setText(label);
      button.text.setColor(enabled ? '#f6e6b4' : '#8a8272');
    });
  }
}
