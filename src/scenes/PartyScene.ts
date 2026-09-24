import Phaser from 'phaser';
import { getCurrentNickname } from '../meta/auth';
import { mountPartyOverlay } from '../core/partyOverlay';
import { isRoomHost } from '../meta/party';

export class PartyScene extends Phaser.Scene {
  private overlay?: { unmount: (leaveChannel?: boolean) => void };

  constructor() {
    super('party');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#07080d');
    this.events.once('shutdown', this.handleShutdown, this);

    void getCurrentNickname().then((nickname) => {
      this.overlay = mountPartyOverlay(
        nickname ?? '',
        () => {
          this.scene.start('deck-select', { forceEdit: true });
        },
        () => this.handleGameStart(),
      );
    });
  }

  private handleGameStart(): void {
    // 방(Realtime 채널)은 유지한 채 화면만 전투 화면으로 넘어간다.
    this.overlay?.unmount(false);
    this.overlay = undefined;
    this.scene.start('coop-game', { isHost: isRoomHost() });
  }

  private handleShutdown(): void {
    this.overlay?.unmount();
    this.overlay = undefined;
  }
}
