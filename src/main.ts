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
import { CoopGameScene } from './scenes/CoopGameScene';
import { VersusGameScene } from './scenes/VersusGameScene';
import { RankingScene } from './scenes/RankingScene';
import { SoundTestScene } from './scenes/SoundTestScene';
import { PatchNotesScene } from './scenes/PatchNotesScene';
import { installAudioUnlock } from './core/audio';
import { playSfx } from './core/sfx';
import { DPR } from './core/dpr';
import { hasSession, getCurrentNickname } from './meta/auth';
import { connectGlobalChat } from './meta/globalChat';
import { mountLoginOverlay } from './core/loginOverlay';
import { pullSnapshot, startCloudSync } from './core/cloudSync';

function startGame(): void {
  const cssWidth = window.innerWidth;
  const cssHeight = window.innerHeight;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: '#07080d',
    scene: [
      DeckSelectScene,
      GameScene,
      BoxScene,
      CollectionScene,
      ResearchScene,
      MailboxScene,
      CodexScene,
      PartyScene,
      CoopGameScene,
      VersusGameScene,
      RankingScene,
      SoundTestScene,
      PatchNotesScene,
    ],
    scale: {
      mode: Phaser.Scale.NONE,
      zoom: 1 / DPR,
      width: cssWidth * DPR,
      height: cssHeight * DPR,
    },
  });

  // 첫 터치 때 소리를 켜고, 모든 화면에 공통 소리(버튼 누르기·화면 전환)를 붙인다.
  installAudioUnlock();
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scene.getScenes(false).forEach((scene) => {
      scene.events.on(Phaser.Scenes.Events.CREATE, () => {
        playSfx('screen');
        scene.input.on('gameobjectdown', () => playSfx('click'));
      });
    });
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
  const nickname = await getCurrentNickname();
  if (nickname) connectGlobalChat(nickname);
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
