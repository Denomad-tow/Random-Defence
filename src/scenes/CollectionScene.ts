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
const ROWS_PER_PAGE = 6;
const COLS = 2;

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
    const pad = colWidth * 0.04;
    const cardX = x0 + pad;
    const cardW = colWidth - pad * 2;

    const cardBg = this.add.graphics();
    cardBg.fillStyle(0x151a28, 0.85);
    cardBg.fillRoundedRect(cardX, y - rowHeight * 0.44, cardW, rowHeight * 0.88, px(8));
    cardBg.lineStyle(px(1), 0xd4b36a, 0.4);
    cardBg.strokeRoundedRect(cardX, y - rowHeight * 0.44, cardW, rowHeight * 0.88, px(8));

    const iconSize = rowHeight * 0.5;
    const iconX = cardX + iconSize * 0.6;
    const iconY = y - rowHeight * 0.16;
    const sigil = ROLE_SIGILS[unit.role];
    const key = `collicon-${unit.id}-${Math.round(iconSize)}`;
    createGemTexture(this, key, getRarity(unit.rarity), sigil, 1, Math.round(iconSize));
    this.add.image(iconX, iconY, key).setDisplaySize(iconSize * 0.9, iconSize * 0.9);

    const count = this.ownedCounts.get(unit.id) ?? 0;
    const level = getUnitLevel(unit.id);
    const textX = cardX + iconSize * 1.25;
    const textWrapWidth = cardX + cardW - textX - pad * 0.5;

    this.add
      .text(textX, y - rowHeight * 0.26, unit.name, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
        color: '#f0e9d8',
        wordWrap: { width: textWrapWidth },
      })
      .setOrigin(0, 0.5);

    this.add
      .text(textX, y - rowHeight * 0.04, `Lv.${level} · 보유 ${count}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(9)}px`,
        color: '#9a917d',
        wordWrap: { width: textWrapWidth },
      })
      .setOrigin(0, 0.5);

    this.drawLevelUpButton(unit, count, level, cardX + cardW / 2, y + rowHeight * 0.27, cardW * 0.92, rowHeight * 0.3);
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
    if (level >= MAX_UNIT_LEVEL) {
      this.add
        .text(x, y, 'MAX', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(12)}px`,
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
      .text(x, y - buttonHeight * 0.15, '레벨업', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
        color: canAfford ? '#ffd98a' : '#8a8272',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(x, y + buttonHeight * 0.28, `중복 ${cost.duplicates} · 골드 ${cost.gold}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(8.5)}px`,
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

    this.add
      .text(width / 2 - width * 0.2, y, '◀', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(16)}px`,
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
        fontSize: `${px(13)}px`,
        color: '#f6e6b4',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2 + width * 0.2, y, '▶', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(16)}px`,
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
