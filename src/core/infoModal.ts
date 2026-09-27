import Phaser from 'phaser';
import { px } from './dpr';

const TITLE_FONT = '"Noto Serif KR", serif';

export interface InfoModalButton {
  label: string;
  onClick: () => void;
  primary?: boolean; // true면 금색으로 강조
}

export interface InfoModalContent {
  title: string;
  subtitle?: string;
  lines: string[]; // 한 줄씩 보여줄 설명(길면 알아서 줄바꿈)
  accent?: number; // 테두리 색
  // 없으면 "닫기" 버튼 하나만 나온다. 있으면 이 버튼들이 세로로 나열되고, 누르면 팝업이 닫힌 뒤 onClick이 실행된다.
  buttons?: InfoModalButton[];
  onClose?: () => void; // 팝업이 닫힐 때(버튼을 눌러도, 바깥을 눌러도) 한 번 불린다
}

// 제목 + 설명 몇 줄 + 버튼을 보여주는 간단한 팝업(연구·컬렉션 안내, 일괄 레벨업 확인 등).
// 내용 길이에 맞춰 높이가 정해지고, 바깥을 누르면 닫힌다.
export function showInfoModal(scene: Phaser.Scene, content: InfoModalContent): void {
  const { width, height } = scene.scale;
  const container = scene.add.container(0, 0).setDepth(700);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    container.destroy();
    content.onClose?.();
  };

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

  const makeLines = (fontSize: number): Phaser.GameObjects.Text[] =>
    content.lines.map((line) =>
      scene.add
        .text(panelX - textWidth / 2, 0, line, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(fontSize)}px`,
          color: '#c9c2af',
          wordWrap: { width: textWidth },
          lineSpacing: px(fontSize >= 12 ? 3 : 1),
        })
        .setOrigin(0, 0),
    );
  let lineTexts = makeLines(13);

  const buttons: InfoModalButton[] = content.buttons && content.buttons.length > 0 ? content.buttons : [{ label: '닫기', onClick: () => undefined, primary: true }];
  const buttonWidth = panelWidth * (buttons.length > 1 ? 0.78 : 0.5);
  const buttonHeight = buttons.length > 4 ? px(34) : px(42);
  const buttonsHeight = buttons.length * buttonHeight + (buttons.length - 1) * px(8);

  const buildStack = (): Array<{ obj: Phaser.GameObjects.Text; after: number }> => {
    const list: Array<{ obj: Phaser.GameObjects.Text; after: number }> = [{ obj: titleText, after: gap * 0.6 }];
    if (subtitleText) list.push({ obj: subtitleText, after: gap * 1.2 });
    lineTexts.forEach((t) => list.push({ obj: t, after: gap * 0.9 }));
    return list;
  };
  const measure = (list: Array<{ obj: Phaser.GameObjects.Text; after: number }>): number =>
    pad * 2 + list.reduce((sum, item) => sum + item.obj.height + item.after, 0) + buttonsHeight + gap * 0.6;

  // 내용이 화면에 다 들어오지 않으면 줄 글자를 조금씩 줄여서 다시 만든다.
  let stack = buildStack();
  for (const size of [12, 11, 10, 9]) {
    if (measure(stack) <= height * 0.94) break;
    lineTexts.forEach((t) => t.destroy());
    lineTexts = makeLines(size);
    stack = buildStack();
  }
  const panelHeight = Math.min(measure(stack), height * 0.94);
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

  buttons.forEach((button, i) => {
    const buttonY = top + panelHeight - pad - buttonsHeight + i * (buttonHeight + px(8)) + buttonHeight / 2;
    const bg = scene.add.graphics();
    bg.fillStyle(button.primary ? 0x2a2416 : 0x1f2536, 1);
    bg.fillRoundedRect(panelX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(10));
    bg.lineStyle(px(2), button.primary ? 0xffd98a : 0x8a8272, 1);
    bg.strokeRoundedRect(panelX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(10));
    container.add(bg);

    const label = scene.add
      .text(panelX, buttonY, button.label, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: button.primary ? '#ffd98a' : '#c9c2af',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    container.add(label);

    const zone = scene.add
      .zone(panelX, buttonY, buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        close();
        button.onClick();
      });
    container.add(zone);
  });

  dim.on('pointerdown', close);
}
