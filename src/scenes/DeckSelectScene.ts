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
import { showInfoModal } from '../core/infoModal';
import { claimableCount } from '../meta/achievements';
import { recommendDecks, roleLabel } from '../core/deckRecommend';
import { hasUnseenPatch, latestPatch, markPatchSeen, patchToModal } from '../meta/patchNotes';
import { showDeleteAccountOverlay } from '../core/deleteAccountOverlay';
import { showBugReportOverlay } from '../core/bugReportOverlay';
import { showChangePasswordOverlay } from '../core/changePasswordOverlay';
import { mountInlineChat, type InlineChatHandle } from '../core/inlineChat';
import { showUnitInfoModal } from '../core/unitInfoModal';
import { canClaimAttendanceToday, currentAttendanceDay, claimAttendance } from '../meta/attendance';
import { ATTENDANCE_REWARDS } from '../core/attendanceBalance';
import { getBoxType } from '../meta/gacha';
import { px, capPx, DPR } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
const DOUBLE_TAP_WINDOW_MS = 320;

interface CardRef {
  ring: Phaser.GameObjects.Arc;
}

export class DeckSelectScene extends Phaser.Scene {
  private selected = new Set<string>();
  private ownedCounts = new Map<string, number>();
  private cardRefs = new Map<string, CardRef>();
  private countText!: Phaser.GameObjects.Text;
  private startButtonText!: Phaser.GameObjects.Text;
  private activeSlot = 0;
  private page = 0;
  private nickname = '';
  private nicknameText?: Phaser.GameObjects.Text;
  private attendanceOpen = false;
  private inlineChat?: InlineChatHandle;
  private lastTapId: string | null = null;
  private lastTapTime = 0;

  constructor() {
    super('deck-select');
  }

