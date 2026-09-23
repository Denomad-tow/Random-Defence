import Phaser from 'phaser';
import { NORMAL_UNITS, DECK_SIZE, type UnitDef } from '../core/units';
import { RARITIES } from '../core/graphics/gem';
import { ROLE_SIGILS } from '../core/graphics/sigils';
import { createGemTexture } from '../core/graphics/texture';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
const NORMAL_RARITY = RARITIES.find((r) => r.key === 'normal')!;

interface CardRef {
  ring: Phaser.GameObjects.Arc;
}

export class DeckSelectScene extends Phaser.Scene {
  private selected = new Set<string>();
  private cardRefs = new Map<string, CardRef>();
  private countText!: Phaser.GameObjects.Text;
  private startButtonText!: Phaser.GameObjects.Text;

  constructor() {
    super('deck-select');
  }

  create(): void {
    this.selected = new Set();
    this.layout();
    this.scale.on('resize', () => this.layout());
  }

  private layout(): void {
    this.children.removeAll(true);
    this.cardRefs = new Map();

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#07080d');

    this.add
      .text(width / 2, height * 0.08, '덱을 선택하세요', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(24)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.13, `이번 판에서 소환할 유닛 ${DECK_SIZE}종을 고르세요`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);

    const cols = 4;
    const rows = Math.ceil(NORMAL_UNITS.length / cols);
    const cardSize = Math.min(width / (cols + 1), (height * 0.5) / rows);
    const gap = cardSize * 0.3;
    const gridWidth = cardSize * cols + gap * (cols - 1);
    const startX = width / 2 - gridWidth / 2 + cardSize / 2;
    const startY = height * 0.28;

    NORMAL_UNITS.forEach((unit, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardSize + gap);
      const y = startY + row * (cardSize + gap * 1.6);
      this.drawCard(unit, x, y, cardSize);
    });

    this.countText = this.add
      .text(width / 2, height * 0.72, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#f6e6b4',
      })
      .setOrigin(0.5);

    const buttonWidth = Math.min(cardSize * 3.4, width * 0.65);
    const buttonHeight = cardSize * 0.8;
    const buttonY = height * 0.85;

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
    createGemTexture(this, key, NORMAL_RARITY, sigil, 1, textureSize);

    const ring = this.add.circle(x, y, size * 0.56);
    ring.setStrokeStyle(px(3), 0xffd98a, 0);

    this.add
      .image(x, y, key)
      .setDisplaySize(size * 0.86, size * 0.86)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.toggleUnit(unit.id));

    this.add
      .text(x, y + size * 0.62, unit.name, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
        color: '#c9c2af',
      })
      .setOrigin(0.5);

    this.cardRefs.set(unit.id, { ring });
    this.updateCardVisual(unit.id);
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
    this.countText.setText(`선택 ${this.selected.size}/${DECK_SIZE}`);
    const ready = this.selected.size === DECK_SIZE;
    this.startButtonText.setText(ready ? '시작' : `${DECK_SIZE}종을 골라주세요`);
  }

  private tryStart(): void {
    if (this.selected.size !== DECK_SIZE) return;
    this.scene.start('game', { deck: Array.from(this.selected) });
  }
}
