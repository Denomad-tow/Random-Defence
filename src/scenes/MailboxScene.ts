import Phaser from 'phaser';
import { fetchUnclaimedMail, claimMail, isAdmin, type MailItem } from '../meta/mail';
import { addGold } from '../meta/gold';
import { addBox } from '../meta/boxes';
import { getBoxType } from '../meta/gacha';
import { mountAdminMailOverlay } from '../core/adminMailOverlay';
import { mountAdminResetPasswordOverlay } from '../core/adminResetPasswordOverlay';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
const ROWS_PER_PAGE = 3;

export class MailboxScene extends Phaser.Scene {
  private page = 0;
  private mail: MailItem[] = [];
  private loading = true;
  private admin = false;

  constructor() {
    super('mailbox');
  }

  create(): void {
    this.page = 0;
    this.mail = [];
    this.loading = true;
    this.layout();

    void this.loadData();
    this.scale.on('resize', () => this.layout());
  }

  private async loadData(): Promise<void> {
    const [mail, admin] = await Promise.all([fetchUnclaimedMail(), isAdmin()]);
    this.mail = mail;
    this.admin = admin;
    this.loading = false;
    this.layout();
  }

  private layout(): void {
    this.children.removeAll(true);

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#07080d');

    this.add
      .text(width / 2, height * 0.055, '우편함', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(22)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

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

    if (this.admin) {
      this.add
        .text(width - px(12), height * 0.055, '+ 우편 발송', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(13)}px`,
          color: '#a8ffb0',
          fontStyle: 'bold',
        })
        .setOrigin(1, 0.5)
        .setInteractive({ useHandCursor: true })
        .setPadding(px(8), px(8), px(8), px(8))
        .on('pointerdown', () => this.openComposeOverlay());

      this.add
        .text(width - px(12), height * 0.09, '비번 초기화', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(12)}px`,
          color: '#ffb0b0',
          fontStyle: 'bold',
        })
        .setOrigin(1, 0.5)
        .setInteractive({ useHandCursor: true })
        .setPadding(px(8), px(6), px(8), px(6))
        .on('pointerdown', () => mountAdminResetPasswordOverlay());
    }

    if (this.loading) {
      this.add
        .text(width / 2, height * 0.45, '불러오는 중...', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(14)}px`,
          color: '#9a917d',
        })
        .setOrigin(0.5);
      return;
    }

    if (this.mail.length === 0) {
      this.add
        .text(width / 2, height * 0.45, '받을 우편이 없어요', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(14)}px`,
          color: '#9a917d',
        })
        .setOrigin(0.5);
      return;
    }

    const totalPages = Math.max(1, Math.ceil(this.mail.length / ROWS_PER_PAGE));
    this.page = Phaser.Math.Clamp(this.page, 0, totalPages - 1);
    const pageItems = this.mail.slice(this.page * ROWS_PER_PAGE, (this.page + 1) * ROWS_PER_PAGE);

    const listTop = height * 0.12;
    const rowHeight = (height * 0.72) / ROWS_PER_PAGE;

    pageItems.forEach((item, i) => {
      this.drawMailCard(item, listTop + i * rowHeight + rowHeight / 2, rowHeight, width);
    });

    if (totalPages > 1) {
      this.drawPagination(width, height * 0.92, totalPages);
    }
  }

  private drawMailCard(item: MailItem, y: number, rowHeight: number, width: number): void {
    const cardX = width * 0.04;
    const cardW = width * 0.92;
    const cardTop = y - rowHeight * 0.44;
    const cardH = rowHeight * 0.88;

    const bg = this.add.graphics();
    bg.fillStyle(0x151a28, 0.9);
    bg.fillRoundedRect(cardX, cardTop, cardW, cardH, px(10));
    bg.lineStyle(px(1.5), 0xd4b36a, 0.5);
    bg.strokeRoundedRect(cardX, cardTop, cardW, cardH, px(10));

    const textX = cardX + cardW * 0.05;
    const textWrapWidth = cardW * 0.9;

    const title = this.add
      .text(textX, cardTop + cardH * 0.1, item.title, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
        wordWrap: { width: textWrapWidth },
      })
      .setOrigin(0, 0);

    const bodyTop = cardTop + cardH * 0.1 + title.height + cardH * 0.04;
    this.add
      .text(textX, bodyTop, item.body, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
        color: '#c9c2af',
        wordWrap: { width: textWrapWidth },
      })
      .setOrigin(0, 0);

    const rewardParts: string[] = [];
    if (item.reward_gold > 0) rewardParts.push(`골드 +${item.reward_gold}`);
    if (item.reward_box_id && item.reward_box_count > 0) {
      const boxName = getBoxType(item.reward_box_id).name;
      rewardParts.push(`${boxName} +${item.reward_box_count}`);
    }
    const rewardText = rewardParts.length > 0 ? rewardParts.join(' · ') : '보상 없음';

    this.add
      .text(textX, cardTop + cardH - cardH * 0.2, rewardText, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(12)}px`,
        color: '#ffd98a',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    const buttonWidth = cardW * 0.22;
    const buttonHeight = cardH * 0.24;
    const buttonX = cardX + cardW - buttonWidth * 0.7;
    const buttonY = cardTop + cardH - cardH * 0.2;

    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x2a2416, 1);
    btnBg.fillRoundedRect(buttonX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(6));
    btnBg.lineStyle(px(1.5), 0xd4b36a, 1);
    btnBg.strokeRoundedRect(buttonX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(6));

    this.add
      .text(buttonX, buttonY, '받기', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(12)}px`,
        color: '#ffd98a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .zone(buttonX, buttonY, buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.claim(item));
  }

  private async claim(item: MailItem): Promise<void> {
    const ok = await claimMail(item.id);
    if (!ok) {
      this.showToast('받기에 실패했어요. 잠시 후 다시 시도해주세요');
      return;
    }

    if (item.reward_gold > 0) addGold(item.reward_gold);
    if (item.reward_box_id && item.reward_box_count > 0) addBox(item.reward_box_id, item.reward_box_count);

    this.mail = this.mail.filter((m) => m.id !== item.id);
    this.layout();
    this.showToast(`${item.title} 보상을 받았어요!`);
  }

  private openComposeOverlay(): void {
    mountAdminMailOverlay(() => {
      void this.loadData();
    });
  }

  private drawPagination(width: number, y: number, totalPages: number): void {
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
        color: '#9a917d',
      })
      .setOrigin(0.5);

    drawArrowButton(width / 2 + gapX, '▶', this.page < totalPages - 1, () => {
      this.page += 1;
      this.layout();
    });
  }

  private showToast(message: string): void {
    const { width, height } = this.scale;
    const toast = this.add
      .text(width / 2, height * 0.88, message, {
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
