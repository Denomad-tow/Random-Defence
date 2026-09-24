import Phaser from 'phaser';
import { NORMAL_UNITS, type UnitDef } from '../core/units';
import { getRarity } from '../core/graphics/gem';
import { ROLE_SIGILS } from '../core/graphics/sigils';
import { createGemTexture } from '../core/graphics/texture';
import { loadCollection, consumeDuplicates } from '../meta/collection';
import { loadGold, spendGold } from '../meta/gold';
import { getUnitLevel, setUnitLevel, levelUpCost, availableDuplicates, MAX_UNIT_LEVEL } from '../meta/levels';
import { sortByRarityThenLevel } from '../meta/unitSort';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
const ROWS_PER_PAGE = 5;
const COLS = 4;

export class CollectionScene extends Phaser.Scene {
  private page = 0;
  private ownedCounts = new Map<string, number>();
  private goldText!: Phaser.GameObjects.Text;

  constructor() {
    super('collection');
  }

  create(): void {
    this.page = 0;
    this.rebuildOwnedCounts();
    this.layout();
    this.scale.on('resize', () => this.layout());
  }

  private rebuildOwnedCounts(): void {
    this.ownedCounts = new Map();
    loadCollection().forEach((id) => {
      this.ownedCounts.set(id, (this.ownedCounts.get(id) ?? 0) + 1);
    });
  }

  private ownedUnits(): UnitDef[] {
    return sortByRarityThenLevel(NORMAL_UNITS.filter((u) => this.ownedCounts.has(u.id)));
  }

  private layout(): void {
    this.children.removeAll(true);

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#07080d');

    this.add
      .text(width / 2, height * 0.055, '컬렉션', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(22)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.goldText = this.add
      .text(width / 2, height * 0.095, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(12)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);
    this.refreshGold();

    this.add
      .text(px(12), height * 0.055, '← 뒤로', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#9a917d',
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .setPadding(px(8), px(8), px(8), px(8))
      .on('pointerdown', () => this.scene.start('deck-select', { forceEdit: true }));

    const owned = this.ownedUnits();
    const itemsPerPage = COLS * ROWS_PER_PAGE;
    const totalPages = Math.max(1, Math.ceil(owned.length / itemsPerPage));
    this.page = Phaser.Math.Clamp(this.page, 0, totalPages - 1);
    const pageItems = owned.slice(this.page * itemsPerPage, (this.page + 1) * itemsPerPage);

    const listTop = height * 0.14;
    const rowHeight = (height * 0.72) / ROWS_PER_PAGE;
    const colWidth = width / COLS;

    pageItems.forEach((unit, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      this.drawCard(unit, col * colWidth, colWidth, listTop + row * rowHeight + rowHeight / 2, rowHeight);
    });

    this.drawPagination(width, height, totalPages);
  }

  private drawCard(unit: UnitDef, x0: number, colWidth: number, y: number, rowHeight: number): void {
    const pad = colWidth * 0.05;
    const cardX = x0 + pad;
    const cardW = colWidth - pad * 2;
    const cardTop = y - rowHeight * 0.46;
    const cardH = rowHeight * 0.92;
    const cx = cardX + cardW / 2;
    const innerPad = cardH * 0.06;

    const cardBg = this.add.graphics();
    cardBg.fillStyle(0x151a28, 0.85);
    cardBg.fillRoundedRect(cardX, cardTop, cardW, cardH, px(6));
    cardBg.lineStyle(px(1), 0xd4b36a, 0.4);
    cardBg.strokeRoundedRect(cardX, cardTop, cardW, cardH, px(6));

    // Level-up button is anchored to the bottom of the card (fixed height);
    // icon/name/level are stacked top-down using each text's *measured*
    // height, so a 2-line name can never overlap the line below it.
    const buttonHeight = cardH * 0.24;
    const buttonY = cardTop + cardH - buttonHeight / 2 - innerPad * 0.4;

    const iconSize = Math.min(cardW * 0.5, cardH * 0.24);
    const iconY = cardTop + innerPad + iconSize / 2;
    const sigil = ROLE_SIGILS[unit.role];
    const key = `collicon-${unit.id}-${Math.round(iconSize)}`;
    createGemTexture(this, key, getRarity(unit.rarity), sigil, 1, Math.round(iconSize));
    this.add.image(cx, iconY, key).setDisplaySize(iconSize * 0.92, iconSize * 0.92);

    const count = this.ownedCounts.get(unit.id) ?? 0;
    const level = getUnitLevel(unit.id);

    const nameTop = iconY + iconSize / 2 + innerPad * 0.5;
    const nameText = this.add
      .text(cx, nameTop, unit.name, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(8)}px`,
        color: '#f0e9d8',
        align: 'center',
        wordWrap: { width: cardW * 0.94 },
        lineSpacing: px(1),
      })
      .setOrigin(0.5, 0);

    const subTop = nameTop + nameText.height + innerPad * 0.3;
    this.add
      .text(cx, subTop, `Lv.${level} · ${count}개`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(7)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5, 0);

    this.drawLevelUpButton(unit, count, level, cx, buttonY, cardW * 0.9, buttonHeight);
  }

  private drawLevelUpButton(
    unit: UnitDef,
    count: number,
    level: number,
    x: number,
    y: number,
    buttonWidth: number,
    buttonHeight: number,
  ): void {
    const labelFontSize = Math.max(7.5, Math.round(buttonWidth * 0.14));
    const costFontSize = Math.max(6, Math.round(buttonWidth * 0.1));

    if (level >= MAX_UNIT_LEVEL) {
      this.add
        .text(x, y, 'MAX', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(labelFontSize)}px`,
          color: '#6a6458',
        })
        .setOrigin(0.5);
      return;
    }

