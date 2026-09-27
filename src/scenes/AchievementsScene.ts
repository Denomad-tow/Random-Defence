import Phaser from 'phaser';
import {
  ACHIEVEMENT_CATEGORIES,
  claimAchievement,
  claimAllAchievements,
  getAchievementStatuses,
  rewardText,
  type AchievementCategory,
  type AchievementStatus,
} from '../meta/achievements';
import { flushStats } from '../meta/stats';
import { flushSnapshot } from '../core/cloudSync';
import { getBoxType } from '../meta/gacha';
import { roundedRectTexture } from '../core/fx';
import { playSfx } from '../core/sfx';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
const ROWS_PER_PAGE = 6;

// 업적 화면: 분류 탭 → 업적 목록(진행도 막대) → 달성하면 "받기"로 보상 수령.
export class AchievementsScene extends Phaser.Scene {
  private category: AchievementCategory = ACHIEVEMENT_CATEGORIES[0];
  private page = 0;

  constructor() {
    super('achievements');
  }

  create(): void {
    flushStats();
    this.category = ACHIEVEMENT_CATEGORIES[0];
    this.page = 0;
    this.layout();
    this.scale.on('resize', () => this.layout());
  }

  private layout(): void {
    this.children.removeAll(true);
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#07080d');

    const all = getAchievementStatuses();
    const done = all.filter((s) => s.state === 'claimed').length;
    const claimable = all.filter((s) => s.state === 'claimable').length;

    this.add
      .text(width / 2, height * 0.045, '업적', { fontFamily: TITLE_FONT, fontSize: `${px(22)}px`, color: '#f6e6b4', fontStyle: 'bold' })
      .setOrigin(0.5);

    this.add
      .text(px(12), height * 0.045, '← 뒤로', { fontFamily: TITLE_FONT, fontSize: `${px(13)}px`, color: '#9a917d' })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .setPadding(px(8), px(8), px(8), px(8))
      .on('pointerdown', () => this.scene.start('deck-select', { forceEdit: true }));

    this.add
      .text(width / 2, height * 0.085, `보상 받은 업적 ${done}/${all.length} · 지금 받을 수 있는 보상 ${claimable}개`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11.5)}px`,
        color: claimable > 0 ? '#ffd98a' : '#9a917d',
      })
      .setOrigin(0.5);

    this.drawClaimAll(width, height * 0.125, claimable);
    this.drawTabs(width, height * 0.171, height * 0.213, all);

    const statuses = this.sortedForCategory(all);
    const inCategory = all.filter((s) => s.def.category === this.category);
    const categoryDone = inCategory.filter((s) => s.state === 'claimed').length;
    this.add
      .text(width / 2, height * 0.247, `${this.category} · 수령 ${categoryDone}/${inCategory.length}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(10.5)}px`,
        color: '#8a8272',
      })
      .setOrigin(0.5);
    const totalPages = Math.max(1, Math.ceil(statuses.length / ROWS_PER_PAGE));
    this.page = Phaser.Math.Clamp(this.page, 0, totalPages - 1);
    const pageItems = statuses.slice(this.page * ROWS_PER_PAGE, (this.page + 1) * ROWS_PER_PAGE);

    const top = height * 0.262;
    const bottom = height * 0.915;
    const rowHeight = (bottom - top) / ROWS_PER_PAGE;
    pageItems.forEach((status, i) => this.drawRow(status, width, top + i * rowHeight + rowHeight / 2, rowHeight));

    if (totalPages > 1) this.drawPagination(width, height * 0.958, totalPages);
  }

  // 받을 수 있는 것 → 진행 중(목표가 낮은 순) → 이미 받은 것 순서
  private sortedForCategory(all: AchievementStatus[]): AchievementStatus[] {
    const rank = { claimable: 0, locked: 1, claimed: 2 } as const;
    // 같은 상태끼리는 업적을 만든 순서(같은 줄기의 쉬운 것부터)를 그대로 유지한다.
    return all
      .map((status, index) => ({ status, index }))
      .filter((item) => item.status.def.category === this.category)
      .sort((a, b) => rank[a.status.state] - rank[b.status.state] || a.index - b.index)
      .map((item) => item.status);
  }

  private drawClaimAll(width: number, y: number, claimable: number): void {
    const w = Math.min(width * 0.6, px(240));
    const h = px(32);
    const enabled = claimable > 0;
    this.add.image(width / 2, y, roundedRectTexture(this, w, h, px(8), 0x151a28, enabled ? 0.98 : 0.5, enabled ? 0xd4b36a : 0x555555, px(2), `claimall${enabled ? 1 : 0}`));
    this.add
      .text(width / 2, y, enabled ? `🎁 모두 받기 (${claimable}개)` : '받을 수 있는 보상이 없어요', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: enabled ? '#ffd98a' : '#6a6458',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    if (!enabled) return;
    this.add
      .zone(width / 2, y, w, h)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        const result = claimAllAchievements();
        void flushSnapshot();
        playSfx('mana');
        const boxes = Object.entries(result.boxes)
          .map(([id, count]) => `${getBoxType(id).name} ${count}개`)
          .join(', ');
        this.layout();
        this.showToast(`🎁 ${result.count}개 수령! 골드 +${result.gold.toLocaleString('ko-KR')}${boxes ? ' · ' + boxes : ''}`);
      });
  }

  // 분류 탭: 9개를 위 줄 5개, 아래 줄 4개로 나눠 그린다.
  private drawTabs(width: number, y1: number, y2: number, all: AchievementStatus[]): void {
    const perRow = 5;
    const gap = width * 0.015;
    const tabWidth = (width * 0.96 - gap * (perRow - 1)) / perRow;
    const tabHeight = px(28);

    ACHIEVEMENT_CATEGORIES.forEach((category, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const countInRow = row === 0 ? perRow : ACHIEVEMENT_CATEGORIES.length - perRow;
      const rowWidth = countInRow * tabWidth + (countInRow - 1) * gap;
      const x = width / 2 - rowWidth / 2 + tabWidth / 2 + col * (tabWidth + gap);
      const y = row === 0 ? y1 : y2;
      const active = category === this.category;
      const ready = all.some((s) => s.def.category === category && s.state === 'claimable');

      this.add.image(x, y, roundedRectTexture(this, tabWidth, tabHeight, px(8), active ? 0x2a2416 : 0x151a28, active ? 1 : 0.85, active ? 0xd4b36a : 0x3a3a3a, px(1.5), `achtab${active ? 1 : 0}`));
      this.add
        .text(x, y, category + (ready ? '●' : ''), {
          fontFamily: TITLE_FONT,
          fontSize: `${px(12)}px`,
          color: ready ? '#ff9a6a' : active ? '#ffd98a' : '#8a8272',
          fontStyle: active ? 'bold' : 'normal',
        })
        .setOrigin(0.5);
      this.add
        .zone(x, y, tabWidth, tabHeight)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (this.category === category) return;
          this.category = category;
          this.page = 0;
          this.layout();
        });
    });
  }

  private drawRow(status: AchievementStatus, width: number, y: number, rowHeight: number): void {
    const { def, value, state } = status;
    const cardWidth = width * 0.94;
    const cardHeight = rowHeight * 0.9;
    const left = width * 0.03;
    const border = state === 'claimable' ? 0xffd98a : state === 'claimed' ? 0x3a3a3a : 0x4a4028;
    const fill = state === 'claimed' ? 0x10131c : 0x151a28;

    this.add.image(width / 2, y, roundedRectTexture(this, cardWidth, cardHeight, px(9), fill, 0.95, border, px(1.5), `achrow${state}`));

    const buttonWidth = width * 0.24;
    const textWidth = cardWidth - buttonWidth - px(28);

    this.add
      .text(left + px(10), y - cardHeight * 0.3, def.name, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: state === 'claimed' ? '#7a7466' : '#f0e9d8',
        fontStyle: 'bold',
        wordWrap: { width: textWidth },
      })
      .setOrigin(0, 0.5);

    this.add
      .text(left + px(10), y - cardHeight * 0.03, def.desc, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(9.5)}px`,
        color: '#8a8272',
        wordWrap: { width: textWidth },
      })
      .setOrigin(0, 0.5);

    // 진행도 막대와 숫자
    const barWidth = textWidth * 0.7;
    const barY = y + cardHeight * 0.27;
    const ratio = Math.min(1, value / def.goal);
    this.add.rectangle(left + px(10) + barWidth / 2, barY, barWidth, px(6), 0x0d1018, 1);
    if (ratio > 0) {
      this.add.rectangle(left + px(10) + (barWidth * ratio) / 2, barY, Math.max(px(2), barWidth * ratio), px(6), state === 'locked' ? 0x8a6a2c : 0xd4b36a, 1);
    }
    this.add
      .text(left + px(10) + barWidth + px(8), barY, def.progressText ? def.progressText(value, def.goal) : `${Math.min(value, def.goal).toLocaleString('ko-KR')} / ${def.goal.toLocaleString('ko-KR')}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(9.5)}px`,
        color: '#c9c2af',
      })
      .setOrigin(0, 0.5);

    // 오른쪽: 보상 글자 + 받기 버튼/상태
    const rightX = left + cardWidth - buttonWidth / 2 - px(8);
    this.add
      .text(rightX, y - cardHeight * 0.28, rewardText(def.reward), {
        fontFamily: TITLE_FONT,
        fontSize: `${px(8.5)}px`,
        color: state === 'claimed' ? '#6a6458' : '#ffd98a',
        align: 'center',
        wordWrap: { width: buttonWidth },
      })
      .setOrigin(0.5);

    const buttonHeight = cardHeight * 0.36;
    const buttonY = y + cardHeight * 0.22;
    if (state === 'claimable') {
      this.add.image(rightX, buttonY, roundedRectTexture(this, buttonWidth, buttonHeight, px(7), 0x2a2416, 1, 0xffd98a, px(2), 'achbtn'));
      this.add.text(rightX, buttonY, '받기', { fontFamily: TITLE_FONT, fontSize: `${px(13)}px`, color: '#ffd98a', fontStyle: 'bold' }).setOrigin(0.5);
      this.add
        .zone(rightX, buttonY, buttonWidth, buttonHeight)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          const reward = claimAchievement(def.id);
          if (!reward) return;
          void flushSnapshot();
          playSfx('mana');
          this.layout();
          this.showToast(`🏆 ${def.name} · ${rewardText(reward)}`);
        });
    } else {
      this.add
        .text(rightX, buttonY, state === 'claimed' ? '✓ 수령 완료' : '진행 중', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(11)}px`,
          color: state === 'claimed' ? '#6a8a6a' : '#8a8272',
        })
        .setOrigin(0.5);
    }
  }

  private drawPagination(width: number, y: number, totalPages: number): void {
    const arrow = (x: number, symbol: string, enabled: boolean, onClick: () => void): void => {
      this.add
        .text(x, y, symbol, { fontFamily: TITLE_FONT, fontSize: `${px(17)}px`, color: enabled ? '#ffd98a' : '#4a4a4a', fontStyle: 'bold' })
        .setOrigin(0.5);
      this.add
        .zone(x, y, px(46), px(38))
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (enabled) onClick();
        });
    };
    const go = (page: number): void => {
      this.page = Phaser.Math.Clamp(page, 0, totalPages - 1);
      this.layout();
    };

    // ◀◀ ◀ 현재/전체 ▶ ▶▶ (◀◀ ▶▶ 는 10쪽씩 건너뛴다)
    arrow(width * 0.1, '◀◀', this.page > 0, () => go(this.page - 10));
    arrow(width * 0.28, '◀', this.page > 0, () => go(this.page - 1));
    this.add
      .text(width / 2, y, `${this.page + 1} / ${totalPages}`, { fontFamily: TITLE_FONT, fontSize: `${px(13)}px`, color: '#f6e6b4' })
      .setOrigin(0.5);
    arrow(width * 0.72, '▶', this.page < totalPages - 1, () => go(this.page + 1));
    arrow(width * 0.9, '▶▶', this.page < totalPages - 1, () => go(this.page + 10));
  }

  private showToast(message: string): void {
    const { width, height } = this.scale;
    const toast = this.add
      .text(width / 2, height * 0.5, message, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#ffe9b0',
        backgroundColor: '#151a28',
        padding: { left: px(12), right: px(12), top: px(8), bottom: px(8) },
        align: 'center',
        wordWrap: { width: width * 0.86 },
      })
      .setOrigin(0.5)
      .setDepth(500);
    this.tweens.add({ targets: toast, y: toast.y - px(24), alpha: 0, duration: 1400, delay: 900, onComplete: () => toast.destroy() });
  }
}
