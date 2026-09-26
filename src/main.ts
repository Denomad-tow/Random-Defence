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
import { AchievementsScene } from './scenes/AchievementsScene';
import { installAudioUnlock } from './core/audio';
import { installKeyboardInset } from './core/keyboardInset';
import { installErrorBanner } from './core/errorBanner';
import { playSfx } from './core/sfx';
import { DPR } from './core/dpr';
import { hasSession, getCurrentNickname } from './meta/auth';
import { connectGlobalChat } from './meta/globalChat';
import { mountLoginOverlay } from './core/loginOverlay';
import { pullSnapshot, startCloudSync } from './core/cloudSync';

// 아이폰의 노치(상단 카메라 영역)·홈 바(하단) 때문에 화면 위아래가 가려지는 부분의 크기를 잰다.
// (홈 화면에 설치한 앱은 상태바 뒤까지 화면이 확장돼서, 이 영역을 피해서 그리지 않으면 위쪽 버튼이 가려진다.)
function readSafeInsets(): { top: number; bottom: number } {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
  probe.remove();
  return insets;
}

function currentGameSize(): { width: number; height: number } {
  const insets = readSafeInsets();
  return { width: window.innerWidth, height: Math.max(200, window.innerHeight - insets.top - insets.bottom) };
}

function isTypingInDom(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

function startGame(): void {
  const { width: cssWidth, height: cssHeight } = currentGameSize();

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
      AchievementsScene,
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
  installKeyboardInset();
  installErrorBanner();
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scene.getScenes(false).forEach((scene) => {
      scene.events.on(Phaser.Scenes.Events.CREATE, () => {
        playSfx('screen');
        scene.input.on('gameobjectdown', () => playSfx('click'));
      });
    });
  });

  // 화면 크기가 바뀔 때만 게임 크기를 맞춘다. 다음 경우에는 무시해서, 전투 중 화면이 초기화되거나 멈추지 않게 한다.
  //  - 채팅 입력 중(휴대폰 키보드가 올라와 화면 높이가 바뀜)
  //  - 전투 중에 가로폭은 그대로이고 높이만 바뀔 때(주소창이 접히거나 나타남)
  let lastWidth = cssWidth;
  let lastHeight = cssHeight;
  let resizeTimer: number | undefined;
  const GAME_SCENES = ['game', 'coop-game', 'versus-game'];

  const applySize = (): void => {
    const size = currentGameSize();
    if (Math.abs(size.width - lastWidth) < 1 && Math.abs(size.height - lastHeight) < 1) return;
    const inBattle = GAME_SCENES.some((key) => game.scene.isActive(key));
    if (inBattle && Math.abs(size.width - lastWidth) < 1) return;
    lastWidth = size.width;
    lastHeight = size.height;
    game.scale.setGameSize(size.width * DPR, size.height * DPR);
    game.canvas.style.width = `${size.width}px`;
    game.canvas.style.height = `${size.height}px`;
  };

  window.addEventListener('resize', () => {
    if (isTypingInDom()) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(applySize, 150);
  });

  // 키보드를 닫은 뒤에는 (iOS가 화면을 위로 밀어 올린 채로 두는 일이 있어서) 화면을 원위치로 돌리고 크기를 다시 맞춘다.
  document.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (isTypingInDom()) return;
      window.scrollTo(0, 0);
      applySize();
    }, 250);
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