    const cost = levelUpCost(level);
    const available = availableDuplicates(count);
    const gold = loadGold();
    const canAfford = available >= cost.duplicates && gold >= cost.gold;

    const bg = this.add.graphics();
    bg.fillStyle(0x1f2536, canAfford ? 1 : 0.5);
    bg.fillRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, px(6));
    bg.lineStyle(px(1.5), canAfford ? 0xd4b36a : 0x555555, 0.9);
    bg.strokeRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, px(6));

    this.add
      .text(x, y - buttonHeight * 0.18, '레벨업', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(labelFontSize)}px`,
        color: canAfford ? '#ffd98a' : '#8a8272',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(x, y + buttonHeight * 0.3, `중복${cost.duplicates}·골드${cost.gold}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(costFontSize)}px`,
        color: '#8a8272',
      })
      .setOrigin(0.5);

    this.add
      .zone(x, y, buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.tryLevelUp(unit));
  }

  private tryLevelUp(unit: UnitDef): void {
    const level = getUnitLevel(unit.id);
    if (level >= MAX_UNIT_LEVEL) return;

    const cost = levelUpCost(level);
    const count = this.ownedCounts.get(unit.id) ?? 0;
    const available = availableDuplicates(count);

    if (available < cost.duplicates) {
      this.showToast(`중복 카드 부족 (${available}/${cost.duplicates})`);
      return;
    }

    if (!spendGold(cost.gold)) {
      this.showToast('골드 부족');
      return;
    }

    consumeDuplicates(unit.id, cost.duplicates);
    setUnitLevel(unit.id, level + 1);
    this.rebuildOwnedCounts();
    this.layout();
    this.showToast(`${unit.name} Lv.${level + 1}!`);
  }

  private drawPagination(width: number, height: number, totalPages: number): void {
    const y = height * 0.92;
    const gapX = width * 0.22;
    const btnRadius = px(18);

    const drawArrowButton = (x: number, symbol: string, enabled: boolean, onClick: () => void) => {
      const bg = this.add.graphics();
      bg.fillStyle(0x1f2536, enabled ? 1 : 0.5);
      bg.fillCircle(x, y, btnRadius);
      bg.lineStyle(px(1.5), enabled ? 0xd4b36a : 0x555555, 0.9);
      bg.strokeCircle(x, y, btnRadius);

      this.add
        .text(x, y, symbol, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(20)}px`,
          color: enabled ? '#ffd98a' : '#5a5a5a',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      this.add
        .zone(x, y, btnRadius * 2.6, btnRadius * 2.6)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (enabled) onClick();
        });
    };

    drawArrowButton(width / 2 - gapX, '◀', this.page > 0, () => {
      this.page -= 1;
      this.layout();
    });

    this.add
      .text(width / 2, y, `${this.page + 1} / ${totalPages}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#f6e6b4',
      })
      .setOrigin(0.5);

    drawArrowButton(width / 2 + gapX, '▶', this.page < totalPages - 1, () => {
      this.page += 1;
      this.layout();
    });
  }

  private refreshGold(): void {
    this.goldText?.setText(`골드 ${loadGold()}`);
  }

  private showToast(message: string): void {
    const { width, height } = this.scale;
    const toast = this.add
      .text(width / 2, height * 0.85, message, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#ffe9b0',
      })
      .setOrigin(0.5)
      .setDepth(500);

    this.tweens.add({
      targets: toast,
      y: toast.y - px(20),
      alpha: 0,
      duration: 1100,
      delay: 400,
      onComplete: () => toast.destroy(),
    });
  }
}
