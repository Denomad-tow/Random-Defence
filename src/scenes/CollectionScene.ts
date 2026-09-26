import Phaser from 'phaser';
import { NORMAL_UNITS, ROLE_DESCRIPTIONS, type UnitDef } from '../core/units';
import { getRarity } from '../core/graphics/gem';
import { ROLE_SIGILS } from '../core/graphics/sigils';
import { createGemTexture } from '../core/graphics/texture';
import { loadCollection, consumeDuplicates } from '../meta/collection';
import { loadGold, spendGold } from '../meta/gold';
import { getUnitLevel, setUnitLevel, levelUpCost, availableDuplicates, MAX_UNIT_LEVEL } from '../meta/levels';
import { sortByRarityThenLevel } from '../meta/unitSort';
import { px, capPx } from '../core/dpr';
import { showInfoModal } from '../core/infoModal';
import { unitLevelInfo } from '../core/levelInfo';

const TITLE_FONT = '"Noto Serif KR", serif';
const ROWS_PER_PAGE = 5;
const COLS = 3;

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
    const cardTop = y - rowHeight * 0.42;
    const cardH = rowHeight * 0.84;

    const cardBg = this.add.graphics();
    cardBg.fillStyle(0x151a28, 0.85);
    cardBg.fillRoundedRect(cardX, cardTop, cardW, cardH, px(8));
    cardBg.lineStyle(px(1), 0xd4b36a, 0.4);
    cardBg.strokeRoundedRect(cardX, cardTop, cardW, cardH, px(8));

    // 카드를 누르면 "레벨업하면 뭐가 좋아지는지" 안내 팝업(레벨업 버튼은 이 위에 겹쳐 있어 따로 눌린다).
    this.add
      .zone(cardX + cardW / 2, cardTop + cardH / 2, cardW, cardH)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () =>
        showInfoModal(this, unitLevelInfo(unit, getUnitLevel(unit.id), this.ownedCounts.get(unit.id) ?? 0)),
      );

    // Balanced 3-part layout: icon (left) / name+trait+level (center) /
    // level-up button (right). Icon and button are vertically centered on
    // the card; the text block is stacked using *measured* heights so a
    // 2-line name never overlaps the lines below it.
    const innerPad = cardW * 0.04;
    const iconAreaWidth = cardW * 0.3;
    const buttonAreaWidth = cardW * 0.34;
    const textAreaWidth = cardW - iconAreaWidth - buttonAreaWidth;
    const buttonWidth = buttonAreaWidth * 0.88;
    const buttonHeight = cardH * 0.6;

    // 레벨업 버튼 글씨는 버튼 크기 기준 그대로 두고, 이름/특성/레벨 설명
    // 글씨는 도감 화면과 동일하게 2배 확대해 가독성을 높인다.
    const labelFontSize = capPx(Math.max(9, Math.round(buttonWidth * 0.13)), 12);
    const costFontSize = capPx(Math.max(8, Math.round(buttonWidth * 0.1)), 10);
    const nameFontSize = capPx(labelFontSize * 2, 15);
    const traitFontSize = capPx(costFontSize * 2, 13);

    const iconSize = Math.min(iconAreaWidth * 0.85, cardH * 0.78);
    const iconX = cardX + iconAreaWidth / 2;
    const sigil = ROLE_SIGILS[unit.role];
    const key = `collicon-${unit.id}-${Math.round(iconSize)}`;
    createGemTexture(this, key, getRarity(unit.rarity), sigil, 1, Math.round(iconSize));
    this.add.image(iconX, y, key).setDisplaySize(iconSize, iconSize);

    const count = this.ownedCounts.get(unit.id) ?? 0;
    const level = getUnitLevel(unit.id);
    const textCx = cardX + iconAreaWidth + textAreaWidth / 2;
    const textWrapWidth = textAreaWidth - innerPad;

    const nameTop = cardTop + cardH * 0.1;
    const nameText = this.add
      .text(textCx, nameTop, unit.name, {
        fontFamily: TITLE_FONT,
        fontSize: `${nameFontSize}px`,
        color: '#f0e9d8',
        align: 'center',
        wordWrap: { width: textWrapWidth },
        lineSpacing: px(1),
      })
      .setOrigin(0.5, 0);

    // Trait/level text matches the level-up button's cost-line size, per
    // user request, so they read consistently at any screen width.
    const traitTop = nameTop + nameText.height + cardH * 0.04;
    const traitText = this.add
      .text(textCx, traitTop, ROLE_DESCRIPTIONS[unit.role] ?? '', {
        fontFamily: TITLE_FONT,
        fontSize: `${traitFontSize}px`,
        color: '#9fd8ff',
        align: 'center',
        wordWrap: { width: textWrapWidth },
      })
      .setOrigin(0.5, 0);

    const subTop = traitTop + traitText.height + cardH * 0.04;
    this.add
      .text(textCx, subTop, `Lv.${level} · ${count}개`, {
        fontFamily: TITLE_FONT,
        fontSize: `${traitFontSize}px`,
        color: '#9a917d',
        align: 'center',
        wordWrap: { width: textWrapWidth },
      })
      .setOrigin(0.5, 0);

    const buttonX = cardX + cardW - buttonAreaWidth / 2;
    this.drawLevelUpButton(unit, count, level, buttonX, y, buttonWidth, buttonHeight, labelFontSize, costFontSize);
  }

  private drawLevelUpButton(
    unit: UnitDef,
    count: number,
    level: number,
    x: number,
    y: number,
    buttonWidth: number,
    buttonHeight: number,
    labelFontSize: number,
    costFontSize: number,
  ): void {
    if (level >= MAX_UNIT_LEVEL) {
      this.add
        .text(x, y, 'MAX', {
          fontFamily: TITLE_FONT,
          fontSize: `${labelFontSize}px`,
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
        fontSize: `${labelFontSize}px`,
        color: canAfford ? '#ffd98a' : '#8a8272',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(x, y + buttonHeight * 0.34, `중복${cost.duplicates}·골드${cost.gold}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${costFontSize * 1.5}px`,
        color: canAfford ? '#ffe9b0' : '#b0a480',
        align: 'center',
        wordWrap: { width: buttonWidth * 0.95 },
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
    this.goldText?.setText(`골드 ${loadGold()}  ·  카드를 눌러 효과 보기`);
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
