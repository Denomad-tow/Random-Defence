import Phaser from 'phaser';
import { BOX_TYPES, MYTHIC_PITY_LIMIT, loadPity, openBox, type DrawnCard } from '../meta/gacha';
import { loadBoxes, takeBox } from '../meta/boxes';
import { loadGold } from '../meta/gold';
import { addToCollection } from '../meta/collection';
import { flushSnapshot } from '../core/cloudSync';
import { playSfx, rarityIndex } from '../core/sfx';
import { getRarity } from '../core/graphics/gem';
import { ROLE_SIGILS } from '../core/graphics/sigils';
import { createGemTexture } from '../core/graphics/texture';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';

export class BoxScene extends Phaser.Scene {
  private revealed: DrawnCard[] | null = null;

  constructor() {
    super('box');
  }

  create(): void {
    this.revealed = null;
    this.layout();
    this.scale.on('resize', () => this.layout());
  }

  private layout(): void {
    this.children.removeAll(true);

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#07080d');

    this.add
      .text(width / 2, height * 0.06, '상자', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(24)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const gold = loadGold();
    const pity = loadPity();
    this.add
      .text(width / 2, height * 0.1, `골드 ${gold} · UR 천장까지 ${MYTHIC_PITY_LIMIT - pity}장`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(12)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);

    this.add
      .text(px(12), height * 0.06, '← 뒤로', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#9a917d',
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .setPadding(px(8), px(8), px(8), px(8))
      .on('pointerdown', () => this.scene.start('deck-select', { forceEdit: true }));

    if (this.revealed) {
      this.layoutReveal(this.revealed);
      return;
    }

    this.layoutBoxList();
  }

  private layoutBoxList(): void {
    const { width, height } = this.scale;
    const boxes = loadBoxes();
    const startY = height * 0.19;
    const rowHeight = Math.min(height * 0.14, (height * 0.97 - startY) / BOX_TYPES.length);

    BOX_TYPES.forEach((box, i) => {
      const y = startY + i * rowHeight;
      const owned = boxes[box.id] ?? 0;

      const rowBg = this.add.graphics();
      rowBg.fillStyle(0x151a28, 0.9);
      rowBg.fillRoundedRect(width * 0.08, y - rowHeight * 0.36, width * 0.84, rowHeight * 0.72, px(10));
      rowBg.lineStyle(px(1.5), 0xd4b36a, 0.6);
      rowBg.strokeRoundedRect(width * 0.08, y - rowHeight * 0.36, width * 0.84, rowHeight * 0.72, px(10));

      this.add
        .text(width * 0.14, y - rowHeight * 0.22, `${box.name}  ×${owned}`, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(15)}px`,
          color: '#f6e6b4',
        })
        .setOrigin(0, 0.5);

      const probText = `${box.cardCount}장 · ` + Object.entries(box.weights)
        .map(([r, w]) => `${getRarity(r).label} ${w}%`)
        .join(' · ');
      this.add
        .text(width * 0.14, y - rowHeight * 0.02, probText, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(9)}px`,
          color: '#8a8272',
          wordWrap: { width: width * 0.6 },
        })
        .setOrigin(0, 0);

      const canOpen = owned > 0;
      const openText = this.add
        .text(width * 0.88, y, canOpen ? '열기' : '없음', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(14)}px`,
          color: canOpen ? '#ffd98a' : '#4a4a4a',
          fontStyle: 'bold',
        })
        .setOrigin(1, 0.5)
        .setPadding(px(10), px(10), px(10), px(10));

      if (canOpen) {
        openText.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.handleOpen(box.id));
      }
    });
  }

  private handleOpen(boxId: string): void {
    const box = BOX_TYPES.find((b) => b.id === boxId);
    if (!box) return;
    if (!takeBox(boxId)) return;

    const drawn = openBox(box);
    drawn.forEach((card) => addToCollection(card.unit.id));
    void flushSnapshot();
    // 뽑힌 카드 중 가장 높은 등급에 맞는 소리를 낸다(SSSR 이상은 특별한 소리).
    playSfx('boxOpen', { rarity: Math.max(...drawn.map((card) => rarityIndex(card.unit.rarity))) });

    this.revealed = drawn;
    this.layout();
  }

  private layoutReveal(cards: DrawnCard[]): void {
    const { width, height } = this.scale;

    if (cards.some((c) => rarityIndex(c.unit.rarity) >= rarityIndex('mythic'))) {
      this.announceMythic(width, height);
    }

    this.add
      .text(width / 2, height * 0.18, '획득!', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(18)}px`,
        color: '#ffe9b0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const cols = Math.min(5, cards.length);
    const rows = Math.ceil(cards.length / cols);
    const cardSize = Math.min((width * 0.94) / (cols + (cols - 1) * 0.3), (height * 0.4) / rows);
    const gap = cardSize * 0.3;
    const gridWidth = cardSize * cols + gap * (cols - 1);
    const startX = width / 2 - gridWidth / 2 + cardSize / 2;
    const startY = height * 0.32 + cardSize / 2;

    cards.forEach((card, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardSize + gap);
      const y = startY + row * (cardSize * 1.55);
      this.drawRevealCard(card, x, y, cardSize);
    });

    const buttonWidth = Math.min(width * 0.5, cardSize * 3);
    const buttonHeight = height * 0.08;
    const buttonY = height * 0.85;

    const bg = this.add.graphics();
    bg.fillStyle(0x151a28, 0.95);
    bg.fillRoundedRect(width / 2 - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(10));
    bg.lineStyle(px(2), 0xd4b36a, 0.9);
    bg.strokeRoundedRect(width / 2 - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(10));

    this.add
      .text(width / 2, buttonY, '확인', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(15)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .zone(width / 2, buttonY, buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.revealed = null;
        this.layout();
      });
  }

  // 신화 등급은 "신화는 특별한 연출" 원칙에 맞춰, 카드마다 붙는 작은 반짝임 말고도
  // 화면 전체가 살짝 흔들리고 무지개색 빛이 번쩍이는 연출을 한 번 더 넣는다.
  private announceMythic(width: number, height: number): void {
    this.cameras.main.shake(350, 0.008);

    const colors = [0xff5d7a, 0xffc15a, 0xfff066, 0x6fe06f, 0x4f9dff, 0xb67dff];
    colors.forEach((color, i) => {
      const ring = this.add.circle(width / 2, height / 2, height * 0.1, color, 0.28).setDepth(950);
      this.tweens.add({
        targets: ring,
        scale: 6,
        alpha: 0,
        duration: 700,
        delay: i * 40,
        onComplete: () => ring.destroy(),
      });
    });
  }

  private drawRevealCard(card: DrawnCard, x: number, y: number, size: number): void {
    const rarity = getRarity(card.rarity);
    const sigil = ROLE_SIGILS[card.unit.role];
    const textureSize = Math.round(size);
    const key = `boxcard-${card.unit.id}-${textureSize}`;
    createGemTexture(this, key, rarity, sigil, 1, textureSize);

    if (rarity.glow > 0.4) {
      const burst = this.add.circle(x, y, size * 0.7, Phaser.Display.Color.HexStringToColor(rarity.c1).color, 0.4);
      this.tweens.add({ targets: burst, alpha: 0, scale: 1.6, duration: 500, onComplete: () => burst.destroy() });
    }

    const image = this.add.image(x, y, key).setDisplaySize(size * 0.9, size * 0.9);
    const targetScaleX = image.scaleX;
    const targetScaleY = image.scaleY;
    image.setScale(targetScaleX * 0.2, targetScaleY * 0.2);
    this.tweens.add({ targets: image, scaleX: targetScaleX, scaleY: targetScaleY, duration: 320, ease: 'Back.Out' });

    this.add
      .text(x, y + size * 0.62, card.unit.name, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(10)}px`,
        color: '#c9c2af',
        align: 'center',
        wordWrap: { width: size * 1.3 },
      })
      .setOrigin(0.5);

    if (card.pityTriggered) {
      this.add
        .text(x, y - size * 0.65, '천장!', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(10)}px`,
          color: '#ff8fb3',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
    }
  }
}