  create(): void {
    this.page = 0;
    const collection = ensureStarterCollection(OBTAINABLE_UNITS);
    this.rebuildOwnedCounts(collection);

    this.activeSlot = loadActiveSlot();
    const saved = loadDeckSlot(this.activeSlot);
    const validSaved = saved?.filter((id) => this.ownedCounts.has(id)) ?? [];

    this.selected = new Set(validSaved.slice(0, DECK_SIZE));

    this.inlineChat = mountInlineChat();
    this.events.once('shutdown', () => {
      this.inlineChat?.destroy();
      this.inlineChat = undefined;
    });

    this.layout();
    this.scale.on('resize', () => {
      this.layout();
      if (this.attendanceOpen) this.showAttendanceModal();
    });

    void getCurrentNickname().then((nick) => {
      this.nickname = nick ?? '';
      this.nicknameText?.setText(this.nickname ? `${this.nickname}님` : '');
    });

    if (canClaimAttendanceToday()) {
      this.showAttendanceModal();
    } else {
      this.maybeShowPatchPopup();
    }
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

    const latestNote = latestPatch();
    const unseenPatch = hasUnseenPatch();
    this.add
      .text(width - px(12), px(12), `공지 v${latestNote?.version ?? ''}${unseenPatch ? ' ●' : ''}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: unseenPatch ? '#ff9a6a' : '#9a917d',
        fontStyle: unseenPatch ? 'bold' : 'normal',
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .setPadding(px(6), px(6), px(6), px(6))
      .on('pointerdown', () => this.scene.start('patch-notes'));

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

    const claimable = claimableCount();
    const navButtons: Array<{ label: string; color: string; onClick: () => void }> = [
      { label: '연구', color: '#a8ffb0', onClick: () => this.scene.start('research') },
      { label: `상자 (${totalBoxes})`, color: '#ffd98a', onClick: () => this.scene.start('box') },
      { label: '컬렉션', color: '#9fd8ff', onClick: () => this.scene.start('collection') },
      { label: '도감', color: '#c9a8ff', onClick: () => this.scene.start('codex') },
      { label: claimable > 0 ? '업적●' : '업적', color: claimable > 0 ? '#ff9a6a' : '#ffe08a', onClick: () => this.scene.start('achievements') },
      { label: '우편함', color: '#ffb0e0', onClick: () => this.scene.start('mailbox') },
      { label: '파티', color: '#ffcf6b', onClick: () => this.scene.start('party') },
      { label: '순위', color: '#7ef0ff', onClick: () => this.scene.start('ranking') },
      { label: '로그아웃', color: '#ff9a9a', onClick: () => this.handleLogout() },
    ];

    // 버튼이 5열 × 2줄에 들어가도록 한다(위 줄 5개, 아래 줄 4개).
    const navCols = 5;
    const navGap = width * 0.025;
    const navSlotWidth = (width * 0.94 - navGap * (navCols - 1)) / navCols;
    const navSlotHeight = height * 0.05;
    // 버튼(상자) 자체 크기는 기존 대비 70%로 줄이되, 칸 간격(navSlotWidth 기준)은
    // 그대로 둬서 버튼 사이에 여백이 생기도록 한다.
    const navWidth = navSlotWidth * 0.9;
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

    // 로그아웃 버튼 바로 아래에 작은 "회원 탈퇴" 링크를 둔다(자주 누를
    // 일이 없는 위험한 동작이라 눈에 덜 띄게 처리).
    const logoutX = navStartX + 3 * (navSlotWidth + navGap);
    const logoutRowY = navTop + (navSlotHeight + navRowGap);
    const deleteLinkY = logoutRowY + navHeight / 2 + height * 0.02;
    this.add
      .text(logoutX, deleteLinkY, '회원 탈퇴', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
        color: '#7a6a6a',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setPadding(px(6), px(6), px(6), px(6))
      .on('pointerdown', () => this.handleDeleteAccount());

    // 연구 버튼 아래에는 "사운드"(소리 설정과 효과음 테스트) 링크를 둔다.
    this.add
      .text(navStartX, deleteLinkY, '사운드', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
        color: '#7a7a6a',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setPadding(px(6), px(6), px(6), px(6))
      .on('pointerdown', () => this.scene.start('sound-test'));

    // 파티 버튼 아래에는 "비밀번호 변경" 링크를 둔다.
    const partyX = navStartX + 1 * (navSlotWidth + navGap);
    this.add
      .text(partyX, deleteLinkY, '비밀번호 변경', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
        color: '#7a7a6a',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setPadding(px(6), px(6), px(6), px(6))
      .on('pointerdown', () => this.handleChangePassword());

    // 순위 버튼 아래에는 "버그 제보" 링크를 대칭으로 배치한다.
    const rankingX = navStartX + 2 * (navSlotWidth + navGap);
    this.add
      .text(rankingX, deleteLinkY, '버그 제보', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
        color: '#7a7a6a',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setPadding(px(6), px(6), px(6), px(6))
      .on('pointerdown', () => showBugReportOverlay());

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
    const cardSizeByHeight = (height * 0.4) / rowsFactor;
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

    // 시작 버튼 아래 남는 공간을 실시간 채팅창으로 채운다(화면 위쪽에서 canvas가 밀려 있는 만큼도 더한다).
    this.inlineChat?.setTop(this.game.canvas.getBoundingClientRect().top + (buttonY + buttonHeight / 2 + height * 0.02) / DPR);

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

    // 덱 추천 / 자동 선택 (선택 수 글자 왼쪽)
    const smallButton = (x: number, label: string, color: string, onClick: () => void): void => {
      const w = width * 0.17;
      const bg = this.add.graphics();
      bg.fillStyle(0x151a28, 0.95);
      bg.fillRoundedRect(x - w / 2, countY - resetHeight / 2, w, resetHeight, px(8));
      bg.lineStyle(px(1.5), Phaser.Display.Color.HexStringToColor(color).color, 0.8);
      bg.strokeRoundedRect(x - w / 2, countY - resetHeight / 2, w, resetHeight, px(8));
      this.add.text(x, countY, label, { fontFamily: TITLE_FONT, fontSize: `${px(12)}px`, color, fontStyle: 'bold' }).setOrigin(0.5);
      this.add.zone(x, countY, w, resetHeight).setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
    };
    smallButton(px(12) + width * 0.085, '⭐ 추천', '#ffd98a', () => this.openRecommend());
    smallButton(px(12) + width * 0.085 + width * 0.185, '⚡ 자동', '#9be89b', () => this.autoSelect());

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
      .on('pointerdown', () => this.registerCardTap(unit));

    const count = this.ownedCounts.get(unit.id) ?? 1;
    const nameLabel = count > 1 ? `${unit.name} ×${count}` : unit.name;
    const labelFontSize = capPx(Math.max(8, Math.round(size * 0.19)), 13);
    this.add
      .text(x, y + size * 0.62, nameLabel, {
        fontFamily: TITLE_FONT,
        fontSize: `${labelFontSize}px`,
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

    this.add
      .text(x, y, label, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
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

  private handleChangePassword(): void {
    if (!this.nickname) {
      this.showToast('잠시 후 다시 시도해주세요');
      return;
    }
    showChangePasswordOverlay(this.nickname);
  }

  private handleDeleteAccount(): void {
    if (!this.nickname) {
      this.showToast('잠시 후 다시 시도해주세요');
      return;
    }
    showDeleteAccountOverlay(this.nickname);
  }

  // 한 번 탭하면 평소처럼 덱에 넣거나 뺀다. 짧은 시간 안에 같은 유닛을 두 번
  // 탭하면(더블 탭) 선택 상태는 원래대로 되돌리고, 대신 그 유닛의 도감 정보
  // 팝업을 띄운다.
  private registerCardTap(unit: UnitDef): void {
    const now = this.time.now;
    const isDoubleTap = this.lastTapId === unit.id && now - this.lastTapTime < DOUBLE_TAP_WINDOW_MS;

    this.toggleUnit(unit.id);

    if (isDoubleTap) {
      this.lastTapId = null;
      this.lastTapTime = 0;
      this.showUnitInfoModal(unit);
      return;
    }

    this.lastTapId = unit.id;
    this.lastTapTime = now;
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

  // 추천 조합 목록을 보여주고, 고르면 그 5종이 덱으로 선택된다.
  private openRecommend(): void {
    const recs = recommendDecks(this.ownedUnits());
    if (recs.length === 0) {
      this.showToast('추천할 유닛이 아직 없어요');
      return;
    }

    const circled = ['①', '②', '③', '④', '⑤', '⑥'];
    this.inlineChat?.setHidden(true);
    showInfoModal(this, {
      onClose: () => this.inlineChat?.setHidden(false),
      title: '추천 덱 조합',
      subtitle: '가진 유닛 중 잘 어울리는 5종을 골라 드려요',
      lines: recs.map(
        (rec, i) =>
          `${circled[i] ?? i + 1} ${rec.title} — ${rec.desc}\n   ${rec.units.map((u) => `${u.name}(${roleLabel(u)})`).join(', ')}`,
      ),
      buttons: [
        ...recs.map((rec, i) => ({
          label: `${circled[i] ?? i + 1} ${rec.title} 선택`,
          primary: i === 0,
          onClick: () => this.applyDeck(rec.units.map((u) => u.id), `${rec.title} 조합을 선택했어요`),
        })),
        { label: '닫기', primary: false, onClick: () => undefined },
      ],
    });
  }

  // 자동 선택: 가장 무난한 "균형형" 추천을 바로 적용한다.
  private autoSelect(): void {
    const recs = recommendDecks(this.ownedUnits());
    if (recs.length === 0) {
      this.showToast('선택할 유닛이 아직 없어요');
      return;
    }
    this.applyDeck(recs[0].units.map((u) => u.id), `자동 선택: ${recs[0].title}`);
  }

  private applyDeck(ids: string[], message: string): void {
    this.selected = new Set(ids.slice(0, DECK_SIZE));
    this.cardRefs.forEach((_, id) => this.updateCardVisual(id));
    this.refreshSelectionUI();
    this.showToast(message);
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

  private showUnitInfoModal(unit: UnitDef): void {
    showUnitInfoModal(this, unit);
  }

  private showAttendanceModal(): void {
    this.attendanceOpen = true;
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72).setDepth(600).setInteractive();

    // PC처럼 넓은 화면에서는 팝업이 화면 폭만큼 늘어나지 않도록 폭에 상한을 두고,
    // 높이는 폭에 맞춰(칸이 커진 만큼) 같이 키운다.
    const panelWidth = Math.min(width * 0.86, px(460));
    const panelHeight = Math.min(height * 0.92, Math.max(height * 0.46, panelWidth * 1.16));
    const panelX = width / 2;
    const panelY = height / 2;

    const panel = this.add.graphics().setDepth(601);
    panel.fillStyle(0x151a28, 0.98);
    panel.fillRoundedRect(panelX - panelWidth / 2, panelY - panelHeight / 2, panelWidth, panelHeight, px(14));
    panel.lineStyle(px(2.5), 0xd4b36a, 1);
    panel.strokeRoundedRect(panelX - panelWidth / 2, panelY - panelHeight / 2, panelWidth, panelHeight, px(14));

    this.add
      .text(panelX, panelY - panelHeight * 0.4, '7일 출석 체크', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(20)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(602);

    const today = currentAttendanceDay();
    const canClaim = canClaimAttendanceToday();

    const cols = 4;
    const cellGap = panelWidth * 0.02;
    const cellSize = (panelWidth * 0.86 - cellGap * (cols - 1)) / cols;
    const gridTop = panelY - panelHeight * 0.12;
    const rowGap = cellSize * 0.3;

    ATTENDANCE_REWARDS.forEach((reward, i) => {
      const day = i + 1;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rowCount = row === 0 ? cols : ATTENDANCE_REWARDS.length - cols;
      const rowWidth = cellSize * rowCount + cellGap * (rowCount - 1);
      const rowStartX = panelX - rowWidth / 2 + cellSize / 2;
      const x = rowStartX + col * (cellSize + cellGap);
      const y = gridTop + row * (cellSize + rowGap);

      const claimed = day < today || (day === today && !canClaim);
      const isToday = day === today && canClaim;
      const BOX_COLORS: Record<string, string> = {
        wood: '#c9a878',
        silver: '#c9d6e0',
        gold: '#ffd98a',
        diamond: '#7ef0ff',
        platinum: '#6ff7ff',
        mithril: '#ffe066',
        orichalcum: '#ffffff',
      };
      // 하루에 상자를 한 종류만 주면 그 상자 이름·색을 그대로 보여주고,
      // 여러 종류를 섞어 주는 날(7일차)은 "모둠 상자"로 뭉뚱그려 보여준다(칸이 좁아 이름 세 개를 다 못 넣는다).
      const isAssorted = reward.length > 1;
      const boxColor = isAssorted ? '#ffe9b0' : (BOX_COLORS[reward[0].boxId] ?? '#c9a878');
      const boxName = isAssorted ? '모둠 상자' : getBoxType(reward[0].boxId).name.replace(' 상자', '');
      const countLabel = isAssorted ? `각 ${reward[0].count}개` : `x${reward[0].count}`;

      const cellBg = this.add.graphics().setDepth(602);
      cellBg.fillStyle(isToday ? 0x2a2416 : 0x1c2233, isToday ? 1 : 0.85);
      cellBg.fillRoundedRect(x - cellSize / 2, y - cellSize / 2, cellSize, cellSize, px(8));
      cellBg.lineStyle(px(isToday ? 2.5 : 1.2), isToday ? 0xffd98a : claimed ? 0x5a7a5a : 0x3a3a3a, 1);
      cellBg.strokeRoundedRect(x - cellSize / 2, y - cellSize / 2, cellSize, cellSize, px(8));

      this.add
        .text(x, y - cellSize * 0.3, `${day}일`, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(11)}px`,
          color: claimed ? '#6a6458' : '#9a917d',
        })
        .setOrigin(0.5)
        .setDepth(603);

