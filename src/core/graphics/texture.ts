import type Phaser from 'phaser';
import { drawGem, type RarityPreset, type SigilDef } from './gem';
import { drawEmptySlot } from './slot';
import { drawNightSkyGlow, drawStarField } from './background';
import { drawShadowMonster, type MonsterVisual } from './monster';

export function createGemTexture(
  scene: Phaser.Scene,
  key: string,
  rarity: RarityPreset,
  sigil?: SigilDef,
  seed = 1,
  size = 160,
): void {
  if (scene.textures.exists(key)) return;

  const canvasTexture = scene.textures.createCanvas(key, size, size);
  if (!canvasTexture) return;

  const ctx = canvasTexture.getContext();
  drawGem(ctx, rarity, sigil, seed, size);
  canvasTexture.refresh();
}

export function createSlotTexture(scene: Phaser.Scene, key: string, size: number): void {
  if (scene.textures.exists(key)) return;

  const canvasTexture = scene.textures.createCanvas(key, size, size);
  if (!canvasTexture) return;

  const ctx = canvasTexture.getContext();
  drawEmptySlot(ctx, size);
  canvasTexture.refresh();
}

export function createNightSkyGlowTexture(scene: Phaser.Scene, key: string, size: number): void {
  if (scene.textures.exists(key)) return;

  const canvasTexture = scene.textures.createCanvas(key, size, size);
  if (!canvasTexture) return;

  const ctx = canvasTexture.getContext();
  drawNightSkyGlow(ctx, size);
  canvasTexture.refresh();
}

export function createMonsterTexture(scene: Phaser.Scene, key: string, size: number, visual: MonsterVisual): void {
  if (scene.textures.exists(key)) return;

  const canvasTexture = scene.textures.createCanvas(key, size, size);
  if (!canvasTexture) return;

  const ctx = canvasTexture.getContext();
  drawShadowMonster(ctx, size, visual);
  canvasTexture.refresh();
}

export function createStarFieldTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  seed = 1,
): void {
  if (scene.textures.exists(key)) return;

  const canvasTexture = scene.textures.createCanvas(key, width, height);
  if (!canvasTexture) return;

  const ctx = canvasTexture.getContext();
  drawStarField(ctx, width, height, seed);
  canvasTexture.refresh();
}
