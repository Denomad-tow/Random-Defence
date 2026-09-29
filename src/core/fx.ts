import Phaser from 'phaser';
import { px } from './dpr';

// 전투 연출(발사체·반짝임·데미지 숫자·상태 링·몬스터 길)을 "가볍게" 그리는 도구 모음.
//
// 왜 필요한가: Phaser의 도형(원·선·둥근 사각형 등 Graphics/Shape)은 화면에 그려질 때마다 매 프레임
// 삼각형으로 다시 쪼개는 계산(earcut)을 한다. 스테이지가 높아져 몬스터와 공격이 많아지면 이 계산이
// 프레임을 크게 잡아먹어 화면이 끊긴다. 그래서
//   - 자주 나오는 원/링은 "미리 만든 이미지 한 장"을 색만 바꿔 재사용하고(오브젝트 풀),
//   - 움직이지 않는 그림(몬스터 길, 버튼 배경)은 한 번만 이미지로 구워서 쓰고,
//   - 데미지 숫자는 동시에 보이는 개수를 제한하고 재사용한다.

const DOT_KEY = 'fx-dot';
const RING_KEY = 'fx-ring';
const GLOW_KEY = 'fx-glow';
const TEXTURE_SIZE = 64;
const GLOW_TEXTURE_SIZE = 128;

const pools = new WeakMap<Phaser.Scene, Phaser.GameObjects.Image[]>();

// 흰색 원 / 흰색 링 / 부드러운 빛무리 텍스처를 한 번만 만든다. 나중에 tint(색 입히기)로 원하는 색을 낸다.
export function ensureFxTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(DOT_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(TEXTURE_SIZE / 2, TEXTURE_SIZE / 2, TEXTURE_SIZE / 2 - 1);
    g.generateTexture(DOT_KEY, TEXTURE_SIZE, TEXTURE_SIZE);
    g.destroy();
  }
  if (!scene.textures.exists(RING_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(5, 0xffffff, 1);
    g.strokeCircle(TEXTURE_SIZE / 2, TEXTURE_SIZE / 2, TEXTURE_SIZE / 2 - 4);
    g.generateTexture(RING_KEY, TEXTURE_SIZE, TEXTURE_SIZE);
    g.destroy();
  }
  if (!scene.textures.exists(GLOW_KEY)) {
    // 가운데는 밝고 가장자리로 갈수록 옅어지는 원. 합성 별 표시처럼 "빛나는 기운"을 표현할 때 쓴다.
    const canvasTexture = scene.textures.createCanvas(GLOW_KEY, GLOW_TEXTURE_SIZE, GLOW_TEXTURE_SIZE);
    if (canvasTexture) {
      const ctx = canvasTexture.getContext();
      const r = GLOW_TEXTURE_SIZE / 2;
      const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, GLOW_TEXTURE_SIZE, GLOW_TEXTURE_SIZE);
      canvasTexture.refresh();
    }
  }
}

function acquire(scene: Phaser.Scene, key: string): Phaser.GameObjects.Image {
  ensureFxTextures(scene);
  const list = pools.get(scene) ?? [];
  pools.set(scene, list);

  let image: Phaser.GameObjects.Image | undefined;
  while (list.length > 0) {
    const candidate = list.pop()!;
    // 화면을 다시 그리면서 파괴된 오브젝트(scene이 비어 있음)는 버린다.
    if (candidate.scene) {
      image = candidate;
      break;
    }
  }
  if (!image) image = scene.add.image(0, 0, key);

  return image
    .setTexture(key)
    .setActive(true)
    .setVisible(true)
    .setAlpha(1)
    .setScale(1)
    .setDepth(0)
    .setBlendMode(Phaser.BlendModes.NORMAL);
}

export function releaseFx(image: Phaser.GameObjects.Image): void {
  if (!image.scene) return;
  const scene = image.scene;
  image.setActive(false).setVisible(false);
  const list = pools.get(scene) ?? [];
  pools.set(scene, list);
  list.push(image);
}

