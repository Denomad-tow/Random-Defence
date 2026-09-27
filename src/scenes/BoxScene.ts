import Phaser from 'phaser';
import { BOX_TYPES, MYTHIC_PITY_LIMIT, loadPity, openBox, type DrawnCard } from '../meta/gacha';
import { loadBoxes, takeBox, takeBoxes } from '../meta/boxes';
import { loadGold } from '../meta/gold';
import { loadCollection, saveCollection } from '../meta/collection';
import { flushSnapshot } from '../core/cloudSync';
import { addStat, flushStats } from '../meta/stats';
import { playSfx, rarityIndex } from '../core/sfx';
import { getRarity } from '../core/graphics/gem';
import { ROLE_SIGILS } from '../core/graphics/sigils';
import { createGemTexture } from '../core/graphics/texture';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
// 결과 화면에 한 쪽에 보여줄 카드 수(5열 × 3줄). 넘치면 여러 쪽으로 나눠서 하나도 빠짐없이 보여준다.
const REVEAL_PER_PAGE = 15;

export class BoxScene extends Phaser.Scene {
  private revealed: DrawnCard[] | null = null;
  private revealCounts = new Map<string, number>(); // 유닛 id → 이번에 나온 장수(전체 열기에서 같은 유닛을 묶어 보여준다)
  private revealNew = new Set<string>(); // 이번에 처음 얻은 유닛
  private revealPage = 0;
  private revealTotal = 0; // 이번에 나온 카드 총 장수
  private revealBoxes = 0; // 이번에 연 상자 수
  private revealAnnounced = false; // 신화 연출은 결과 화면당 한 번만(쪽을 넘길 때 다시 나오지 않게)

  constructor() {
    super('box');
  }

