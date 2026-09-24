import Phaser from 'phaser';
import { NORMAL_UNITS, OBTAINABLE_UNITS, DECK_SIZE, type UnitDef } from '../core/units';
import { getRarity } from '../core/graphics/gem';
import { ROLE_SIGILS } from '../core/graphics/sigils';
import { createGemTexture } from '../core/graphics/texture';
import { loadDeckSlot, saveDeckSlot, loadActiveSlot, saveActiveSlot, DECK_SLOT_COUNT } from '../meta/deck';
import { ensureStarterCollection, loadCollection, saveCollection } from '../meta/collection';
import { loadGold } from '../meta/gold';
import { loadBoxes } from '../meta/boxes';
import { sortByRarityThenLevel } from '../meta/unitSort';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';

interface CardRef {
  ring: Phaser.GameObjects.Arc;
}

export class DeckSelectScene extends Phaser.Scene {
  private selected = new Set<string>();
  private ownedCounts = new Map<string, number>();
  private cardRefs = new Map<string, CardRef>();
  private countText!: Phaser.GameObjects.Text;
  private startButtonText!: Phaser.GameObjects.Text;
  private forceEdit = false;
  private activeSlot = 0;
  private page = 0;

  constructor() {
    super('deck-select');
  }

  init(data: { forceEdit?: boolean }): void {
    this.forceEdit = !!data?.forceEdit;
  }

  create(): void {
    this.page = 0;
    const collection = ensureStarterCollection(OBTAINABLE_UNITS);
    this.rebuildOwnedCounts(collection);

    this.activeSlot = loadActiveSlot();
    const saved = loadDeckSlot(this.activeSlot);
    const validSaved = saved?.filter((id) => this.ownedCounts.has(id)) ?? [];

    if (!this.forceEdit && validSaved.length === DECK_SIZE) {
      this.scene.start('game', { deck: validSaved });
      return;
    }

    this.selected = new Set(validSaved.slice(0, DECK_SIZE));
    this.layout();
    this.scale.on('resize', () => this.layout());
  }

  private switchSlot(index: number): void {
    if (index === this.activeSlot) return;

    this.activeSlot = index;
    saveActiveSlot(index);

    const saved = loadDeckSlot(index)?.filter((id) => this.ownedCounts.has(id)) ?? [];
    this.selected = new Set(saved.slice(0, DECK_SIZE));
    this.layout();
  }

  private rebuildOwnedCounts(collection: string[]): void {
    this.ownedCounts = new Map();
    collection.forEach((id) => {
      this.ownedCounts.set(id, (this.ownedCounts.get(id) ?? 0) + 1);
    });
  }

  private ownedUnits(): UnitDef[] {
    return sortByRarityThenLevel(NORMAL_UNITS.filter((u) => this.ownedCounts.has(u.id)));
  }

  private layout(): void {
    this.children.removeAll(true);
    this.cardRefs = new Map();

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#07080d');

    this.add
      .text(width / 2, height * 0.045, '덱을 선택하세요', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(22)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const boxes = loadBoxes();
    const totalBoxes = Object.values(boxes).reduce((sum, n) => sum + n, 0);

    this.add
      .text(width / 2, height * 0.085, `보유한 유닛 중 ${DECK_SIZE}종을 고르세요 · 골드 ${loadGold()}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(12)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);

    const boxButton = this.add
      .text(width - px(12), height * 0.04, `상자 (${totalBoxes})`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#ffd98a',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('box'));
    boxButton.setPadding(px(8), px(8), px(8), px(8));

    const collectionButton = this.add
      .text(width - px(12), height * 0.09, '컬렉션', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(12)}px`,
        color: '#9fd8ff',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('collection'));
    collectionButton.setPadding(px(8), px(8), px(8), px(8));

    const devButton = this.add
      .text(px(12), height * 0.045, '[개발자] 전체 획득', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(10)}px`,
        color: '#5a5a5a',
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.devUnlockAll());
    devButton.setPadding(px(8), px(8), px(8), px(8));

    this.drawSlotTabs(width, height * 0.13);

    const owned = this.ownedUnits();
    const cols = 6;

    // Fixed, cardSize-independent geometry for the bottom UI so the card
    // grid can never grow into it, regardless of screen aspect ratio.
    const buttonWidth = Math.min(width * 0.65, height * 0.5);
    const buttonHeight = height * 0.075;
    const buttonY = height * 0.94;
    const countY = buttonY - buttonHeight / 2 - height * 0.035;

    const gridTop = height * 0.18;
    const gridBottom = countY - height * 0.04;
    const availableGridHeight = Math.max(gridBottom - gridTop, height * 0.1);

    // Smaller, denser cards than before so most/all owned units fit on one
    // screen; when the collection still overflows, we paginate on top of this.
    const rowSpacingFactor = 1.45;
    const lastRowExtra = 1.1;
    const cardSize = width / (cols + 1.4);
    const rowPitch = cardSize * rowSpacingFactor;
    const rowsPerPage = Math.max(1, Math.floor((availableGridHeight - cardSize * lastRowExtra) / rowPitch) + 1);
    const itemsPerPage = rowsPerPage * cols;

    const totalPages = Math.max(1, Math.ceil(owned.length / itemsPerPage));
    this.page = Phaser.Math.Clamp(this.page, 0, totalPages - 1);
    const pageItems = owned.slice(this.page * itemsPerPage, (this.page + 1) * itemsPerPage);

    const gap = cardSize * 0.22;
    const gridWidth = cardSize * cols + gap * (cols - 1);
    const startX = width / 2 - gridWidth / 2 + cardSize / 2;
    const startY = gridTop + cardSize / 2;

    pageItems.forEach((unit, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardSize + gap);
      const y = startY + row * (cardSize * rowSpacingFactor);
      this.drawCard(unit, x, y, cardSize);
    });

    if (totalPages > 1) {
      this.drawPagination(width, gridBottom + height * 0.02, totalPages);
    }

    this.countText = this.add
      .text(width / 2, countY, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#f6e6b4',
      })
      .setOrigin(0.5);

    const bg = this.add.graphics();
    bg.fillStyle(0x151a28, 0.95);
    bg.fillRoundedRect(width / 2 - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(10));
    bg.lineStyle(px(2), 0xd4b36a, 0.9);
    bg.strokeRoundedRect(width / 2 - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(10));

    this.startButtonText = this.add
      .text(width / 2, buttonY, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(16)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .zone(width / 2, buttonY, buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.tryStart());

    this.refreshSelectionUI();
  }

  private drawCard(unit: UnitDef, x: number, y: number, size: number): void {
    const sigil = ROLE_SIGILS[unit.role];
    const textureSize = Math.round(size);
    const key = `deckcard-${unit.id}-${textureSize}`;
    createGemTexture(this, key, getRarity(unit.rarity), sigil, 1, textureSize);

    const ring = this.add.circle(x, y, size * 0.56);
    ring.setStrokeStyle(px(3), 0xffd98a, 0);

    this.add
      .image(x, y, key)
      .setDisplaySize(size * 0.86, size * 0.86)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.toggleUnit(unit.id));

    const count = this.ownedCounts.get(unit.id) ?? 1;
    const nameLabel = count > 1 ? `${unit.name} ×${count}` : unit.name;
    const labelFontSize = Math.max(8, Math.round(size * 0.19));
    this.add
      .text(x, y + size * 0.62, nameLabel, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(labelFontSize)}px`,
        color: '#c9c2af',
        align: 'center',
        wordWrap: { width: size * 1.2 },
      })
      .setOrigin(0.5);

