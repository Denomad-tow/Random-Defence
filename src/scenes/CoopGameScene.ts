import Phaser from 'phaser';
import {
  computeBoardLayout,
  resolveCorridorPoint,
  FIELD_ROWS,
  type BoardLayout,
} from '../core/board';
import { createInitialWaveState, nextSpawn, stageHpMultiplier, type WaveState } from '../core/wave';
import { MONSTER_KINDS, pickRandomSpecies, type MonsterKindId } from '../core/monsters';
import { pickRandomMapPreset, MAP_PRESETS, type MapPreset } from '../core/mapPresets';
import { createNightSkyGlowTexture, createStarFieldTexture, createMonsterTexture } from '../core/graphics/texture';
import type { MonsterShapeId } from '../core/graphics/monster';
import {
  currentRoomCode,
  leaveRoom,
  broadcastMonsterSync,
  setMonsterSyncHandler,
  setMembersHandler,
  getLatestMembers,
  type PartyMember,
  type MonsterSyncPayload,
} from '../meta/party';
import { px } from '../core/dpr';

const TITLE_FONT = '"Noto Serif KR", serif';
const SPAWN_INTERVAL_MS = 1100;
const FIRST_SPAWN_DELAY_MS = 2000;
const SYNC_INTERVAL_MS = 150;

interface HostMonster {
  id: number;
  kind: MonsterKindId;
  species: string;
  t: number;
  hp: number;
  maxHp: number;
  crawlSpeed: number;
  sprite: Phaser.GameObjects.Image;
}

interface GuestMonster {
  sprite: Phaser.GameObjects.Image;
  fromT: number;
  toT: number;
  snapshotAt: number;
}

// 5단계(협동 파티전) 실시간 동기화의 1번째 조각: 몬스터의 위치·체력을 방장
// 기기가 계산해서 실시간으로 나머지 파티원에게 전달하고, 파티원은 받은 대로
// 그대로 그린다. 아직 유닛 배치·공격은 연결되지 않은 "보기 전용" 단계다.
export class CoopGameScene extends Phaser.Scene {
  private isHost = false;
  private boardReady = false;
  private monsterPath!: Phaser.Curves.Path;
  private cellSize = 0;
  private boardStep = 0;
  private fieldBottomY = 0;
  private currentMap!: MapPreset;
  private waveState: WaveState = createInitialWaveState();

  private hostMonsters: HostMonster[] = [];
  private nextMonsterId = 1;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private firstSpawnTimer?: Phaser.Time.TimerEvent;
  private syncTimer?: Phaser.Time.TimerEvent;

  private guestMonsters = new Map<number, GuestMonster>();

  private members: PartyMember[] = [];
  private hudText?: Phaser.GameObjects.Text;
  private membersText?: Phaser.GameObjects.Text;

  constructor() {
    super('coop-game');
  }

  init(data: { isHost?: boolean }): void {
    this.isHost = !!data?.isHost;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#07080d');
    this.boardReady = false;
    this.waveState = createInitialWaveState();
    this.hostMonsters = [];
    this.nextMonsterId = 1;
    this.guestMonsters = new Map();
    this.members = getLatestMembers();

    this.events.once('shutdown', this.handleShutdown, this);
    setMembersHandler((members) => {
      this.members = members;
      this.refreshMembersText();
    });

    if (this.isHost) {
      this.currentMap = pickRandomMapPreset();
      this.layout();
      this.boardReady = true;
      this.startHostSimulation();
    } else {
      setMonsterSyncHandler((payload) => this.handleSnapshot(payload));
      this.layoutWaiting();
    }
  }

  update(_time: number, delta: number): void {
    if (!this.boardReady) return;

    if (this.isHost) {
      this.updateHostMonsters(delta);
    } else {
      this.updateGuestInterpolation();
    }
  }

  private updateHostMonsters(delta: number): void {
    const dt = delta / 1000;
    const pathLength = this.monsterPath.getLength();

    this.hostMonsters.forEach((m) => {
      const pxPerSec = m.crawlSpeed * this.boardStep;
      const tStep = pathLength > 0 ? (pxPerSec * dt) / pathLength : 0;
      m.t = Math.min(1, m.t + tStep);
      const point = this.monsterPath.getPoint(m.t);
      m.sprite.setPosition(point.x, point.y);
    });

    // 1단계에서는 아직 전투/패배 처리가 없어서, 끝에 도달한 몬스터는 그냥 사라진다.
    const reached = this.hostMonsters.filter((m) => m.t >= 1);
    if (reached.length > 0) {
      reached.forEach((m) => m.sprite.destroy());
      this.hostMonsters = this.hostMonsters.filter((m) => m.t < 1);
    }
  }