// 반지름 radius(화면 픽셀)의 색 있는 원 하나.
export function fxDot(scene: Phaser.Scene, x: number, y: number, radius: number, color: number, alpha = 1): Phaser.GameObjects.Image {
  const image = acquire(scene, DOT_KEY);
  return image.setPosition(x, y).setDisplaySize(radius * 2, radius * 2).setTint(color).setAlpha(alpha);
}

// 반지름 radius의 색 있는 링(테두리만).
export function fxRing(scene: Phaser.Scene, x: number, y: number, radius: number, color: number, alpha = 1): Phaser.GameObjects.Image {
  const image = acquire(scene, RING_KEY);
  return image.setPosition(x, y).setDisplaySize(radius * 2, radius * 2).setTint(color).setAlpha(alpha);
}

// 가운데가 밝고 가장자리가 옅어지는 빛무리(가산 혼합이라 어두운 배경 위에서 색이 또렷하게 도드라진다).
// 합성으로 별이 높아진 강한 유닛을 표시하는 등, "은은한 기운"을 표현할 때 fxDot/fxRing보다 잘 보인다.
export function fxGlow(scene: Phaser.Scene, x: number, y: number, radius: number, color: number, alpha = 1): Phaser.GameObjects.Image {
  const image = acquire(scene, GLOW_KEY);
  return image
    .setPosition(x, y)
    .setDisplaySize(radius * 2, radius * 2)
    .setTint(color)
    .setAlpha(alpha)
    .setBlendMode(Phaser.BlendModes.ADD);
}

// 원 하나를 움직이거나 사라지게 한 뒤 풀에 돌려준다.
export function fxTween(
  scene: Phaser.Scene,
  image: Phaser.GameObjects.Image,
  props: { x?: number; y?: number; alpha?: number; scale?: number },
  duration: number,
  onComplete?: () => void,
): void {
  scene.tweens.add({
    targets: image,
    ...props,
    duration,
    onComplete: () => {
      releaseFx(image);
      onComplete?.();
    },
  });
}

// 동시에 켜져 있는 반짝임(꼬리 불꽃 등) 수를 제한한다. 많을 때는 그리지 않아 프레임을 지킨다.
let activeSparks = 0;
const MAX_ACTIVE_SPARKS = 36;

export function trySpark(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  color: number,
  alpha: number,
  duration: number,
  move?: { x: number; y: number },
): void {
  if (activeSparks >= MAX_ACTIVE_SPARKS) return;
  activeSparks += 1;
  const spark = fxDot(scene, x, y, radius, color, alpha);
  fxTween(scene, spark, { alpha: 0, ...(move ?? {}) }, duration, () => {
    activeSparks = Math.max(0, activeSparks - 1);
  });
}

// 동시에 떠 있는 발사체 그림 수도 제한한다(공격이 아주 많을 때는 그림 없이 효과만 적용).
let activeProjectiles = 0;
export const MAX_ACTIVE_PROJECTILES = 60;

export function projectileSlotFree(): boolean {
  return activeProjectiles < MAX_ACTIVE_PROJECTILES;
}
export function projectileStarted(): void {
  activeProjectiles += 1;
}
export function projectileEnded(): void {
  activeProjectiles = Math.max(0, activeProjectiles - 1);
}

// ----- 데미지 숫자: 재사용 + 동시 개수 제한 -----

interface TextPool {
  free: Phaser.GameObjects.Text[];
  active: number;
}
const textPools = new WeakMap<Phaser.Scene, TextPool>();
const MAX_ACTIVE_TEXTS = 22;
const TITLE_FONT = '"Noto Serif KR", serif';

