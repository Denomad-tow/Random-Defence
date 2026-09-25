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
          fontSize: `${px(11 * 1.2)}px`,
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

    const bg = this.add.graphics();
    bg.fillStyle(0x151a28, 0.85);
    bg.fillRoundedRect(cardX, cardTop, cardW, cardH, px(8));
    bg.lineStyle(px(1), 0xd4b36a, 0.4);
    bg.strokeRoundedRect(cardX, cardTop, cardW, cardH, px(8));

    // 좌측 아이콘(컬렉션 화면과 동일한 크기 계산식) / 가운데 이름·분류·특성 /
    // 우측 공격·속도·사거리 3줄, 균형있게 3분할.
    const iconAreaWidth = cardW * 0.3;
    const statsAreaWidth = cardW * 0.32;
    const textAreaWidth = cardW - iconAreaWidth - statsAreaWidth;

    const iconSize = Math.min(iconAreaWidth * 0.85, cardH * 0.78);
    const iconX = cardX + iconAreaWidth / 2;
    const sigil = ROLE_SIGILS[unit.role];
    const key = `codexicon-${unit.id}-${Math.round(iconSize)}`;
    createGemTexture(this, key, getRarity(unit.rarity), sigil, 1, Math.round(iconSize));
    this.add.image(iconX, y, key).setDisplaySize(iconSize, iconSize);

    // 중앙 이름·분류·특성 글씨 크기는 컬렉션 화면의 특성 설명 글씨 크기와 동일하게 맞춘다.
    const collectionButtonWidth = cardW * 0.34 * 0.88;
    const centerFontSize = Math.max(8, Math.round(collectionButtonWidth * 0.1));
    const textCx = cardX + iconAreaWidth + textAreaWidth / 2;
    const textWrapWidth = textAreaWidth - cardW * 0.03;
    const centerLineGap = cardH * 0.015;

    const category = ROLE_CATEGORIES[unit.role] ?? '';
    const categoryColor = CATEGORY_COLORS[category] ?? '#9a917d';

    // 이름/분류/특성 세 줄을 먼저 만들어 높이를 잰 뒤, 박스 세로 중앙(y)에 맞춰
    // 전체 블록을 다시 배치한다.
    const nameText = this.add
      .text(textCx, 0, `${sigil?.label ?? unit.role}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${centerFontSize}px`,
        color: '#f0e9d8',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: textWrapWidth },
      })
      .setOrigin(0.5, 0);

    const categoryText = this.add
      .text(textCx, 0, category, {
        fontFamily: TITLE_FONT,
        fontSize: `${centerFontSize}px`,
        color: categoryColor,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    const descText = this.add
      .text(textCx, 0, ROLE_DESCRIPTIONS[unit.role] ?? '', {
        fontFamily: TITLE_FONT,
        fontSize: `${centerFontSize}px`,
        color: '#9fd8ff',
        align: 'center',
        wordWrap: { width: textWrapWidth },
      })
      .setOrigin(0.5, 0);

    const totalCenterHeight = nameText.height + centerLineGap + categoryText.height + centerLineGap + descText.height;
    let centerTop = y - totalCenterHeight / 2;
    nameText.setY(centerTop);
    centerTop += nameText.height + centerLineGap;
    categoryText.setY(centerTop);
    centerTop += categoryText.height + centerLineGap;
    descText.setY(centerTop);

    // 우측: 공격/속도/사거리를 각각 한 줄씩, 작은 글씨 + 좁은 여백으로 배치.
    const statsCx = cardX + cardW - statsAreaWidth / 2;
    const statLines = [
      { label: '공격', value: `${unit.attack}` },
      { label: '속도', value: `${unit.attackSpeed}` },
      { label: '사거리', value: `${unit.range}` },
    ];
    const statFontSize = Math.max(7, Math.round(cardW * 0.035));
    const statGap = cardH * 0.03;

    const probe = this.add.text(0, 0, '측정용', {
      fontFamily: TITLE_FONT,
      fontSize: `${statFontSize}px`,
    });
    const statLineHeight = probe.height;
    probe.destroy();

    const totalStatsHeight = statLineHeight * statLines.length + statGap * (statLines.length - 1);
    let statY = y - totalStatsHeight / 2 + statLineHeight / 2;

    statLines.forEach((stat) => {
      this.add
        .text(statsCx, statY, `${stat.label} ${stat.value}`, {
          fontFamily: TITLE_FONT,
          fontSize: `${statFontSize}px`,
          color: '#ffd98a',
          align: 'center',
        })
        .setOrigin(0.5);
      statY += statLineHeight + statGap;
    });
  }
}
