import './style.css';
import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { DeckSelectScene } from './scenes/DeckSelectScene';
import { BoxScene } from './scenes/BoxScene';
import { CollectionScene } from './scenes/CollectionScene';
import { ResearchScene } from './scenes/ResearchScene';
import { MailboxScene } from './scenes/MailboxScene';
import { CodexScene } from './scenes/CodexScene';
import { PartyScene } from './scenes/PartyScene';
import { DPR } from './core/dpr';
import { hasSession } from './meta/auth';
import { mountLoginOverlay } from './core/loginOverlay';
import { pullSnapshot, startCloudSync } from './core/cloudSync';

function startGame(): void {
  const cssWidth = window.innerWidth;
  const cssHeight = window.innerHeight;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: '#07080d',
    scene: [DeckSelectScene, GameScene, BoxScene, CollectionScene, ResearchScene, MailboxScene, CodexScene, PartyScene],
    scale: {
      mode: Phaser.Scale.NONE,
      zoom: 1 / DPR,
      width: cssWidth * DPR,
      height: cssHeight * DPR,
    },
  });

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    game.scale.setGameSize(w * DPR, h * DPR);
    game.canvas.style.width = `${w}px`;
    game.canvas.style.height = `${h}px`;
  });
}

async function startAfterAuth(): Promise<void> {
  await pullSnapshot();
  startGame();
  startCloudSync();
}

async function boot(): Promise<void> {
  await document.fonts.ready.catch(() => undefined);

  if (await hasSession()) {
    await startAfterAuth();
    return;
  }

  mountLoginOverlay(() => {
    void startAfterAuth();
  });
}

boot();
