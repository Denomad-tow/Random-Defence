import Phaser from 'phaser';
import { getSoundSettings, updateSoundSettings } from '../core/audio';
import { SFX_CATEGORIES, buildSfxList, playAttackBurst, playSfx, type SfxEntry } from '../core/sfx';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
const COLS = 3;

// "사운드 테스트 화면": 만든 효과음을 버튼 하나씩 눌러서 들어보고, 소리 켜기/끄기와 볼륨을 조절한다.
export class SoundTestScene extends Phaser.Scene {
  private category = SFX_CATEGORIES[0];
  private entries: SfxEntry[] = [];

  constructor() {
    super('sound-test');
  }

  create(): void {
    this.entries = buildSfxList();
    this.category = SFX_CATEGORIES[0];
    this.layout();
    this.scale.on('resize', () => this.layout());
  }

  private layout(): void {
    this.children.removeAll(true);
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#07080d');

    this.add
      .text(width / 2, height * 0.05, '사운드 테스트', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(22)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(px(12), height * 0.05, '← 뒤로', { fontFamily: TITLE_FONT, fontSize: `${px(13)}px`, color: '#9a917d' })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .setPadding(px(8), px(8), px(8), px(8))
      .on('pointerdown', () => this.scene.start('deck-select', { forceEdit: true }));

    const settings = getSoundSettings();

    // 소리 켜기/끄기
    this.drawButton(width / 2, height * 0.1, width * 0.5, px(34), settings.enabled ? '🔊 소리 켜짐 (누르면 끄기)' : '🔇 소리 꺼짐 (누르면 켜기)', {
      color: settings.enabled ? '#ffd98a' : '#8a8272',
      onClick: () => {
        updateSoundSettings({ enabled: !getSoundSettings().enabled });
        this.layout();
      },
    });

    this.drawVolumeRow(width, height * 0.15, '전체 볼륨', settings.master, (value) => updateSoundSettings({ master: value }));
    this.drawVolumeRow(width, height * 0.195, '효과음 볼륨', settings.sfx, (value) => updateSoundSettings({ sfx: value }));

    this.drawTabs(width, height * 0.25);

    const items = this.entries.filter((e) => e.category === this.category);
    const gap = width * 0.025;
    const buttonWidth = (width * 0.94 - gap * (COLS - 1)) / COLS;
    const buttonHeight = Math.max(px(38), height * 0.05);
    const top = height * 0.3;

    items.forEach((entry, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = width * 0.03 + buttonWidth / 2 + col * (buttonWidth + gap);
      const y = top + buttonHeight / 2 + row * (buttonHeight + gap);
      this.drawButton(x, y, buttonWidth, buttonHeight, entry.label, { color: '#c9e8ff', onClick: entry.play });
    });

    if (this.category === '공격') {
      const rows = Math.ceil(items.length / COLS);
      const y = top + buttonHeight / 2 + rows * (buttonHeight + gap) + gap;
      this.drawButton(width / 2, y, width * 0.7, buttonHeight, '공격 연타 (겹침 제한 확인)', {
        color: '#ffb0b0',
        onClick: () => playAttackBurst(),
      });
    }

    this.add
      .text(width / 2, height * 0.96, '처음 한 번은 화면을 눌러야 소리가 켜져요 · 버튼을 눌러 하나씩 들어보세요', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(10)}px`,
        color: '#6a6458',
        align: 'center',
        wordWrap: { width: width * 0.94 },
      })
      .setOrigin(0.5);
  }

  private drawVolumeRow(width: number, y: number, label: string, value: number, onChange: (v: number) => void): void {
    this.add
      .text(width * 0.06, y, label, { fontFamily: TITLE_FONT, fontSize: `${px(13)}px`, color: '#c9c2af' })
      .setOrigin(0, 0.5);

    const step = (delta: number): void => {
      const next = Math.round(Math.min(1, Math.max(0, value + delta)) * 10) / 10;
      onChange(next);
      playSfx('click');
      this.layout();
    };

    const barX = width * 0.4;
    const barWidth = width * 0.34;
    const bg = this.add.graphics();
    bg.fillStyle(0x151a28, 1);
    bg.fillRoundedRect(barX, y - px(5), barWidth, px(10), px(5));
    bg.fillStyle(0xd4b36a, 1);
    bg.fillRoundedRect(barX, y - px(5), Math.max(px(2), barWidth * value), px(10), px(5));

    this.drawButton(width * 0.34, y, px(30), px(28), '−', { color: '#ffd98a', onClick: () => step(-0.1) });
    this.drawButton(width * 0.79, y, px(30), px(28), '+', { color: '#ffd98a', onClick: () => step(0.1) });
    this.add
      .text(width * 0.9, y, `${Math.round(value * 100)}%`, { fontFamily: TITLE_FONT, fontSize: `${px(13)}px`, color: '#f6e6b4' })
      .setOrigin(0.5);
  }

  private drawTabs(width: number, y: number): void {
    const gap = width * 0.015;
    const tabWidth = (width * 0.96 - gap * (SFX_CATEGORIES.length - 1)) / SFX_CATEGORIES.length;

    SFX_CATEGORIES.forEach((category, i) => {
      const x = width * 0.02 + tabWidth / 2 + i * (tabWidth + gap);
      const active = category === this.category;
      const bg = this.add.graphics();
      bg.fillStyle(active ? 0x2a2416 : 0x151a28, active ? 1 : 0.85);
      bg.fillRoundedRect(x - tabWidth / 2, y - px(15), tabWidth, px(30), px(8));
      bg.lineStyle(px(1.5), active ? 0xd4b36a : 0x3a3a3a, 1);
      bg.strokeRoundedRect(x - tabWidth / 2, y - px(15), tabWidth, px(30), px(8));

      this.add
        .text(x, y, category, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(12)}px`,
          color: active ? '#ffd98a' : '#8a8272',
          fontStyle: active ? 'bold' : 'normal',
        })
        .setOrigin(0.5);

      this.add
        .zone(x, y, tabWidth, px(30))
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (this.category === category) return;
          this.category = category;
          this.layout();
        });
    });
  }

  private drawButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    options: { color: string; onClick: () => void },
  ): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x151a28, 0.95);
    bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, px(8));
    bg.lineStyle(px(1.5), Phaser.Display.Color.HexStringToColor(options.color).color, 0.8);
    bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, px(8));

    const text = this.add
      .text(x, y, label, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(12)}px`,
        color: options.color,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: w * 0.9 },
      })
      .setOrigin(0.5);

    this.add
      .zone(x, y, w, h)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.tweens.add({ targets: text, scale: 0.9, duration: 60, yoyo: true });
        options.onClick();
      });
  }
}
