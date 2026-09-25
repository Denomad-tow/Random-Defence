import Phaser from 'phaser';
import { fetchLeaderboard, type LeaderboardRow } from '../meta/versusRanking';
import { getCurrentNickname } from '../meta/auth';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
const PARTY_SIZES = [2, 3, 4, 5];

// 6단계(경쟁 파티전) "인원별 순위" 화면. 시즌제(주기적 초기화)는 이번엔 빼고
// 역대 전적(인원수별 승리 횟수) 순위만 보여준다.
export class RankingScene extends Phaser.Scene {
  private currentSize = PARTY_SIZES[0];
  private nickname = '';
  private loading = true;
  private rows: LeaderboardRow[] = [];
  private requestToken = 0;

  constructor() {
    super('ranking');
  }

  create(): void {
    this.currentSize = PARTY_SIZES[0];
    this.loading = true;
    this.rows = [];

    void getCurrentNickname().then((nick) => {
      this.nickname = nick ?? '';
    });

    this.layout();
    this.loadLeaderboard();
  }

  private loadLeaderboard(): void {
    this.loading = true;
    this.layout();

    const token = ++this.requestToken;
    void fetchLeaderboard(this.currentSize).then((rows) => {
      if (token !== this.requestToken) return; // 그 사이에 다른 탭을 눌렀으면 무시
      this.rows = rows;
      this.loading = false;
      this.layout();
    });
  }

  private layout(): void {
    this.children.removeAll(true);

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#07080d');

    this.add
      .text(width / 2, height * 0.05, '순위', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(24)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.085, '경쟁 파티전 역대 전적 (시즌제는 준비 중)', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
        color: '#9a917d',
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

    this.drawSizeTabs(width, height * 0.15);

    const listTop = height * 0.22;
    if (this.loading) {
      this.add
        .text(width / 2, listTop + height * 0.1, '불러오는 중...', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(13)}px`,
          color: '#9a917d',
        })
        .setOrigin(0.5);
      return;
    }

    if (this.rows.length === 0) {
      this.add
        .text(width / 2, listTop + height * 0.1, `아직 ${this.currentSize}인 경쟁전 기록이 없어요`, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(13)}px`,
          color: '#9a917d',
        })
        .setOrigin(0.5);
      return;
    }

    this.drawList(width, listTop, height - listTop - height * 0.04);
  }

  private drawSizeTabs(width: number, y: number): void {
    const gap = width * 0.02;
    const tabWidth = (width * 0.96 - gap * (PARTY_SIZES.length - 1)) / PARTY_SIZES.length;

    PARTY_SIZES.forEach((size, i) => {
      const x = width * 0.02 + tabWidth / 2 + i * (tabWidth + gap);
      const active = size === this.currentSize;

      const bg = this.add.graphics();
      bg.fillStyle(active ? 0x2a2416 : 0x151a28, active ? 1 : 0.85);
      bg.fillRoundedRect(x - tabWidth / 2, y - px(16), tabWidth, px(32), px(8));
      bg.lineStyle(px(1.5), active ? 0xd4b36a : 0x3a3a3a, 1);
      bg.strokeRoundedRect(x - tabWidth / 2, y - px(16), tabWidth, px(32), px(8));

      this.add
        .text(x, y, `${size}인`, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(13)}px`,
          color: active ? '#ffd98a' : '#8a8272',
          fontStyle: active ? 'bold' : 'normal',
        })
        .setOrigin(0.5);

      this.add
        .zone(x, y, tabWidth, px(32))
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (this.currentSize === size) return;
          this.currentSize = size;
          this.loadLeaderboard();
        });
    });
  }

  private drawList(width: number, top: number, availableHeight: number): void {
    const maxRows = 10;
    const rows = this.rows.slice(0, maxRows);
    const rowHeight = Math.min(availableHeight / rows.length, px(52));

    rows.forEach((row, i) => {
      const y = top + i * rowHeight + rowHeight / 2;
      const isMe = row.nickname === this.nickname;

      const bg = this.add.graphics();
      bg.fillStyle(isMe ? 0x2a2416 : 0x151a28, 0.9);
      bg.fillRoundedRect(width * 0.05, y - rowHeight * 0.4, width * 0.9, rowHeight * 0.8, px(8));
      if (isMe) {
        bg.lineStyle(px(1.5), 0xd4b36a, 0.9);
        bg.strokeRoundedRect(width * 0.05, y - rowHeight * 0.4, width * 0.9, rowHeight * 0.8, px(8));
      }

      const rankColor = i === 0 ? '#ffd98a' : i === 1 ? '#dcdcdc' : i === 2 ? '#e0a86a' : '#8a8272';
      this.add
        .text(width * 0.12, y, `${i + 1}`, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(16)}px`,
          color: rankColor,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      this.add
        .text(width * 0.24, y, `${row.nickname}${isMe ? ' (나)' : ''}`, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(13)}px`,
          color: '#f0e9d8',
        })
        .setOrigin(0, 0.5);

      this.add
        .text(width * 0.9, y, `${row.wins}승 · ${row.games}판`, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(12)}px`,
          color: '#ffd98a',
        })
        .setOrigin(1, 0.5);
    });
  }
}