    this.cardRefs.set(unit.id, { ring });
    this.updateCardVisual(unit.id);
  }

  private drawPagination(width: number, y: number, totalPages: number): void {
    const gapX = width * 0.16;

    this.add
      .text(width / 2 - gapX, y, '◀', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: this.page > 0 ? '#ffd98a' : '#4a4a4a',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setPadding(px(10), px(10), px(10), px(10))
      .on('pointerdown', () => {
        if (this.page > 0) {
          this.page -= 1;
          this.layout();
        }
      });

    this.add
      .text(width / 2, y, `${this.page + 1} / ${totalPages}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2 + gapX, y, '▶', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: this.page < totalPages - 1 ? '#ffd98a' : '#4a4a4a',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setPadding(px(10), px(10), px(10), px(10))
      .on('pointerdown', () => {
        if (this.page < totalPages - 1) {
          this.page += 1;
          this.layout();
        }
      });
  }

  private drawSlotTabs(width: number, y: number): void {
    const tabWidth = Math.min(width * 0.25, 110);
    const gap = tabWidth * 0.15;
    const totalWidth = tabWidth * DECK_SLOT_COUNT + gap * (DECK_SLOT_COUNT - 1);
    const startX = width / 2 - totalWidth / 2 + tabWidth / 2;

    for (let i = 0; i < DECK_SLOT_COUNT; i += 1) {
      const x = startX + i * (tabWidth + gap);
      const active = i === this.activeSlot;

      const bg = this.add.graphics();
      bg.fillStyle(active ? 0x2a2416 : 0x151a28, active ? 1 : 0.85);
      bg.fillRoundedRect(x - tabWidth / 2, y - px(14), tabWidth, px(28), px(8));
      bg.lineStyle(px(1.5), active ? 0xd4b36a : 0x3a3a3a, 1);
      bg.strokeRoundedRect(x - tabWidth / 2, y - px(14), tabWidth, px(28), px(8));

      this.add
        .text(x, y, `덱 ${i + 1}`, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(12)}px`,
          color: active ? '#ffd98a' : '#8a8272',
          fontStyle: active ? 'bold' : 'normal',
        })
        .setOrigin(0.5);

      this.add
        .zone(x, y, tabWidth, px(28))
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.switchSlot(i));
    }
  }

  private devUnlockAll(): void {
    let collection = loadCollection();
    NORMAL_UNITS.forEach((unit) => {
      if (!collection.includes(unit.id)) {
        collection = [...collection, unit.id];
      }
    });
    saveCollection(collection);
    this.rebuildOwnedCounts(collection);
    this.layout();
  }

  private toggleUnit(id: string): void {
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else {
      if (this.selected.size >= DECK_SIZE) return;
      this.selected.add(id);
    }

    this.updateCardVisual(id);
    this.refreshSelectionUI();
  }

  private updateCardVisual(id: string): void {
    const ref = this.cardRefs.get(id);
    if (!ref) return;

    const isSelected = this.selected.has(id);
    ref.ring.setStrokeStyle(px(3), 0xffd98a, isSelected ? 1 : 0);
    ref.ring.setFillStyle(0xffd98a, isSelected ? 0.14 : 0);
  }

  private refreshSelectionUI(): void {
    const target = Math.min(DECK_SIZE, this.ownedUnits().length);
    this.countText.setText(`선택 ${this.selected.size}/${target}`);
    const ready = this.selected.size === target && target > 0;
    this.startButtonText.setText(ready ? '시작' : `${target}종을 골라주세요`);
  }

  private tryStart(): void {
    const target = Math.min(DECK_SIZE, this.ownedUnits().length);
    if (this.selected.size !== target || target === 0) return;

    const deck = Array.from(this.selected);
    saveDeckSlot(this.activeSlot, deck);
    saveActiveSlot(this.activeSlot);
    this.scene.start('game', { deck });
  }
}
