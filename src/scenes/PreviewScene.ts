import Phaser from 'phaser';
import { RARITIES } from '../core/graphics/gem';
import { ROLE_SIGILS } from '../core/graphics/sigils';
import { createGemTexture } from '../core/graphics/texture';
import { px } from '../core/dpr';

const TEXTURE_SIZE = px(160);
const GEM_DISPLAY_SIZE = px(120);
const TITLE_FONT = '"Noto Serif KR", serif';

export class PreviewScene extends Phaser.Scene {
  constructor() {
    super('preview');
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
      .text(width / 2, px(56), '아케인 룬 디펜스', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(28)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, px(90), '0단계 — 공통 그래픽 모듈 확인 (둔화 룬 × 등급 6종)', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);

    const sigil = ROLE_SIGILS.slow;
    const cols = RARITIES.length;
    const spacing = Math.min(px(150), (width - px(80)) / cols);
    const startX = width / 2 - ((cols - 1) * spacing) / 2;
    const y = height / 2 + px(20);

    RARITIES.forEach((rarity, i) => {
      const key = `gem-${rarity.key}-slow`;
      createGemTexture(this, key, rarity, sigil, i + 1, TEXTURE_SIZE);
      const x = startX + i * spacing;

      this.add.image(x, y, key).setDisplaySize(GEM_DISPLAY_SIZE, GEM_DISPLAY_SIZE);
      this.add
        .text(x, y + px(76), rarity.label, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(13)}px`,
          color: rarity.c1,
        })
        .setOrigin(0.5);
    });
  }
}
