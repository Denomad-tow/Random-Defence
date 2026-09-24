import Phaser from 'phaser';
import { getCurrentNickname } from '../meta/auth';
import { mountPartyOverlay } from '../core/partyOverlay';

export class PartyScene extends Phaser.Scene {
  private overlay?: { unmount: () => void };

  constructor() {
    super('party');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#07080d');
    this.events.once('shutdown', this.handleShutdown, this);

    void getCurrentNickname().then((nickname) => {
      this.overlay = mountPartyOverlay(nickname ?? '', () => {
        this.scene.start('deck-select', { forceEdit: true });
      });
    });
  }

  private handleShutdown(): void {
    this.overlay?.unmount();
    this.overlay = undefined;
  }
}
