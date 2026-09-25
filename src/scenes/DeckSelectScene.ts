import Phaser from 'phaser';
import { NORMAL_UNITS, OBTAINABLE_UNITS, DECK_SIZE, type UnitDef } from '../core/units';
import { getRarity } from '../core/graphics/gem';
import { ROLE_SIGILS } from '../core/graphics/sigils';
import { createGemTexture } from '../core/graphics/texture';
import { loadDeckSlot, saveDeckSlot, loadActiveSlot, saveActiveSlot, DECK_SLOT_COUNT } from '../meta/deck';
import { ensureStarterCollection } from '../meta/collection';
import { loadGold } from '../meta/gold';
import { loadBoxes } from '../meta/boxes';
import { sortByRarityThenLevel } from '../meta/unitSort';
import { signOut, getCurrentNickname } from '../meta/auth';
import { flushSnapshot } from '../core/cloudSync';
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
  private nickname = '';
  private nicknameText?: Phaser.GameObjects.Text;

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

    void getCurrentNickname().then((nick) => {
      this.nickname = nick ?? '';
      this.nicknameText?.setText(this.nickname ? `${this.nickname}님` : '');
    });
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

    this.nicknameText = this.add
      .text(px(12), px(12), this.nickname ? `${this.nickname}님` : '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(16.5)}px`,
        color: '#9fd8ff',
      })
      .setOrigin(0, 0);

    this.add
      .text(width / 2, height * 0.05, '덱을 선택하세요', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(24)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.093, `보유한 유닛 중 ${DECK_SIZE}종을 고르세요`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(18)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.135, `골드 ${loadGold()}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(22.5)}px`,
        color: '#ffd98a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const boxes = loadBoxes();
    const totalBoxes = Object.values(boxes).reduce((sum, n) => sum + n, 0);

    const navButtons: Array<{ label: string; color: string; onClick: () => void }> = [
      { label: '연구', color: '#a8ffb0', onClick: () => this.scene.start('research') },
      { label: `상자 (${totalBoxes})`, color: '#ffd98a', onClick: () => this.scene.start('box') },
      { label: '컬렉션', color: '#9fd8ff', onClick: () => this.scene.start('collection') },
      { label: '도감', color: '#c9a8ff', onClick: () => this.scene.start('codex') },
      { label: '우편함', color: '#ffb0e0', onClick: () => this.scene.start('mailbox') },
      { label: '파티', color: '#ffcf6b', onClick: () => this.scene.start('party') },
      { label: '순위', color: '#7ef0ff', onClick: () => this.scene.start('ranking') },
      { label: '로그아웃', color: '#ff9a9a', onClick: () => this.handleLogout() },
    ];

    // 버튼이 4열 × 2줄(8개)에 정확히 맞도록 유지한다.
    const navCols = 4;
    const navGap = width * 0.025;
    const navSlotWidth = (width * 0.94 - navGap * (navCols - 1)) / navCols;
    const navSlotHeight = height * 0.05;
    // 버튼(상자) 자체 크기는 기존 대비 70%로 줄이되, 칸 간격(navSlotWidth 기준)은
    // 그대로 둬서 버튼 사이에 여백이 생기도록 한다.
    const navWidth = navSlotWidth * 0.7;
    const navHeight = navSlotHeight * 0.7;
    const navRowGap = height * 0.015;
    const navStartX = width * 0.03 + navSlotWidth / 2;
    const navTop = height * 0.175;

    navButtons.forEach((btn, i) => {
      const col = i % navCols;
      const row = Math.floor(i / navCols);
      const x = navStartX + col * (navSlotWidth + navGap);
      const y = navTop + row * (navSlotHeight + navRowGap);
      this.drawNavButton(x, y, navWidth, navHeight, btn.label, btn.color, btn.onClick);
    });

    this.drawSlotTabs(width, height * 0.32);

    const owned = this.ownedUnits();
    const cols = 8;
    const rowsPerPage = 3;

    // Grid is fixed at exactly 3 rows (per user request); more columns keeps
    // cards small/narrow, and pagination handles anything beyond 3 rows.
    // Card size is width-bound, with a height-based cap only as a safety net
    // for very short screens.
    const rowSpacingFactor = 1.45;
    const lastRowExtra = 1.1;
    const gridTop = height * 0.37;
    const rowsFactor = rowSpacingFactor * (rowsPerPage - 1) + lastRowExtra;
    const cardSizeByWidth = width / (cols + 1.4);
    const cardSizeByHeight = (height * 0.5) / rowsFactor;
    const cardSize = Math.min(cardSizeByWidth, cardSizeByHeight);
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

    // Bottom UI sits right below the (now compact) grid instead of being
    // pinned to the bottom of the screen, so shrinking the grid doesn't
    // leave a big empty gap.
    const gridContentBottom = gridTop + cardSize * rowsFactor;
    let cursorY = gridContentBottom + height * 0.035;

    if (totalPages > 1) {
      this.drawPagination(width, cursorY, totalPages);
      cursorY += height * 0.06;
    }

    const countY = cursorY;
    cursorY += height * 0.07;

    const totalButtonWidth = Math.min(width * 0.82, height * 0.62);
    const buttonHeight = height * 0.075;
    const buttonGap = width * 0.03;
    const saveWidth = totalButtonWidth * 0.34;
    const startWidth = totalButtonWidth - saveWidth - buttonGap;
    const saveX = width / 2 - totalButtonWidth / 2 + saveWidth / 2;
    const startBtnX = width / 2 + totalButtonWidth / 2 - startWidth / 2;
    const buttonY = cursorY;

    this.countText = this.add
      .text(width / 2, countY, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#f6e6b4',
      })
      .setOrigin(0.5);

    const resetWidth = width * 0.2;
    const resetHeight = height * 0.045;
    const resetX = width - px(12) - resetWidth / 2;

    const resetBg = this.add.graphics();
    resetBg.fillStyle(0x2a1616, 0.9);
    resetBg.fillRoundedRect(resetX - resetWidth / 2, countY - resetHeight / 2, resetWidth, resetHeight, px(8));
    resetBg.lineStyle(px(1.5), 0xff9a9a, 0.7);
    resetBg.strokeRoundedRect(resetX - resetWidth / 2, countY - resetHeight / 2, resetWidth, resetHeight, px(8));

    this.add
      .text(resetX, countY, '초기화', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#ff9a9a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .zone(resetX, countY, resetWidth, resetHeight)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.resetSelection());

    const saveBg = this.add.graphics();
    saveBg.fillStyle(0x151a28, 0.95);
    saveBg.fillRoundedRect(saveX - saveWidth / 2, buttonY - buttonHeight / 2, saveWidth, buttonHeight, px(10));
    saveBg.lineStyle(px(2), 0x8fbfff, 0.9);
    saveBg.strokeRoundedRect(saveX - saveWidth / 2, buttonY - buttonHeight / 2, saveWidth, buttonHeight, px(10));

    this.add
      .text(saveX, buttonY, '저장', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(15)}px`,
        color: '#bcdcff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .zone(saveX, buttonY, saveWidth, buttonHeight)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.trySave());

    const bg = this.add.graphics();
    bg.fillStyle(0x151a28, 0.95);
    bg.fillRoundedRect(startBtnX - startWidth / 2, buttonY - buttonHeight / 2, startWidth, buttonHeight, px(10));
    bg.lineStyle(px(2), 0xd4b36a, 0.9);
    bg.strokeRoundedRect(startBtnX - startWidth / 2, buttonY - buttonHeight / 2, startWidth, buttonHeight, px(10));

    this.startButtonText = this.add
      .text(startBtnX, buttonY, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .zone(startBtnX, buttonY, startWidth, buttonHeight)
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
    const gapX = width * 0.2;
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
        color: '#9a917d',
      })
      .setOrigin(0.5);

    drawArrowButton(width / 2 + gapX, '▶', this.page < totalPages - 1, () => {
      this.page += 1;
      this.layout();
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
      bg.fillRoundedRect(x - tabWidth / 2, y - px(21), tabWidth, px(42), px(8));
      bg.lineStyle(px(1.5), active ? 0xd4b36a : 0x3a3a3a, 1);
      bg.strokeRoundedRect(x - tabWidth / 2, y - px(21), tabWidth, px(42), px(8));

      this.add
        .text(x, y, `덱 ${i + 1}`, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(18)}px`,
          color: active ? '#ffd98a' : '#8a8272',
          fontStyle: active ? 'bold' : 'normal',
        })
        .setOrigin(0.5);

      this.add
        .zone(x, y, tabWidth, px(42))
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.switchSlot(i));
    }
  }

  private drawNavButton(
    x: number,
    y: number,
    buttonWidth: number,
    buttonHeight: number,
    label: string,
    color: string,
    onClick: () => void,
  ): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x151a28, 0.95);
    bg.fillRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, px(8));
    bg.lineStyle(px(1.5), Phaser.Display.Color.HexStringToColor(color).color, 0.8);
    bg.strokeRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, px(8));

    const fontSize = Math.max(9, Math.round(buttonWidth * 0.135)) / 2;
    this.add
      .text(x, y, label, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(fontSize)}px`,
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .zone(x, y, buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onClick);
  }

  private handleLogout(): void {
    void flushSnapshot()
      .then(() => signOut())
      .then(() => {
        window.location.reload();
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

  private resetSelection(): void {
    this.selected.clear();
    this.cardRefs.forEach((_, id) => this.updateCardVisual(id));
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

  private trySave(): void {
    const target = Math.min(DECK_SIZE, this.ownedUnits().length);
    if (this.selected.size !== target || target === 0) {
      this.showToast(`${target}종을 모두 골라야 저장할 수 있어요`);
      return;
    }

    const deck = Array.from(this.selected);
    saveDeckSlot(this.activeSlot, deck);
    saveActiveSlot(this.activeSlot);
    this.showToast('덱이 저장되었습니다!');
  }

  private showToast(message: string): void {
    const { width, height } = this.scale;
    const toast = this.add
      .text(width / 2, height * 0.7, message, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#ffe9b0',
        backgroundColor: '#151a28',
        padding: { left: px(12), right: px(12), top: px(8), bottom: px(8) },
      })
      .setOrigin(0.5)
      .setDepth(500);

    this.tweens.add({
      targets: toast,
      y: toast.y - px(20),
      alpha: 0,
      duration: 1100,
      delay: 500,
      onComplete: () => toast.destroy(),
    });
  }
}
