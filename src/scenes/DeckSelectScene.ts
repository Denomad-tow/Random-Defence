import Phaser from 'phaser';
import { OBTAINABLE_UNITS, DECK_SIZE, pickRandomUnit, type UnitDef } from '../core/units';
import { getRarity } from '../core/graphics/gem';
import { ROLE_SIGILS } from '../core/graphics/sigils';
import { createGemTexture } from '../core/graphics/texture';
import { loadSavedDeck, saveDeck } from '../meta/deck';
import { ensureStarterCollection, addToCollection } from '../meta/collection';
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

  constructor() {
    super('deck-select');
  }

  init(data: { forceEdit?: boolean }): void {
    this.forceEdit = !!data?.forceEdit;
  }

  create(): void {
    const collection = ensureStarterCollection(OBTAINABLE_UNITS);
    this.rebuildOwnedCounts(collection);

    const saved = loadSavedDeck();
    const validSaved = saved?.filter((id) => this.ownedCounts.has(id)) ?? [];

    if (!this.forceEdit && validSaved.length === DECK_SIZE) {
      this.scene.start('game', { deck: validSaved });
      return;
    }

    this.selected = new Set(validSaved.slice(0, DECK_SIZE));
    this.layout();
    this.scale.on('resize', () => this.layout());
  }

  private rebuildOwnedCounts(collection: string[]): void {
    this.ownedCounts = new Map();
    collection.forEach((id) => {
      this.ownedCounts.set(id, (this.ownedCounts.get(id) ?? 0) + 1);
    });
  }

  private ownedUnits(): UnitDef[] {
    return OBTAINABLE_UNITS.filter((u) => this.ownedCounts.has(u.id));
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

    this.add
      .text(width / 2, height * 0.085, `보유한 유닛 중 ${DECK_SIZE}종을 고르세요`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(12)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);

    const gachaButton = this.add
      .text(width - px(12), height * 0.045, '뽑기', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#ffd98a',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.drawGacha());
    gachaButton.setPadding(px(8), px(8), px(8), px(8));

    const owned = this.ownedUnits();
    const cols = 4;
    const rows = Math.max(1, Math.ceil(owned.length / cols));

    // Fixed, cardSize-independent geometry for the bottom UI so the card
    // grid can never grow into it, regardless of screen aspect ratio.
    const buttonWidth = Math.min(width * 0.65, height * 0.5);
    const buttonHeight = height * 0.075;
    const buttonY = height * 0.94;
    const countY = buttonY - buttonHeight / 2 - height * 0.035;

    const gridTop = height * 0.15;
    const gridBottom = countY - height * 0.04;
    const availableGridHeight = Math.max(gridBottom - gridTop, height * 0.1);

    const rowSpacingFactor = 1.6;
    const lastRowExtra = 1.25;
    const cardSizeByHeight = availableGridHeight / (rowSpacingFactor * (rows - 1) + lastRowExtra);
    const cardSizeByWidth = width / (cols + 1);
    const cardSize = Math.min(cardSizeByWidth, cardSizeByHeight);

    const gap = cardSize * 0.3;
    const gridWidth = cardSize * cols + gap * (cols - 1);
    const startX = width / 2 - gridWidth / 2 + cardSize / 2;
    const startY = gridTop + cardSize / 2;

    owned.forEach((unit, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardSize + gap);
      const y = startY + row * (cardSize * rowSpacingFactor);
      this.drawCard(unit, x, y, cardSize);
    });

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

  private drawGacha(): void {
    const drawn = pickRandomUnit(OBTAINABLE_UNITS);
    const collection = addToCollection(drawn.id);
    this.rebuildOwnedCounts(collection);
    this.layout();

    const { width, height } = this.scale;
    const isNew = (this.ownedCounts.get(drawn.id) ?? 0) === 1;
    const message = isNew ? `새 유닛 획득! ${drawn.name}` : `${drawn.name} 획득 (중복)`;

    const popup = this.add
      .text(width / 2, height * 0.19, message, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#ffe9b0',
      })
      .setOrigin(0.5)
      .setDepth(500);

    this.tweens.add({
      targets: popup,
      y: popup.y - px(24),
      alpha: 0,
      duration: 1300,
      delay: 400,
      onComplete: () => popup.destroy(),
    });
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
    saveDeck(deck);
    this.scene.start('game', { deck });
  }
}
