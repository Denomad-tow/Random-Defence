import type Phaser from 'phaser';
import { drawGem, type RarityPreset, type SigilDef } from './gem';

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
