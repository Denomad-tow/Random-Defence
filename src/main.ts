import './style.css';
import Phaser from 'phaser';
import { PreviewScene } from './scenes/PreviewScene';

function startGame(): void {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: '#07080d',
    scene: [PreviewScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
  });
}

document.fonts.ready.then(startGame).catch(startGame);