  create(): void {
    this.revealed = null;
    this.revealPage = 0;
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
      const showAll = owned >= 2;
      const openText = this.add
        .text(width * 0.88, showAll ? y - rowHeight * 0.17 : y, canOpen ? '열기' : '없음', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(14)}px`,
          color: canOpen ? '#ffd98a' : '#4a4a4a',
          fontStyle: 'bold',
        })
        .setOrigin(1, 0.5)
        .setPadding(px(10), px(6), px(10), px(6));

      if (canOpen) {
        openText.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.handleOpen(box.id));
      }

      // 같은 상자가 2개 이상이면 "전체 열기(×개수)"로 한꺼번에 연다.
      if (showAll) {
        this.add
          .text(width * 0.88, y + rowHeight * 0.2, `전체 열기 ×${owned}`, {
            fontFamily: TITLE_FONT,
            fontSize: `${px(11)}px`,
            color: '#ffb36b',
            fontStyle: 'bold',
            backgroundColor: '#2a1c10',
          })
          .setOrigin(1, 0.5)
          .setPadding(px(8), px(5), px(8), px(5))
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.handleOpenAll(box.id));
      }
    });
  }

  private handleOpen(boxId: string): void {
    const box = BOX_TYPES.find((b) => b.id === boxId);
    if (!box) return;
    if (!takeBox(boxId)) return;

    const before = new Set(loadCollection());
    const drawn = openBox(box);
    saveCollection([...loadCollection(), ...drawn.map((card) => card.unit.id)]);
    addStat('boxesOpened');
    addStat(`open_${boxId}`);
    drawn.forEach((card) => addStat(`draw_${card.rarity}`));
    flushStats();
    void flushSnapshot();
    // 뽑힌 카드 중 가장 높은 등급에 맞는 소리를 낸다(SSSR 이상은 특별한 소리).
    playSfx('boxOpen', { rarity: Math.max(...drawn.map((card) => rarityIndex(card.unit.rarity))) });

    this.beginReveal(drawn, before, false, 1);
  }

  // 같은 상자를 가진 만큼 전부 연다. 나온 카드는 같은 유닛끼리 묶어(×장수) 등급 높은 순으로 여러 쪽에 나눠 보여준다.
  private handleOpenAll(boxId: string): void {
    const box = BOX_TYPES.find((b) => b.id === boxId);
    if (!box) return;

    const opened = takeBoxes(boxId, loadBoxes()[boxId] ?? 0);
    if (opened <= 0) return;

    const before = new Set(loadCollection());
    const drawn: DrawnCard[] = [];
    for (let i = 0; i < opened; i += 1) drawn.push(...openBox(box));

    // 컬렉션에는 한 번에 모아서 저장한다(카드 수백 장이어도 빠르게)
    saveCollection([...loadCollection(), ...drawn.map((card) => card.unit.id)]);
    addStat('boxesOpened', opened);
    addStat(`open_${boxId}`, opened);
    drawn.forEach((card) => addStat(`draw_${card.rarity}`));
    flushStats();
    void flushSnapshot();
    playSfx('boxOpen', { rarity: Math.max(...drawn.map((card) => rarityIndex(card.unit.rarity))) });

    this.beginReveal(drawn, before, true, opened);
  }

  // 결과 화면을 준비한다. bulk면 같은 유닛을 묶고 등급 높은 순으로 정렬한다.
  private beginReveal(drawn: DrawnCard[], before: Set<string>, bulk: boolean, boxCount: number): void {
    this.revealCounts = new Map();
    this.revealNew = new Set();
    drawn.forEach((card) => {
      this.revealCounts.set(card.unit.id, (this.revealCounts.get(card.unit.id) ?? 0) + 1);
      if (!before.has(card.unit.id)) this.revealNew.add(card.unit.id);
    });

    if (bulk) {
      const byUnit = new Map<string, DrawnCard>();
      drawn.forEach((card) => {
        const existing = byUnit.get(card.unit.id);
        if (!existing) byUnit.set(card.unit.id, { ...card });
        else existing.pityTriggered = existing.pityTriggered || card.pityTriggered;
      });
      this.revealed = Array.from(byUnit.values()).sort(
        (a, b) => rarityIndex(b.unit.rarity) - rarityIndex(a.unit.rarity) || a.unit.name.localeCompare(b.unit.name, 'ko'),
      );
    } else {
      this.revealed = drawn;
    }

    this.revealTotal = drawn.length;
    this.revealBoxes = boxCount;
    this.revealPage = 0;
    this.revealAnnounced = false;
    this.layout();
  }

  private layoutReveal(cards: DrawnCard[]): void {
    const { width, height } = this.scale;
    const totalPages = Math.max(1, Math.ceil(cards.length / REVEAL_PER_PAGE));
    this.revealPage = Phaser.Math.Clamp(this.revealPage, 0, totalPages - 1);
    const pageCards = cards.slice(this.revealPage * REVEAL_PER_PAGE, (this.revealPage + 1) * REVEAL_PER_PAGE);

    if (!this.revealAnnounced) {
      this.revealAnnounced = true;
      if (cards.some((c) => rarityIndex(c.unit.rarity) >= rarityIndex('mythic'))) {
        this.announceMythic(width, height);
      }
    }

    // 머리글: 총 장수와 (여러 상자를 열었다면) 등급별 개수
    const bulk = this.revealBoxes > 1;
    this.add
      .text(width / 2, height * 0.155, bulk ? `상자 ${this.revealBoxes}개 · 카드 ${this.revealTotal}장 (${cards.length}종)` : '획득!', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(bulk ? 15 : 18)}px`,
        color: '#ffe9b0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    if (bulk) {
      const perRarity = new Map<string, number>();
      cards.forEach((card) => perRarity.set(card.rarity, (perRarity.get(card.rarity) ?? 0) + (this.revealCounts.get(card.unit.id) ?? 1)));
      const summary = Array.from(perRarity.entries())
        .sort((a, b) => rarityIndex(b[0]) - rarityIndex(a[0]))
        .map(([key, count]) => `${getRarity(key).label} ${count}`)
        .join(' · ');
      this.add
        .text(width / 2, height * 0.198, summary, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(11)}px`,
          color: '#ffd98a',
          align: 'center',
          wordWrap: { width: width * 0.94 },
        })
        .setOrigin(0.5);
      this.add
        .text(width / 2, height * 0.238, '카드는 모두 컬렉션에 들어갔어요 · 아래 쪽 넘김으로 전부 볼 수 있어요', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(9.5)}px`,
          color: '#8a8272',
        })
        .setOrigin(0.5);
    }

    const cols = Math.min(5, pageCards.length);
    const rows = Math.ceil(pageCards.length / cols);
    const cardSize = Math.min((width * 0.94) / (5 + 4 * 0.3), (height * 0.4) / Math.max(rows, 3));
    const gap = cardSize * 0.3;
    const gridWidth = cardSize * cols + gap * (cols - 1);
    const startX = width / 2 - gridWidth / 2 + cardSize / 2;
    const startY = height * 0.3 + cardSize / 2;

    pageCards.forEach((card, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardSize + gap);
      const y = startY + row * (cardSize * 1.55);
      this.drawRevealCard(card, x, y, cardSize);
    });

    // 쪽 넘김: 카드가 15장을 넘으면 ◀ 1/4 ▶ 로 넘겨 가며 전부 볼 수 있다.
    if (totalPages > 1) {
      const pageY = height * 0.76;
      const arrow = (x: number, symbol: string, enabled: boolean, onClick: () => void): void => {
        this.add
          .text(x, pageY, symbol, { fontFamily: TITLE_FONT, fontSize: `${px(22)}px`, color: enabled ? '#ffd98a' : '#4a4a4a', fontStyle: 'bold' })
          .setOrigin(0.5);
        this.add
          .zone(x, pageY, px(56), px(48))
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            if (enabled) onClick();
          });
      };
      arrow(width * 0.27, '◀', this.revealPage > 0, () => {
        this.revealPage -= 1;
        this.layout();
      });
      this.add
        .text(width / 2, pageY, `${this.revealPage + 1} / ${totalPages}`, { fontFamily: TITLE_FONT, fontSize: `${px(14)}px`, color: '#f6e6b4' })
        .setOrigin(0.5);
      arrow(width * 0.73, '▶', this.revealPage < totalPages - 1, () => {
        this.revealPage += 1;
        this.layout();
      });
    }

    const buttonWidth = Math.min(width * 0.5, cardSize * 3);
    const buttonHeight = height * 0.08;
    const buttonY = height * 0.87;

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

    const count = this.revealCounts.get(card.unit.id) ?? 1;
    if (count > 1 && this.revealBoxes > 1) {
      this.add
        .text(x + size * 0.42, y - size * 0.4, `×${count}`, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(11)}px`,
          color: '#ffffff',
          fontStyle: 'bold',
          backgroundColor: '#1a2540',
          padding: { left: px(3), right: px(3), top: px(1), bottom: px(1) },
        })
        .setOrigin(0.5)
        .setDepth(5);
    }

    if (this.revealNew.has(card.unit.id)) {
      this.add
        .text(x - size * 0.4, y - size * 0.45, 'NEW', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(9)}px`,
          color: '#1a1200',
          fontStyle: 'bold',
          backgroundColor: '#ffd98a',
          padding: { left: px(3), right: px(3), top: px(1), bottom: px(1) },
        })
        .setOrigin(0.5)
        .setDepth(5);
    }

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