      this.add
        .text(x, y + cellSize * 0.02, boxName, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(boxName.replace(' ', '').length >= 5 ? 9 : boxName.replace(' ', '').length >= 4 ? 10 : 12)}px`,
          color: claimed ? '#6a6458' : boxColor,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(603);

      this.add
        .text(x, y + cellSize * 0.32, countLabel, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(isAssorted ? 9.5 : 11)}px`,
          color: claimed ? '#6a6458' : '#f0e9d8',
        })
        .setOrigin(0.5)
        .setDepth(603);

      if (claimed) {
        this.add
          .text(x, y, '✓', { fontFamily: TITLE_FONT, fontSize: `${px(24)}px`, color: '#4a7a4a' })
          .setOrigin(0.5)
          .setDepth(604)
          .setAlpha(0.6);
      }
    });

    const btnY = panelY + panelHeight * 0.36;
    const btnWidth = panelWidth * 0.55;
    const btnHeight = panelHeight * 0.15;

    const btnBg = this.add.graphics().setDepth(602);
    btnBg.fillStyle(0x1f2536, 1);
    btnBg.fillRoundedRect(panelX - btnWidth / 2, btnY - btnHeight / 2, btnWidth, btnHeight, px(10));
    btnBg.lineStyle(px(2), 0xd4b36a, 1);
    btnBg.strokeRoundedRect(panelX - btnWidth / 2, btnY - btnHeight / 2, btnWidth, btnHeight, px(10));

    this.add
      .text(panelX, btnY, canClaim ? `${today}일차 받기` : '오늘 받음', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(16)}px`,
        color: '#ffd98a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(603);

    if (canClaim) {
      this.add
        .zone(panelX, btnY, btnWidth, btnHeight)
        .setDepth(604)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          const result = claimAttendance();
          this.attendanceOpen = false;
          this.layout();
          this.maybeShowPatchPopup();
          if (result) {
            // 받은 직후 바로 서버에 저장해둔다. 다음 접속(특히 곧바로 새로고침하거나
            // 창을 닫는 경우) 때 주기 저장(20초 간격)이 아직 안 된 상태로 서버의
            // "아직 안 받음" 값이 다시 덮어써서 같은 날 또 받아지는 문제를 막기 위함.
            void flushSnapshot();
            const rewardText = result.reward.map((item) => `${getBoxType(item.boxId).name} ${item.count}개`).join(' · ');
            this.showToast(`${result.day}일차: ${rewardText} 획득!`);
          }
        });
    }

    const closeX = panelX + panelWidth / 2 - px(22);
    const closeY = panelY - panelHeight / 2 + px(20);
    this.add
      .text(closeX, closeY, '✕', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(18)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5)
      .setDepth(603)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.attendanceOpen = false;
        this.layout();
        this.maybeShowPatchPopup();
      });
  }

  // 아직 보지 않은 새 공지(패치 노트)가 있으면 팝업으로 한 번 보여준다. 출석 보상 창이 열려 있는 동안에는 미룬다.
  private maybeShowPatchPopup(): void {
    if (this.attendanceOpen || !hasUnseenPatch()) return;
    const latest = latestPatch();
    if (!latest) return;
    markPatchSeen();
    this.inlineChat?.setHidden(true);
    showInfoModal(this, { ...patchToModal(latest), onClose: () => this.inlineChat?.setHidden(false) });
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