export function fxText(scene: Phaser.Scene, x: number, y: number, message: string, color: string): void {
  const pool = textPools.get(scene) ?? { free: [], active: 0 };
  textPools.set(scene, pool);
  if (pool.active >= MAX_ACTIVE_TEXTS) return;

  let text: Phaser.GameObjects.Text | undefined;
  while (pool.free.length > 0) {
    const candidate = pool.free.pop()!;
    if (candidate.scene) {
      text = candidate;
      break;
    }
  }
  if (!text) {
    text = scene.add.text(0, 0, '', { fontFamily: TITLE_FONT, fontSize: `${px(13)}px`, color }).setOrigin(0.5);
  }

  text.setText(message).setColor(color).setPosition(x, y - px(10)).setAlpha(1).setActive(true).setVisible(true);
  pool.active += 1;

  scene.tweens.add({
    targets: text,
    y: y - px(40),
    alpha: 0,
    duration: 550,
    onComplete: () => {
      pool.active = Math.max(0, pool.active - 1);
      if (!text!.scene) return;
      text!.setActive(false).setVisible(false);
      pool.free.push(text!);
    },
  });
}

// ----- 움직이지 않는 그림을 한 번만 이미지로 구워서 쓰기 -----

// 몬스터가 지나가는 길(굵은 선 + 점)을 이미지 한 장으로 만든다. 예전에는 선과 점 40여 개를
// 도형으로 매 프레임 다시 그려서 화면이 무거웠다.
export function bakePathImage(scene: Phaser.Scene, curve: Phaser.Curves.Path): Phaser.GameObjects.Image {
  const samples = curve.getPoints(64);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let signature = 0;
  samples.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    signature = (signature * 31 + Math.round(p.x) * 7 + Math.round(p.y)) % 1000003;
  });

  const pad = px(12);
  const originX = minX - pad;
  const originY = minY - pad;
  const width = Math.ceil(maxX - minX + pad * 2);
  const height = Math.ceil(maxY - minY + pad * 2);
  const key = `baked-path-${width}x${height}-${signature}`;

  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const stroke = (lineWidth: number, color: number, alpha: number): void => {
      g.lineStyle(lineWidth, color, alpha);
      g.beginPath();
      g.moveTo(samples[0].x - originX, samples[0].y - originY);
      for (let i = 1; i < samples.length; i += 1) g.lineTo(samples[i].x - originX, samples[i].y - originY);
      g.strokePath();
    };
    stroke(px(9), 0x8a6a2c, 0.55);
    stroke(px(3), 0xd4b36a, 0.9);
    g.fillStyle(0xf3dc9a, 0.9);
    curve.getSpacedPoints(40).forEach((p) => g.fillCircle(p.x - originX, p.y - originY, px(2.5)));
    g.generateTexture(key, width, height);
    g.destroy();
  }

  return scene.add.image(originX, originY, key).setOrigin(0, 0);
}

// 둥근 사각형 버튼 배경을 이미지로 구워서 쓴다(상태별로 한 번씩만 만든다).
export function roundedRectTexture(
  scene: Phaser.Scene,
  width: number,
  height: number,
  radius: number,
  fillColor: number,
  fillAlpha: number,
  lineColor: number,
  lineWidth: number,
  tag: string,
): string {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  const key = `rrect-${tag}-${w}x${h}`;
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(fillColor, fillAlpha);
    g.fillRoundedRect(lineWidth, lineWidth, w - lineWidth * 2, h - lineWidth * 2, radius);
    g.lineStyle(lineWidth, lineColor, 0.9);
    g.strokeRoundedRect(lineWidth, lineWidth, w - lineWidth * 2, h - lineWidth * 2, radius);
    g.generateTexture(key, w, h);
    g.destroy();
  }
  return key;
}

// 배속(1x 2x 4x 8x) 버튼 배경: 켜진/꺼진 두 가지 모양만 있어서 이미지로 구워서 쓴다.
export function speedButtonTexture(scene: Phaser.Scene, width: number, active: boolean): string {
  return roundedRectTexture(
    scene,
    width,
    px(22),
    px(6),
    active ? 0x2a2416 : 0x1f2536,
    1,
    active ? 0xd4b36a : 0x555555,
    px(1.5),
    `spd${active ? 1 : 0}`,
  );
}