  // 파티원 쪽은 초당 몇 번(SYNC_INTERVAL_MS 간격)만 위치를 받기 때문에, 그 사이는
  // 이전 위치→새 위치를 부드럽게 이어서 그린다 (안 그러면 뚝뚝 끊겨 보인다).
  private updateGuestInterpolation(): void {
    const now = this.time.now;
    this.guestMonsters.forEach((entry) => {
      const t = this.interpolatedT(entry, now);
      const point = this.monsterPath.getPoint(t);
      entry.sprite.setPosition(point.x, point.y);
    });
  }

  private interpolatedT(entry: GuestMonster, now: number): number {
    const progress = Phaser.Math.Clamp((now - entry.snapshotAt) / SYNC_INTERVAL_MS, 0, 1);
    return Phaser.Math.Linear(entry.fromT, entry.toT, progress);
  }

  private handleShutdown(): void {
    this.firstSpawnTimer?.remove();
    this.spawnTimer?.remove();
    this.syncTimer?.remove();
    leaveRoom();
  }

  // ----- 호스트: 몬스터 시뮬레이션 -----

  private startHostSimulation(): void {
    this.firstSpawnTimer = this.time.delayedCall(FIRST_SPAWN_DELAY_MS, () => {
      this.spawnMonster();
      this.spawnTimer = this.time.addEvent({
        delay: SPAWN_INTERVAL_MS,
        loop: true,
        callback: () => this.spawnMonster(),
      });
    });

    this.syncTimer = this.time.addEvent({
      delay: SYNC_INTERVAL_MS,
      loop: true,
      callback: () => this.broadcastSnapshot(),
    });
  }

  private spawnMonster(): void {
    const result = nextSpawn(this.waveState);
    this.waveState = result.nextState;

    const kind = MONSTER_KINDS[result.kind];
    const species = pickRandomSpecies();
    const hp = Math.round(kind.baseHp * stageHpMultiplier(result.stage));

    const sprite = this.createMonsterSprite(result.kind, species.id);
    const start = this.monsterPath.getPoint(0);
    sprite.setPosition(start.x, start.y);

    this.hostMonsters.push({
      id: this.nextMonsterId++,
      kind: result.kind,
      species: species.id,
      t: 0,
      hp,
      maxHp: hp,
      crawlSpeed: kind.crawlSpeed,
      sprite,
    });

    this.refreshHud();
  }

  private broadcastSnapshot(): void {
    broadcastMonsterSync({
      mapId: this.currentMap.id,
      stage: this.waveState.stage,
      monsters: this.hostMonsters.map((m) => ({
        id: m.id,
        kind: m.kind,
        species: m.species,
        t: m.t,
        hp: m.hp,
        maxHp: m.maxHp,
      })),
    });
  }

  // ----- 파티원: 받은 스냅샷 그대로 그리기 -----

  private handleSnapshot(payload: MonsterSyncPayload): void {
    if (!this.boardReady) {
      const preset = MAP_PRESETS.find((m) => m.id === payload.mapId);
      if (!preset) return;
      this.currentMap = preset;
      this.layout();
      this.boardReady = true;
    }

    this.waveState = { ...this.waveState, stage: payload.stage };
    this.reconcileMonsters(payload.monsters);
    this.refreshHud();
  }

  private reconcileMonsters(snapshot: MonsterSyncPayload['monsters']): void {
    const now = this.time.now;
    const seen = new Set<number>();

    snapshot.forEach((m) => {
      seen.add(m.id);
      const existing = this.guestMonsters.get(m.id);

      if (!existing) {
        const sprite = this.createMonsterSprite(m.kind as MonsterKindId, m.species);
        const point = this.monsterPath.getPoint(m.t);
        sprite.setPosition(point.x, point.y);
        this.guestMonsters.set(m.id, { sprite, fromT: m.t, toT: m.t, snapshotAt: now });
        return;
      }

      // 지금 보간 중이던 위치를 새 시작점으로 삼아야 순간이동 없이 자연스럽게 이어진다.
      existing.fromT = this.interpolatedT(existing, now);
      existing.toT = m.t;
      existing.snapshotAt = now;
    });

    for (const [id, entry] of this.guestMonsters) {
      if (!seen.has(id)) {
        entry.sprite.destroy();
        this.guestMonsters.delete(id);
      }
    }
  }

  // ----- 공통: 그리기 -----

  private layoutWaiting(): void {
    this.children.removeAll(true);
    const { width, height } = this.scale;
    this.drawBackground(width, height);

    this.add
      .text(width / 2, height * 0.45, '방장이 전투를 준비하고 있어요...', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#9a917d',
      })
      .setOrigin(0.5);

