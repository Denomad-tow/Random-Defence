import Phaser from 'phaser';
import { ROLE_CATEGORIES, type UnitDef } from './units';
import { getRarity } from './graphics/gem';
import { ROLE_SIGILS } from './graphics/sigils';
import { createGemTexture } from './graphics/texture';
import { detailLines } from './unitDescription';
import { px } from './dpr';

const TITLE_FONT = '"Noto Serif KR", serif';

// 유닛 하나의 도감 정보를 보여주는 팝업(이름·등급·능력치·특성 상세 설명). 덱 선택 화면과
// 도감 화면에서 같이 쓴다. 내용(설명 줄 수)에 맞춰 팝업 높이가 저절로 정해진다.
export function showUnitInfoModal(scene: Phaser.Scene, unit: UnitDef): void {
  const { width, height } = scene.scale;
  const container = scene.add.container(0, 0).setDepth(700);
  const close = (): void => container.destroy();

  const dim = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72).setInteractive();
  container.add(dim);

  const rarity = getRarity(unit.rarity);
  const rarityColor = Phaser.Display.Color.HexStringToColor(rarity.c1).color;
  const panelWidth = Math.min(width * 0.9, px(420));
  const panelX = width / 2;
  const textWidth = panelWidth * 0.84;
  const pad = px(20);

  const iconSize = Math.min(panelWidth * 0.26, px(96));
  const iconKey = `unitinfo-${unit.id}-${Math.round(iconSize)}`;
  createGemTexture(scene, iconKey, rarity, ROLE_SIGILS[unit.role], 1, Math.round(iconSize));
  const icon = scene.add.image(panelX, 0, iconKey).setDisplaySize(iconSize, iconSize);

  const nameText = scene.add
    .text(panelX, 0, unit.name, { fontFamily: TITLE_FONT, fontSize: `${px(18)}px`, color: '#f6e6b4', fontStyle: 'bold' })
    .setOrigin(0.5, 0);

  const category = ROLE_CATEGORIES[unit.role] ?? '';
  const subtitleText = scene.add
    .text(panelX, 0, category ? `${rarity.label} · ${category}` : rarity.label, {
      fontFamily: TITLE_FONT,
      fontSize: `${px(13)}px`,
      color: rarity.c1,
      fontStyle: 'bold',
    })
    .setOrigin(0.5, 0);

  const statParts: string[] = [];
  if (unit.attack > 0) statParts.push(`공격 ${unit.attack}`, `초당 ${unit.attackSpeed}회`);
  statParts.push(`사거리 ${unit.range}칸`);
  const statsText = scene.add
    .text(panelX, 0, statParts.join('  ·  '), {
      fontFamily: TITLE_FONT,
      fontSize: `${px(13)}px`,
      color: '#ffd98a',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: textWidth },
    })
    .setOrigin(0.5, 0);

  const lineTexts = detailLines(unit).map((line) =>
    scene.add
      .text(panelX - textWidth / 2, 0, `• ${line}`, {
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
  const gap = px(10);

  const stack: Array<{ obj: Phaser.GameObjects.Text | Phaser.GameObjects.Image; h: number; after: number }> = [
    { obj: icon, h: iconSize, after: gap },
    { obj: nameText, h: nameText.height, after: gap * 0.4 },
    { obj: subtitleText, h: subtitleText.height, after: gap },
    { obj: statsText, h: statsText.height, after: gap * 1.4 },
    ...lineTexts.map((t) => ({ obj: t, h: t.height, after: gap * 0.8 })),
  ];
  const contentHeight = stack.reduce((sum, item) => sum + item.h + item.after, 0);
  const panelHeight = Math.min(pad * 2 + contentHeight + buttonHeight + gap * 1.2, height * 0.94);
  const top = (height - panelHeight) / 2;

  const panel = scene.add.graphics();
  panel.fillStyle(0x151a28, 0.98);
  panel.fillRoundedRect(panelX - panelWidth / 2, top, panelWidth, panelHeight, px(14));
  panel.lineStyle(px(2.5), rarityColor, 1);
  panel.strokeRoundedRect(panelX - panelWidth / 2, top, panelWidth, panelHeight, px(14));
  container.add(panel);

  let cursorY = top + pad;
  stack.forEach((item) => {
    const isIcon = item.obj === icon;
    item.obj.setY(isIcon ? cursorY + item.h / 2 : cursorY);
    container.add(item.obj);
    cursorY += item.h + item.after;
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

  const closeIcon = scene.add
    .text(panelX + panelWidth / 2 - px(22), top + px(20), '✕', {
      fontFamily: TITLE_FONT,
      fontSize: `${px(18)}px`,
      color: '#9a917d',
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', close);
  container.add(closeIcon);
}
