import Phaser from 'phaser';
import { getCurrentNickname } from '../meta/auth';
import { mountPartyOverlay } from '../core/partyOverlay';
import { isRoomHost, type PartyMode } from '../meta/party';

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
        (mode) => this.handleGameStart(mode),
      );
    });
  }

  private handleGameStart(mode: PartyMode): void {
    // 방(Realtime 채널)은 유지한 채 화면만 전투 화면으로 넘어간다.
    this.overlay?.unmount(false);
    this.overlay = undefined;

    if (mode === 'coop') {
      this.scene.start('coop-game', { isHost: isRoomHost() });
    } else {
      this.scene.start('versus-game', { isHost: isRoomHost(), mode });
    }
  }

  private handleShutdown(): void {
    this.overlay?.unmount();
    this.overlay = undefined;
  }
}
