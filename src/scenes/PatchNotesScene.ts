import Phaser from 'phaser';
import { PATCH_NOTES, loadSeenVersion, markPatchSeen, patchToModal } from '../meta/patchNotes';
import { showInfoModal } from '../core/infoModal';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';

// 공지사항 화면: 지난 패치 버전 목록. 누르면 그 버전에서 바뀐 내용이 팝업으로 나온다.
export class PatchNotesScene extends Phaser.Scene {
  constructor() {
    super('patch-notes');
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
      .text(width / 2, height * 0.05, '공지사항', {
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

    this.add
      .text(width / 2, height * 0.09, '패치 버전을 눌러 바뀐 내용을 확인하세요', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);

    const seen = loadSeenVersion();
    const rowHeight = Math.max(px(56), height * 0.075);
    const gap = px(10);
    const top = height * 0.13;
    const cardWidth = Math.min(width * 0.94, px(460));

    PATCH_NOTES.forEach((note, i) => {
      const y = top + rowHeight / 2 + i * (rowHeight + gap);
      const isNew = i === 0 && seen !== note.version;

      const bg = this.add.graphics();
      bg.fillStyle(0x151a28, 0.95);
      bg.fillRoundedRect(width / 2 - cardWidth / 2, y - rowHeight / 2, cardWidth, rowHeight, px(10));
      bg.lineStyle(px(1.5), isNew ? 0xff9a6a : 0xd4b36a, 0.85);
      bg.strokeRoundedRect(width / 2 - cardWidth / 2, y - rowHeight / 2, cardWidth, rowHeight, px(10));

      this.add
        .text(width / 2 - cardWidth / 2 + px(14), y - rowHeight * 0.16, `v${note.version}${isNew ? '  NEW' : ''}`, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(15)}px`,
          color: isNew ? '#ff9a6a' : '#ffd98a',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);

      this.add
        .text(width / 2 - cardWidth / 2 + px(14), y + rowHeight * 0.22, note.title, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(12)}px`,
          color: '#c9c2af',
        })
        .setOrigin(0, 0.5);

      this.add
        .text(width / 2 + cardWidth / 2 - px(14), y, note.date, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(11)}px`,
          color: '#8a8272',
        })
        .setOrigin(1, 0.5);

      this.add
        .zone(width / 2, y, cardWidth, rowHeight)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          showInfoModal(this, patchToModal(note));
          if (i === 0) markPatchSeen(); // "NEW" 표시는 다음에 이 화면에 들어올 때부터 사라진다
        });
    });
  }
}