    this.drawHeader(width, height);
  }

  private layout(): void {
    this.children.removeAll(true);
    this.guestMonsters = new Map();

    const { width, height } = this.scale;
    this.drawBackground(width, height);

    const headerHeight = height * 0.08;
    const fieldTop = height * 0.16;
    const fieldAreaHeight = height * 0.78;

    const boardLayout = computeBoardLayout(width, fieldTop, fieldAreaHeight);
    this.cellSize = boardLayout.cellSize;
    this.boardStep = boardLayout.cellSize + boardLayout.gap;

    const naturalFieldBottomY = boardLayout.originY + (FIELD_ROWS - 1) * this.boardStep + boardLayout.cellSize * 0.55;
    this.fieldBottomY = Math.min(naturalFieldBottomY, height * 0.94);

    const pathPoints = this.resolveMapPathPoints(boardLayout, headerHeight);
    this.monsterPath = this.buildCurve(pathPoints);
    this.drawPath(this.monsterPath);

    this.drawHeader(width, height);
  }

  private drawHeader(width: number, height: number): void {
    const headerHeight = height * 0.08;

    const exitButton = this.add
      .text(px(12), headerHeight * 0.4, '나가기', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(16.5)}px`,
        color: '#ff9a9a',
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('deck-select', { forceEdit: true }));
    exitButton.setPadding(px(6), px(6), px(6), px(6));

    this.add
      .text(width - px(12), headerHeight * 0.4, `방 ${currentRoomCode()}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#9a917d',
      })
      .setOrigin(1, 0.5);

    this.hudText = this.add
      .text(width / 2, headerHeight * 0.4, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.membersText = this.add
      .text(width / 2, headerHeight * 0.78, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(12)}px`,
        color: '#9fd8ff',
      })
      .setOrigin(0.5);

    this.refreshHud();
    this.refreshMembersText();
  }

  private refreshHud(): void {
    const count = this.isHost ? this.hostMonsters.length : this.guestMonsters.size;
    this.hudText?.setText(`협동 전투 (베타) · 스테이지 ${this.waveState.stage} · 몬스터 ${count}마리`);
  }

  private refreshMembersText(): void {
    const names = this.members.map((m) => `${m.nickname}${m.isHost ? '(방장)' : ''}`).join(', ');
    this.membersText?.setText(names ? `함께: ${names}` : '');
  }

  private drawBackground(width: number, height: number): void {
    const glowKey = `coop-bg-glow-${Math.round(width)}x${Math.round(height)}`;
    const glowSize = Math.round(Math.max(width, height) * 1.1);
    createNightSkyGlowTexture(this, glowKey, glowSize);
    this.add.image(width / 2, height * 0.02, glowKey).setOrigin(0.5, 0);

    const starKey = `coop-bg-stars-${Math.round(width)}x${Math.round(height)}`;
    createStarFieldTexture(this, starKey, Math.round(width), Math.round(height), 7);
    this.add.image(0, 0, starKey).setOrigin(0, 0).setAlpha(0.8);
  }

  private resolveMapPathPoints(boardLayout: BoardLayout, headerHeight: number): { x: number; y: number }[] {
    const waypoints = this.currentMap.waypoints;
    const entry = resolveCorridorPoint(waypoints[0].gapCol, waypoints[0].gapRow, boardLayout);
    const topPoint = { x: entry.x, y: headerHeight };

    const corridorPoints = waypoints.map((wp) => resolveCorridorPoint(wp.gapCol, wp.gapRow, boardLayout));
    const lastPoint = corridorPoints[corridorPoints.length - 1];
    corridorPoints[corridorPoints.length - 1] = { x: lastPoint.x, y: this.fieldBottomY };

    return [topPoint, ...corridorPoints];
  }

  private buildCurve(points: { x: number; y: number }[]): Phaser.Curves.Path {
    const curve = new Phaser.Curves.Path(points[0].x, points[0].y);
    curve.splineTo(points.slice(1).map((p) => new Phaser.Math.Vector2(p.x, p.y)));
    return curve;
  }

  private drawPath(curve: Phaser.Curves.Path): void {
    const samples = curve.getPoints(64);

    const outer = this.add.graphics();
    outer.lineStyle(px(9), 0x8a6a2c, 0.55);
    this.strokeThroughPoints(outer, samples);

    const inner = this.add.graphics();
    inner.lineStyle(px(3), 0xd4b36a, 0.9);
    this.strokeThroughPoints(inner, samples);
  }

  private strokeThroughPoints(graphics: Phaser.GameObjects.Graphics, points: Phaser.Math.Vector2[]): void {
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.strokePath();
  }

  private createMonsterSprite(kindId: MonsterKindId, speciesId: string): Phaser.GameObjects.Image {
    const kind = MONSTER_KINDS[kindId];
    const size = Math.round(this.cellSize * kind.sizeRatio);
    const textureKey = `coop-monster-${kindId}-${speciesId}-${size}`;
    createMonsterTexture(this, textureKey, size, { ...kind, shape: speciesId as MonsterShapeId });
    return this.add.image(0, 0, textureKey);
  }
}
