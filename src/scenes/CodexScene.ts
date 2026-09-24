import Phaser from 'phaser';
import { NORMAL_UNITS, ROLE_DESCRIPTIONS, ROLE_CATEGORIES, type UnitDef } from '../core/units';
import { RARITIES, getRarity } from '../core/graphics/gem';
import { ROLE_SIGILS } from '../core/graphics/sigils';
import { createGemTexture } from '../core/graphics/texture';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
const COLS = 3;

const CATEGORY_COLORS: Record<string, string> = {
  공격형: '#ff9a9a',
  제어형: '#9fd8ff',
  버프형: '#ffd98a',
  자원형: '#a8ffb0',
};

export class CodexScene extends Phaser.Scene {
  private currentRarity = 'normal';

  constructor() {
    super('codex');
  }

  create(): void {
    this.layout();
    this.scale.on('resize', () => this.layout());
  }

  private unitsForRarity(): UnitDef[] {
    return NORMAL_UNITS.filter((u) => u.rarity === this.currentRarity);
  }

  private layout(): void {
    this.children.removeAll(true);

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#07080d');

    this.add
      .text(width / 2, height * 0.05, '도감', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(24)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(px(12), height * 0.05, '← 뒤로', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#9a917d',
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .setPadding(px(8), px(8), px(8), px(8))
      .on('pointerdown', () => this.scene.start('deck-select', { forceEdit: true }));

    this.drawRarityTabs(width, height * 0.11);

    const gridTop = height * 0.17;
    const rows = Math.ceil(15 / COLS);
    const gridHeight = height * 0.97 - gridTop;
    const rowHeight = gridHeight / rows;
    const colWidth = width / COLS;

    this.unitsForRarity().forEach((unit, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const y = gridTop + row * rowHeight + rowHeight / 2;
      this.drawUnitCard(unit, col * colWidth, colWidth, y, rowHeight);
    });
  }

  private drawRarityTabs(width: number, y: number): void {
    const gap = width * 0.015;
    const tabWidth = (width * 0.96 - gap * (RARITIES.length - 1)) / RARITIES.length;

    RARITIES.forEach((rarity, i) => {
      const x = width * 0.02 + tabWidth / 2 + i * (tabWidth + gap);
      const active = rarity.key === this.currentRarity;

      const bg = this.add.graphics();
      bg.fillStyle(active ? 0x2a2416 : 0x151a28, active ? 1 : 0.85);
      bg.fillRoundedRect(x - tabWidth / 2, y - px(14), tabWidth, px(28), px(7));
      bg.lineStyle(px(1.5), active ? 0xd4b36a : 0x3a3a3a, 1);
      bg.strokeRoundedRect(x - tabWidth / 2, y - px(14), tabWidth, px(28), px(7));

      this.add
        .text(x, y, rarity.label, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(11)}px`,
          color: active ? '#ffd98a' : '#8a8272',
          fontStyle: active ? 'bold' : 'normal',
        })
        .setOrigin(0.5);

      this.add
        .zone(x, y, tabWidth, px(28))
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (this.currentRarity === rarity.key) return;
          this.currentRarity = rarity.key;
          this.layout();
        });
    });
  }

  private drawUnitCard(unit: UnitDef, x0: number, colWidth: number, y: number, rowHeight: number): void {
    const pad = colWidth * 0.04;
    const cardX = x0 + pad;
    const cardW = colWidth - pad * 2;
    const cardTop = y - rowHeight * 0.46;
    const cardH = rowHeight * 0.92;
    const cx = cardX + cardW / 2;
    const innerPad = cardH * 0.05;

    const bg = this.add.graphics();
    bg.fillStyle(0x151a28, 0.85);
    bg.fillRoundedRect(cardX, cardTop, cardW, cardH, px(8));
    bg.lineStyle(px(1), 0xd4b36a, 0.4);
    bg.strokeRoundedRect(cardX, cardTop, cardW, cardH, px(8));

    const iconSize = Math.min(cardW * 0.44, cardH * 0.3);
    const iconY = cardTop + innerPad + iconSize / 2;
    const sigil = ROLE_SIGILS[unit.role];
    const key = `codexicon-${unit.id}-${Math.round(iconSize)}`;
    createGemTexture(this, key, getRarity(unit.rarity), sigil, 1, Math.round(iconSize));
    this.add.image(cx, iconY, key).setDisplaySize(iconSize, iconSize);

    const nameFontSize = 9;
    const smallFontSize = 7;
    const textWrapWidth = cardW * 0.92;

    const category = ROLE_CATEGORIES[unit.role] ?? '';
    const categoryColor = CATEGORY_COLORS[category] ?? '#9a917d';

    const nameTop = iconY + iconSize / 2 + innerPad * 0.6;
    const nameText = this.add
      .text(cx, nameTop, `${sigil?.label ?? unit.role}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(nameFontSize)}px`,
        color: '#f0e9d8',
        align: 'center',
        wordWrap: { width: textWrapWidth },
      })
      .setOrigin(0.5, 0);

    const categoryTop = nameTop + nameText.height + innerPad * 0.3;
    const categoryText = this.add
      .text(cx, categoryTop, category, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(smallFontSize)}px`,
        color: categoryColor,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    const descTop = categoryTop + categoryText.height + innerPad * 0.2;
    const descText = this.add
      .text(cx, descTop, ROLE_DESCRIPTIONS[unit.role] ?? '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(smallFontSize)}px`,
        color: '#9fd8ff',
        align: 'center',
        wordWrap: { width: textWrapWidth },
      })
      .setOrigin(0.5, 0);

    const statsTop = descTop + descText.height + innerPad * 0.4;
    const statsLine = `공격 ${unit.attack} · 속도 ${unit.attackSpeed} · 사거리 ${unit.range}`;
    this.add
      .text(cx, statsTop, statsLine, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(smallFontSize)}px`,
        color: '#9a917d',
        align: 'center',
        wordWrap: { width: textWrapWidth },
      })
      .setOrigin(0.5, 0);
  }
}
