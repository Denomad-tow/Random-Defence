import './style.css';
import Phaser from 'phaser';
import { PreviewScene } from './scenes/PreviewScene';

function startGame(): void {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    width: 960,
    height: 540,
    backgroundColor: '#07080d',
    scene: [PreviewScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });
}

document.fonts.ready.then(startGame).catch(startGame);
