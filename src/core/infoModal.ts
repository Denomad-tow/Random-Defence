import Phaser from 'phaser';
import { px } from './dpr';

const TITLE_FONT = '"Noto Serif KR", serif';

export interface InfoModalContent {
  title: string;
  subtitle?: string;
  lines: string[]; // 한 줄씩 보여줄 설명(길면 알아서 줄바꿈)
  accent?: number; // 테두리 색
}

// 제목 + 설명 몇 줄만 보여주는 간단한 팝업(연구·컬렉션의 "레벨업하면 뭐가 좋아지는지" 안내용).
// 내용 길이에 맞춰 높이가 정해지고, "닫기"나 바깥을 누르면 닫힌다.
export function showInfoModal(scene: Phaser.Scene, content: InfoModalContent): void {
  const { width, height } = scene.scale;
  const container = scene.add.container(0, 0).setDepth(700);
  const close = (): void => container.destroy();

  const dim = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72).setInteractive();
  container.add(dim);

  const panelWidth = Math.min(width * 0.9, px(420));
  const panelX = width / 2;
  const textWidth = panelWidth * 0.84;
  const pad = px(20);
  const gap = px(10);

  const titleText = scene.add
    .text(panelX, 0, content.title, {
      fontFamily: TITLE_FONT,
      fontSize: `${px(17)}px`,
      color: '#f6e6b4',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: textWidth },
    })
    .setOrigin(0.5, 0);

  const subtitleText = content.subtitle
    ? scene.add
        .text(panelX, 0, content.subtitle, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(13)}px`,
          color: '#9fd8ff',
          align: 'center',
          wordWrap: { width: textWidth },
        })
        .setOrigin(0.5, 0)
    : undefined;

  const lineTexts = content.lines.map((line) =>
    scene.add
      .text(panelX - textWidth / 2, 0, line, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#c9c2af',
        wordWrap: { width: textWidth },
        lineSpacing: px(3),
      })
      .setOrigin(0, 0),
  );

  const buttonWidth = panelWidth * 0.5;
  const buttonHeight = px(42);

  const stack: Array<{ obj: Phaser.GameObjects.Text; after: number }> = [{ obj: titleText, after: gap * 0.6 }];
  if (subtitleText) stack.push({ obj: subtitleText, after: gap * 1.2 });
  lineTexts.forEach((t) => stack.push({ obj: t, after: gap * 0.9 }));

  const contentHeight = stack.reduce((sum, item) => sum + item.obj.height + item.after, 0);
  const panelHeight = Math.min(pad * 2 + contentHeight + buttonHeight + gap * 0.6, height * 0.94);
  const top = (height - panelHeight) / 2;

  const panel = scene.add.graphics();
  panel.fillStyle(0x151a28, 0.98);
  panel.fillRoundedRect(panelX - panelWidth / 2, top, panelWidth, panelHeight, px(14));
  panel.lineStyle(px(2.5), content.accent ?? 0xd4b36a, 1);
  panel.strokeRoundedRect(panelX - panelWidth / 2, top, panelWidth, panelHeight, px(14));
  container.add(panel);

  let cursorY = top + pad;
  stack.forEach((item) => {
    item.obj.setY(cursorY);
    container.add(item.obj);
    cursorY += item.obj.height + item.after;
  });

  const buttonY = top + panelHeight - pad - buttonHeight / 2;
  const buttonBg = scene.add.graphics();
  buttonBg.fillStyle(0x1f2536, 1);
  buttonBg.fillRoundedRect(panelX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(10));
  buttonBg.lineStyle(px(2), 0xd4b36a, 1);
  buttonBg.strokeRoundedRect(panelX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(10));
  container.add(buttonBg);

  const buttonLabel = scene.add
    .text(panelX, buttonY, '닫기', { fontFamily: TITLE_FONT, fontSize: `${px(15)}px`, color: '#ffd98a', fontStyle: 'bold' })
    .setOrigin(0.5);
  container.add(buttonLabel);

  const buttonZone = scene.add
    .zone(panelX, buttonY, buttonWidth, buttonHeight)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', close);
  container.add(buttonZone);

  dim.on('pointerdown', close);
}
