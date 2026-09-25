import Phaser from 'phaser';
import { ROLE_DESCRIPTIONS } from '../core/units';
import { getRarity } from '../core/graphics/gem';
import { ROLE_SIGILS } from '../core/graphics/sigils';
import { createGemTexture } from '../core/graphics/texture';
import { loadGold } from '../meta/gold';
import {
  GENERAL_RESEARCH_KEYS,
  MAX_RESEARCH_LEVEL,
  getGeneralLabel,
  getGeneralLevel,
  getRoleLevel,
  levelUpGeneral,
  levelUpRole,
  researchCost,
  type GeneralResearchKey,
} from '../meta/research';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
const ROLE_IDS = Object.keys(ROLE_DESCRIPTIONS);
const ROLE_COLS = 3;

export class ResearchScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;

  constructor() {
    super('research');
  }

  create(): void {
    this.layout();
    this.scale.on('resize', () => this.layout());
  }

  private layout(): void {
    this.children.removeAll(true);

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#07080d');

    this.add
      .text(width / 2, height * 0.055, '연구', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(33)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.goldText = this.add
      .text(width / 2, height * 0.105, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(18)}px`,
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

    // 일반 연구: 모든 유닛에 공통 적용되는 전투 능력치 2종.
    const generalTop = height * 0.145;
    const generalHeight = height * 0.1;
    const generalGap = width * 0.03;
    const generalWidth = (width * 0.92 - generalGap) / 2;
    const generalStartX = width * 0.04 + generalWidth / 2;

    GENERAL_RESEARCH_KEYS.forEach((key, i) => {
      const x = generalStartX + i * (generalWidth + generalGap);
      this.drawGeneralCard(key, x, generalTop + generalHeight / 2, generalWidth, generalHeight);
    });

    // 역할별 연구: 15개 역할, 3열 x 5행으로 한 화면에 전부 표시.
    const roleTop = generalTop + generalHeight + height * 0.03;
    const roleRows = Math.ceil(ROLE_IDS.length / ROLE_COLS);
    const roleAreaHeight = height * 0.98 - roleTop;
    const rowHeight = roleAreaHeight / roleRows;
    const colWidth = width / ROLE_COLS;

    ROLE_IDS.forEach((role, i) => {
      const col = i % ROLE_COLS;
      const row = Math.floor(i / ROLE_COLS);
      const y = roleTop + row * rowHeight + rowHeight / 2;
      this.drawRoleCard(role, col * colWidth, colWidth, y, rowHeight);
    });
  }

  private drawGeneralCard(key: GeneralResearchKey, x: number, y: number, cardW: number, cardH: number): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x151a28, 0.85);
    bg.fillRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, px(8));
    bg.lineStyle(px(1), 0xd4b36a, 0.4);
    bg.strokeRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, px(8));

    const level = getGeneralLevel(key);
    const labelX = x - cardW / 2 + cardW * 0.06;

    // 컬렉션 화면과 동일하게, 이름/레벨 글씨 크기를 옆 버튼 크기에서
    // 계산한 값으로 맞춘다 (버튼과 같은 계산식 공유).
    const buttonWidth = cardW * 0.28;
    const labelFontSize = Math.max(9, Math.round(buttonWidth * 0.13));
    const costFontSize = Math.max(8, Math.round(buttonWidth * 0.1));

    this.add
      .text(labelX, y - cardH * 0.28, getGeneralLabel(key), {
        fontFamily: TITLE_FONT,
        fontSize: `${labelFontSize}px`,
        color: '#f0e9d8',
      })
      .setOrigin(0, 0.5);

    this.add
      .text(labelX, y + cardH * 0.2, `Lv.${level}/${MAX_RESEARCH_LEVEL}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${costFontSize}px`,
        color: '#9a917d',
      })
      .setOrigin(0, 0.5);

    const buttonX = x + cardW / 2 - buttonWidth / 2 - cardW * 0.05;
    this.drawResearchButton(buttonX, y, buttonWidth, cardH * 0.62, level, labelFontSize, costFontSize, () => {
      if (levelUpGeneral(key)) {
        this.refreshGold();
        this.layout();
        this.showToast(`${getGeneralLabel(key)} Lv.${level + 1}!`);
      } else {
        this.showToast(level >= MAX_RESEARCH_LEVEL ? '최대 레벨' : '골드 부족');
      }
    });
  }

  private drawRoleCard(role: string, x0: number, colWidth: number, y: number, rowHeight: number): void {
    const pad = colWidth * 0.04;
    const cardX = x0 + pad;
    const cardW = colWidth - pad * 2;
    const cardTop = y - rowHeight * 0.42;
    const cardH = rowHeight * 0.84;

    const bg = this.add.graphics();
    bg.fillStyle(0x151a28, 0.85);
    bg.fillRoundedRect(cardX, cardTop, cardW, cardH, px(8));
    bg.lineStyle(px(1), 0xd4b36a, 0.4);
    bg.strokeRoundedRect(cardX, cardTop, cardW, cardH, px(8));

    const iconAreaWidth = cardW * 0.3;
    const buttonAreaWidth = cardW * 0.34;
    const textAreaWidth = cardW - iconAreaWidth - buttonAreaWidth;
    const buttonWidth = buttonAreaWidth * 0.88;

    // 컬렉션 화면과 동일한 계산식으로 이름/특성/레벨 글씨 크기를 버튼과
    // 공유한다.
    const labelFontSize = Math.max(9, Math.round(buttonWidth * 0.13));
    const costFontSize = Math.max(8, Math.round(buttonWidth * 0.1));

    const iconSize = Math.min(iconAreaWidth * 0.85, cardH * 0.78);
    const iconX = cardX + iconAreaWidth / 2;
    const sigil = ROLE_SIGILS[role];
    const key = `researchicon-${role}-${Math.round(iconSize)}`;
    createGemTexture(this, key, getRarity('rare'), sigil, 1, Math.round(iconSize));
    this.add.image(iconX, y, key).setDisplaySize(iconSize, iconSize);

    const level = getRoleLevel(role);
    const textCx = cardX + iconAreaWidth + textAreaWidth / 2;
    const textWrapWidth = textAreaWidth - cardW * 0.04;

    const nameTop = cardTop + cardH * 0.12;
    const nameText = this.add
      .text(textCx, nameTop, sigil?.label ?? role, {
        fontFamily: TITLE_FONT,
        fontSize: `${labelFontSize}px`,
        color: '#f0e9d8',
        align: 'center',
        wordWrap: { width: textWrapWidth },
      })
      .setOrigin(0.5, 0);

    const descTop = nameTop + nameText.height + cardH * 0.04;
    const descText = this.add
      .text(textCx, descTop, ROLE_DESCRIPTIONS[role] ?? '', {
        fontFamily: TITLE_FONT,
        fontSize: `${costFontSize}px`,
        color: '#9fd8ff',
        align: 'center',
        wordWrap: { width: textWrapWidth },
      })
      .setOrigin(0.5, 0);

    const subTop = descTop + descText.height + cardH * 0.04;
    this.add
      .text(textCx, subTop, `Lv.${level}/${MAX_RESEARCH_LEVEL}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${costFontSize}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5, 0);

    const buttonX = cardX + cardW - buttonAreaWidth / 2;
    this.drawResearchButton(buttonX, y, buttonWidth, cardH * 0.6, level, labelFontSize, costFontSize, () => {
      if (levelUpRole(role)) {
        this.refreshGold();
        this.layout();
        this.showToast(`${sigil?.label ?? role} Lv.${level + 1}!`);
      } else {
        this.showToast(level >= MAX_RESEARCH_LEVEL ? '최대 레벨' : '골드 부족');
      }
    });
  }

  private drawResearchButton(
    x: number,
    y: number,
    buttonWidth: number,
    buttonHeight: number,
    level: number,
    labelFontSize: number,
    costFontSize: number,
    onClick: () => void,
  ): void {

    if (level >= MAX_RESEARCH_LEVEL) {
      this.add
        .text(x, y, 'MAX', {
          fontFamily: TITLE_FONT,
          fontSize: `${labelFontSize}px`,
          color: '#6a6458',
        })
        .setOrigin(0.5);
      return;
    }

    const cost = researchCost(level);
    const canAfford = loadGold() >= cost;

    const bg = this.add.graphics();
    bg.fillStyle(0x1f2536, canAfford ? 1 : 0.5);
    bg.fillRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, px(6));
    bg.lineStyle(px(1.5), canAfford ? 0xd4b36a : 0x555555, 0.9);
    bg.strokeRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, px(6));

    this.add
      .text(x, y - buttonHeight * 0.18, '연구', {
        fontFamily: TITLE_FONT,
        fontSize: `${labelFontSize}px`,
        color: canAfford ? '#ffd98a' : '#8a8272',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(x, y + buttonHeight * 0.3, `골드${cost}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${costFontSize}px`,
        color: '#8a8272',
      })
      .setOrigin(0.5);

    this.add
      .zone(x, y, buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onClick);
  }

  private refreshGold(): void {
    this.goldText?.setText(`골드 ${loadGold()}`);
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
