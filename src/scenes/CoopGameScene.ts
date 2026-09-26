import Phaser from 'phaser';
import {
  computeBoardLayout,
  getCellPositions,
  cellIndex,
  resolveCorridorPoint,
  toOrthogonalPath,
  FIELD_ROWS,
  type BoardLayout,
  type CellPosition,
} from '../core/board';
import { createInitialWaveState, nextSpawn, stageHpMultiplier, type WaveState } from '../core/wave';
import { coopHpMultiplier } from '../core/coopBalance';
import { MONSTER_KINDS, pickRandomSpecies, type MonsterKindId } from '../core/monsters';
import { pickRandomMapPreset, MAP_PRESETS, type MapPreset } from '../core/mapPresets';
import { NORMAL_UNITS, type UnitDef } from '../core/units';
import {
  createInitialEconomy,
  type EconomyState,
} from '../core/economy';
import { loadDeckSlot, loadActiveSlot } from '../meta/deck';
import { getCurrentNickname } from '../meta/auth';
import { recordCoopResult } from '../meta/versusRanking';
import { computeRunReward, type RunReward } from '../meta/rewards';
import { addGold } from '../meta/gold';
import { addBox } from '../meta/boxes';
import { flushSnapshot } from '../core/cloudSync';
import { getBoxType } from '../meta/gacha';
import {
  createNightSkyGlowTexture,
  createStarFieldTexture,
  createMonsterTexture,
  createSlotTexture,
} from '../core/graphics/texture';
import type { MonsterShapeId } from '../core/graphics/monster';
import {
  currentRoomCode,
  leaveRoom,
  broadcastMonsterSync,
  setMonsterSyncHandler,
  setMembersHandler,
  setDamageHandler,
  broadcastDamage,
  setKillRewardHandler,
  broadcastKillReward,
  setGameOverHandler,
  broadcastGameOver,
  setGameSpeedHandler,
  broadcastGameSpeed,
  getLatestMembers,
  setChatHandler,
  broadcastChat,
  setAuraHandler,
  broadcastAura,
  type DamageEventPayload,
  type AuraPayload,
  type PartyMember,
  type MonsterSyncPayload,
} from '../meta/party';
import { mountChatOverlay, type ChatHandle } from '../core/chatOverlay';
import { px } from '../core/dpr';
import { effectiveSpeedMultiplier, type StatusEffects } from '../core/combat';
import {
  attackTargetCount,
  applyFrostAura,
  computeBuffBonuses,
  frostAuraValue,
  goldGenInfo,
  nearestMonsters,
  resolveHit,
  rollManaLeech,
  statusFlags,
  tickMonsterStatus,
  type BuffSource,
  type FxMonster,
  type HitResult,
} from '../core/effectsEngine';
import { drawStatusRings } from '../core/statusRings';
import { PlayerField } from '../core/playerField';
import { playSfx } from '../core/sfx';
import { playProjectile, spawnDeathBurst } from '../core/combatVfx';

const TITLE_FONT = '"Noto Serif KR", serif';
const SPAWN_INTERVAL_MS = 1100;
const FIRST_SPAWN_DELAY_MS = 2000;
const SYNC_INTERVAL_MS = 150;
const MAX_MONSTERS_ON_FIELD = 100;

interface HostMonster {
  id: number;
  kind: MonsterKindId;
  species: string;
  t: number;
  hp: number;
  maxHp: number;
  crawlSpeed: number;
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  status: StatusEffects;
}

interface GuestMonster {
  flags: number;
  sprite: Phaser.GameObjects.Image;
  fromT: number;
  toT: number;
  snapshotAt: number;
  intervalMs: number;
}

// 5단계(협동 파티전) 실시간 동기화 3번째 조각: 몬스터가 너무 많이 쌓이면(필드가
// 뚫리면) 파티 전체가 함께 전투를 종료하고 보상을 나눠 받는다. 몬스터 길과 체력이
// 파티 전체가 공유하는 하나뿐이라 "나만 뚫리는" 상황이 없기 때문에, 개인별로
// 나누지 않고 다 같이 끝내는 것으로 정했다 (CLAUDE.md 11장 참고).
// 유닛 특수 효과(감속·기절·독·광역 등)는 core/effectsEngine.ts가 계산한다. 아직 합성·
// 강화는 연결 안 됨.
export class CoopGameScene extends Phaser.Scene {
  private isHost = false;
  private boardReady = false;
  private gameOver = false;
  private monsterPath!: Phaser.Curves.Path;
  private boardCells: CellPosition[] = [];
  private cellSize = 0;
  private boardStep = 0;
  private fieldBottomY = 0;
  private currentMap!: MapPreset;
  private waveState: WaveState = createInitialWaveState();

  private hostMonsters: HostMonster[] = [];
  private statusGraphics?: Phaser.GameObjects.Graphics;
  private auraSendClock = 0;
  private nextMonsterId = 1;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private firstSpawnTimer?: Phaser.Time.TimerEvent;
  private syncTimer?: Phaser.Time.TimerEvent;
  private hostMissingTimer?: Phaser.Time.TimerEvent;

  private guestMonsters = new Map<number, GuestMonster>();

  private economy: EconomyState = createInitialEconomy();
  private field!: PlayerField;
  private deckUnitIds: string[] = [];
  private nickname = '';

  private members: PartyMember[] = [];
  private hudText?: Phaser.GameObjects.Text;
  private membersText?: Phaser.GameObjects.Text;
  private confirmModalContainer?: Phaser.GameObjects.Container;
  private gameSpeed = 1;
  private speedButtonRefs = new Map<number, { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text }>();
  private speedText?: Phaser.GameObjects.Text;
  private chat?: ChatHandle;

  constructor() {
    super('coop-game');
  }

  init(data: { isHost?: boolean }): void {
    this.isHost = !!data?.isHost;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#07080d');
    this.boardReady = false;
    this.gameOver = false;
    this.waveState = createInitialWaveState();
    this.hostMonsters = [];
    this.nextMonsterId = 1;
    this.guestMonsters = new Map();
    this.economy = createInitialEconomy();
    this.field = new PlayerField({
      scene: this,
      geometry: () => ({ cells: this.boardCells, cellSize: this.cellSize, boardStep: this.boardStep }),
      economy: () => this.economy,
      setEconomy: (next) => {
        this.economy = next;
      },
      onEconomyChange: () => this.refreshHud(),
      deckPool: () => this.deckPool(),
      confirm: (options) => this.showConfirmModal(options),
      floatText: (x, y, message, color) => this.spawnFloatingText(x, y, message, color),
      useMetaBonuses: true,
    });
    this.field.registerDragHandlers();
    this.members = getLatestMembers();
    this.gameSpeed = 1;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;

    const savedDeck = loadDeckSlot(loadActiveSlot()) ?? [];
    this.deckUnitIds = savedDeck.length > 0 ? savedDeck : NORMAL_UNITS.filter((u) => u.rarity === 'normal').map((u) => u.id);

    this.events.once('shutdown', this.handleShutdown, this);
    setMembersHandler((members) => {
      this.members = members;
      this.refreshMembersText();
      if (!this.isHost) this.checkHostPresence(members);
    });

    void getCurrentNickname().then((nick) => {
      this.nickname = nick ?? '';
    });

    this.chat = mountChatOverlay((message) => {
      const nickname = this.nickname || '나';
      broadcastChat({ nickname, message });
      this.chat?.addMessage(nickname, message, true);
    });
    setChatHandler((payload) => {
      this.chat?.addMessage(payload.nickname, payload.message, payload.nickname === this.nickname);
    });

    if (this.isHost) {
      setDamageHandler((payload) => this.handleRemoteHit(payload));
      setAuraHandler((payload) => this.handleRemoteAura(payload));
      this.currentMap = pickRandomMapPreset();
      this.layout();
      this.boardReady = true;
      this.startHostSimulation();
    } else {
      setMonsterSyncHandler((payload) => this.handleSnapshot(payload));
      setKillRewardHandler((payload) => this.grantMana(payload.kind as MonsterKindId));
      setGameOverHandler((payload) => this.endRun(payload.stage));
      setGameSpeedHandler((payload) => this.applyGameSpeed(payload.value));
      this.layoutWaiting();
    }
  }

  // 몬스터를 잡으면 마나를 번다 (솔로 모드와 동일). 협동전에서는 누가 막타를 쳤든
  // 다 같이 잡은 거라 보고, 그 자리에 있던 파티원 전원의 마나가 함께 오른다.
  private grantMana(kindId: MonsterKindId): void {
    const reward = MONSTER_KINDS[kindId]?.manaReward ?? 1;
    this.economy = { ...this.economy, mana: this.economy.mana + reward };
    this.refreshHud();
  }

  private deckPool(): UnitDef[] {
    const pool = NORMAL_UNITS.filter((u) => this.deckUnitIds.includes(u.id));
    return pool.length > 0 ? pool : NORMAL_UNITS.filter((u) => u.rarity === 'normal');
  }

  update(_time: number, delta: number): void {
    if (!this.boardReady || this.gameOver) return;

    const dt = (delta / 1000) * this.gameSpeed;

    if (this.isHost) {
      this.updateHostMonsters(dt);
      this.updateCombat(dt, true);
    } else {
      this.updateGuestInterpolation();
      this.updateCombat(dt, false);
    }
  }

  private updateHostMonsters(dt: number): void {
    const pathLength = this.monsterPath.getLength();

    // 독 피해로 몬스터가 죽어도 반복 중에 목록이 꼬이지 않도록 사본으로 돈다.
    [...this.hostMonsters].forEach((m) => {
      const poison = tickMonsterStatus(m, dt);
      if (poison > 0) {
        this.spawnFloatingText(m.x, m.y, `-${poison}`, '#8ee08e');
        this.applyDamage(m.id, poison);
        if (!this.hostMonsters.includes(m)) return;
      }

      const pxPerSec = m.crawlSpeed * this.boardStep * effectiveSpeedMultiplier(m.status);
      const tStep = pathLength > 0 ? (pxPerSec * dt) / pathLength : 0;
      m.t = Math.min(1, m.t + tStep);
      const point = this.monsterPath.getPoint(m.t);
      m.x = point.x;
      m.y = point.y;
      m.sprite.setPosition(point.x, point.y);
    });

    this.drawRings(this.hostMonsters.map((m) => ({ x: m.x, y: m.y, flags: statusFlags(m.status) })));

    // 끝까지 도달한 몬스터는 사라지지 않고 필드 끝에 계속 쌓인다(솔로 모드와 동일).
    // 처치하지 않고 방치하면 결국 자리가 꽉 차서 필드가 뚫린다.
    if (this.hostMonsters.length >= MAX_MONSTERS_ON_FIELD) {
      this.triggerHostGameOver();
    }
  }

  // 파티원 쪽은 초당 몇 번(SYNC_INTERVAL_MS 간격)만 위치를 받기 때문에, 그 사이는
  // 이전 위치→새 위치를 부드럽게 이어서 그린다 (안 그러면 뚝뚝 끊겨 보인다).
  // 실제 도착 간격은 인터넷 상태에 따라 150ms보다 들쑥날쑥할 수 있어서, 고정값 대신
  // "직전 두 번의 실제 도착 간격"을 재서 그 시간에 맞춰 보간한다 (끊김 완화).
  // 타이머는 Phaser 게임 루프(rAF)가 아니라 실제 시계(Date.now)를 기준으로 재서,
  // 브라우저 탭이 잠깐 느려져도 위치가 튀지 않고 항상 "지금 시각 기준 정확한 위치"로
  // 보정된다.
  private updateGuestInterpolation(): void {
    const now = Date.now();
    this.guestMonsters.forEach((entry) => {
      const t = this.interpolatedT(entry, now);
      const point = this.monsterPath.getPoint(t);
      entry.sprite.setPosition(point.x, point.y);
    });

    this.drawRings(
      Array.from(this.guestMonsters.values()).map((entry) => ({ x: entry.sprite.x, y: entry.sprite.y, flags: entry.flags })),
    );
  }

  private interpolatedT(entry: GuestMonster, now: number): number {
    const progress = Phaser.Math.Clamp((now - entry.snapshotAt) / entry.intervalMs, 0, 1);
    return Phaser.Math.Linear(entry.fromT, entry.toT, progress);
  }

  private handleShutdown(): void {
    this.firstSpawnTimer?.remove();
    this.spawnTimer?.remove();
    this.syncTimer?.remove();
    this.hostMissingTimer?.remove();
    this.chat?.destroy();
    leaveRoom();
  }

  // ----- 접속 끊김 처리 -----
  // 방장 기기만 몬스터를 계산하기 때문에, 방장이 튕기면 파티원 화면은 마지막으로
  // 받은 모습 그대로 영원히 멈춰버린다. 그래서 파티원 쪽에서 "방장이 목록에서
  // 사라졌는지"를 지켜보다가, 잠깐의 접속 끊김(네트워크 순간 끊김 등)과 진짜
  // 나감을 구분하기 위해 5초 정도 기다렸다가 그래도 없으면 전투를 종료해준다.
  private checkHostPresence(members: PartyMember[]): void {
    if (this.gameOver) return;
    const hostPresent = members.some((m) => m.isHost);

    if (hostPresent) {
      if (this.hostMissingTimer) {
        this.hostMissingTimer.remove();
        this.hostMissingTimer = undefined;
      }
      return;
    }

    if (this.hostMissingTimer) return;

    this.hostMissingTimer = this.time.delayedCall(5000, () => {
      this.hostMissingTimer = undefined;
      if (this.gameOver) return;
      const stillMissing = !getLatestMembers().some((m) => m.isHost);
      if (stillMissing) {
        this.endRun(this.waveState.stage, '방장 연결이 끊겨서 전투가 끝났어요');
      }
    });
  }

  // ----- 필드 뚫림 / 전투 종료 -----
  // 몬스터 길과 체력이 파티 전체가 공유하는 하나뿐이라, 필드가 뚫리는 것도
  // 파티 전체에 동시에 일어나는 일이다. 그래서 개인별로 나누지 않고, 방장이
  // 종료를 판단해 모두에게 알리고 다 같이 같은 스테이지 기준 보상을 받는다.

  private triggerHostGameOver(): void {
    if (this.gameOver) return;
    const stage = this.waveState.stage;
    broadcastGameOver({ stage });
    this.endRun(stage);
  }

  private endRun(stage: number, title = '협동 전투 종료'): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.firstSpawnTimer?.remove();
    this.spawnTimer?.remove();
    this.syncTimer?.remove();
    this.hostMissingTimer?.remove();

    const reward = computeRunReward(stage);
    addGold(reward.gold);
    addBox(reward.boxId);
    void flushSnapshot();
    // 협동전 순위: 참가자 각자가 자기 기록(도달 스테이지)을 남긴다.
    void recordCoopResult(this.members.length, stage, this.nickname);
    playSfx('defeat');

    this.showGameOverOverlay(stage, reward, title);
  }

  private showGameOverOverlay(stage: number, reward: RunReward, title: string): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72).setDepth(1000);

    this.add
      .text(width / 2, height * 0.34, title, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(title.length > 10 ? 20 : 28)}px`,
        color: '#ffd98a',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: width * 0.88 },
      })
      .setOrigin(0.5)
      .setDepth(1001);

    this.add
      .text(width / 2, height * 0.45, `도달 스테이지 ${stage}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#f6e6b4',
      })
      .setOrigin(0.5)
      .setDepth(1001);

    const boxName = getBoxType(reward.boxId).name;
    this.add
      .text(width / 2, height * 0.51, `보상: 골드 +${reward.gold} · ${boxName} +1`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#ffd98a',
      })
      .setOrigin(0.5)
      .setDepth(1001);

    const refCell = this.cellSize || Math.min(width, height) * 0.15;
    const buttonWidth = Math.min(refCell * 3.4, width * 0.6);
    const buttonHeight = refCell * 0.9;

    this.drawOverlayButton(width / 2, height * 0.63, buttonWidth, buttonHeight, '덱 선택으로', () =>
      this.scene.start('deck-select', { forceEdit: true }),
    );
  }

  private drawOverlayButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    onClick: () => void,
  ): void {
    const bg = this.add.graphics().setDepth(1001);
    bg.fillStyle(0x151a28, 1);
    bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, px(10));
    bg.lineStyle(px(2), 0xd4b36a, 1);
    bg.strokeRoundedRect(x - width / 2, y - height / 2, width, height, px(10));

    this.add
      .text(x, y, label, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(16)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(1001);

    this.add
      .zone(x, y, width, height)
      .setInteractive({ useHandCursor: true })
      .setDepth(1001)
      .on('pointerdown', onClick);
  }

  private announceBoss(): void {
    playSfx('bossWarning');
    const { width, height } = this.scale;

    this.cameras.main.shake(400, 0.006);

    const flash = this.add.rectangle(width / 2, height / 2, width, height, 0xff3b3b, 0.35).setDepth(900);
    this.tweens.add({ targets: flash, alpha: 0, duration: 500, onComplete: () => flash.destroy() });

    const banner = this.add
      .text(width / 2, height * 0.22, '보스 출현!', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(26)}px`,
        color: '#ffcf5a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(901)
      .setAlpha(0);

    this.tweens.add({
      targets: banner,
      alpha: 1,
      duration: 200,
      yoyo: true,
      hold: 800,
      onComplete: () => banner.destroy(),
    });
  }

  // ----- 전투: 내가 배치한 유닛이 공유 몬스터를 공격 -----
  // 방장은 자기 몬스터 목록에 직접 효과(감속·기절·독·광역 등)를 적용한다. 파티원은
  // "어떤 유닛으로 어느 몬스터를 때렸는지"를 방장에게 보내고, 방장이 대신 적용한 결과
  // (체력, 상태이상 링)를 몬스터 위치 정보와 함께 다시 받아서 그린다.

  private fxGeometry(): { cellSize: number; boardStep: number } {
    return { cellSize: this.cellSize, boardStep: this.boardStep };
  }

  private buffSources(): BuffSource[] {
    const sources: BuffSource[] = [];
    this.field.placedUnits.forEach((placed, index) => {
      const cell = this.boardCells.find((c) => cellIndex(c.row, c.col) === index);
      if (cell) {
        sources.push({ index, unit: placed.unit, x: cell.x, y: cell.y, multiplier: this.field.totalMultiplier(placed.unit) });
      }
    });
    return sources;
  }

  // 파티원 화면의 몬스터를 엔진이 다룰 수 있는 모양으로 바꾼다(체력·상태는 방장 소관이라 자리표시).
  private guestTargets(): Array<FxMonster & { sprite: Phaser.GameObjects.Image }> {
    return Array.from(this.guestMonsters, ([id, entry]) => ({
      id,
      x: entry.sprite.x,
      y: entry.sprite.y,
      hp: 1,
      maxHp: 1,
      status: {},
      sprite: entry.sprite,
    }));
  }

  private updateCombat(dt: number, isHost: boolean): void {
    const sources = this.buffSources();
    const buffBonuses = computeBuffBonuses(sources, this.boardStep);
    const guestTargets = isHost ? [] : this.guestTargets();

    this.updateFrostAuras(sources, dt, isHost, guestTargets);

    this.field.placedUnits.forEach((placed, index) => {
      placed.cooldown -= dt;
      if (placed.cooldown > 0) return;

      const cell = this.boardCells.find((c) => cellIndex(c.row, c.col) === index);
      if (!cell) return;

      const gold = goldGenInfo(placed.unit, this.field.totalMultiplier(placed.unit));
      if (gold) {
        placed.cooldown = gold.interval;
        this.economy = { ...this.economy, mana: this.economy.mana + gold.value };
        this.refreshHud();
        playSfx('mana');
        this.spawnFloatingText(cell.x, cell.y, `+${gold.value}마나`, '#9adfa0');
        return;
      }

      if (placed.unit.attack <= 0 || placed.unit.attackSpeed <= 0) {
        placed.cooldown = 1;
        return;
      }

      const rangePx = placed.unit.range * this.boardStep;
      const count = attackTargetCount(placed.unit);
      const targets: FxMonster[] = isHost
        ? nearestMonsters(this.hostMonsters, cell.x, cell.y, rangePx, count)
        : nearestMonsters(guestTargets, cell.x, cell.y, rangePx, count);
      if (targets.length === 0) return;

      const bonus = (buffBonuses.get(index) ?? 0) + this.field.attackSpeedBonus();
      placed.cooldown = 1 / (placed.unit.attackSpeed * (1 + bonus));

      targets.forEach((target) => this.performAttack(cell, placed.unit, target, isHost));
    });
  }

  // 발사체가 날아가 도착했을 때 효과를 적용한다. 방장은 몬스터가 아직 있을 때만,
  // 파티원은 방장에게 "이 유닛이 이 몬스터를 때렸다"고 알린다.
  private performAttack(cell: CellPosition, unit: UnitDef, target: FxMonster, isHost: boolean): void {
    const attack = this.field.attackOf(unit);
    const magnitude = this.field.statusMagnitude(unit);
    const guestEntry = isHost ? undefined : this.guestMonsters.get(target.id);
    playSfx('attack', { role: unit.role });

    playProjectile(
      this,
      cell,
      unit,
      () => {
        if (isHost) return this.hostMonsters.includes(target as HostMonster) ? { x: target.x, y: target.y } : null;
        return guestEntry && this.guestMonsters.get(target.id) === guestEntry
          ? { x: guestEntry.sprite.x, y: guestEntry.sprite.y }
          : null;
      },
      () => {
        const mana = rollManaLeech(unit);
        if (mana > 0) {
          this.economy = { ...this.economy, mana: this.economy.mana + mana };
          this.refreshHud();
          playSfx('mana');
        }

        if (isHost) {
          const hostTarget = target as HostMonster;
          if (!this.hostMonsters.includes(hostTarget)) return;
          this.applyHitResult(resolveHit(hostTarget, unit, attack, this.hostMonsters, this.fxGeometry(), magnitude));
        } else {
          broadcastDamage({
            monsterId: target.id,
            amount: attack,
            from: this.nickname,
            unitId: unit.id,
            magnitude,
          });
          this.spawnFloatingText(target.x, target.y, `-${attack}`, '#fff5d6');
          playSfx('hit');
        }
      },
    );
  }

  // 냉기 결계: 방장은 직접 적용하고, 파티원은 0.3초마다 사거리 안 몬스터 번호를 방장에게 알린다.
  private updateFrostAuras(
    sources: BuffSource[],
    dt: number,
    isHost: boolean,
    guestTargets: Array<FxMonster & { sprite: Phaser.GameObjects.Image }>,
  ): void {
    this.auraSendClock += dt;
    const shouldSend = this.auraSendClock >= 0.3;
    if (shouldSend) this.auraSendClock = 0;

    sources.forEach((source) => {
      const value = frostAuraValue(source.unit, source.multiplier);
      if (value === null) return;
      const rangePx = source.unit.range * this.boardStep;

      if (isHost) {
        applyFrostAura(nearestMonsters(this.hostMonsters, source.x, source.y, rangePx, Infinity), value);
      } else if (shouldSend) {
        const ids = nearestMonsters(guestTargets, source.x, source.y, rangePx, Infinity).map((m) => m.id);
        if (ids.length > 0) broadcastAura({ unitId: source.unit.id, monsterIds: ids, multiplier: source.multiplier });
      }
    });
  }

  // 방장 전용: 파티원이 보낸 공격을 그 유닛의 특수 효과와 함께 적용한다.
  private handleRemoteHit(payload: DamageEventPayload): void {
    const target = this.hostMonsters.find((m) => m.id === payload.monsterId);
    if (!target) return;

    const unit = payload.unitId ? NORMAL_UNITS.find((u) => u.id === payload.unitId) : undefined;
    if (!unit) {
      this.applyDamage(payload.monsterId, payload.amount);
      return;
    }

    this.applyHitResult(resolveHit(target, unit, payload.amount, this.hostMonsters, this.fxGeometry(), payload.magnitude ?? 1));
  }

  // 방장 전용: 파티원 냉기 결계가 알려준 몬스터들에 감속을 건다.
  private handleRemoteAura(payload: AuraPayload): void {
    const unit = NORMAL_UNITS.find((u) => u.id === payload.unitId);
    const value = unit ? frostAuraValue(unit, payload.multiplier ?? 1) : null;
    if (value === null) return;

    const ids = new Set(payload.monsterIds);
    applyFrostAura(
      this.hostMonsters.filter((m) => ids.has(m.id)),
      value,
    );
  }

  // 방장 전용: 엔진이 계산한 피해를 실제 체력에 반영한다.
  private applyHitResult(result: HitResult): void {
    if (result.damages.length > 0) playSfx('hit');
    result.damages.forEach((damage) => {
      const monster = this.hostMonsters.find((m) => m.id === damage.monsterId);
      if (!monster) return;
      this.spawnFloatingText(monster.x, monster.y, `-${damage.amount}`, '#fff5d6');
      this.applyDamage(damage.monsterId, damage.amount);
    });

    result.bolts.forEach((bolt) => {
      const spark = this.add.circle(bolt.fromX, bolt.fromY, px(3), 0x9fd8ff, 1);
      this.tweens.add({
        targets: spark,
        x: bolt.toX,
        y: bolt.toY,
        duration: 120,
        onComplete: () => spark.destroy(),
      });
    });
  }

  // 감속(파랑)·기절(노랑)·독(초록)·방어 감소(빨강) 링.
  private drawRings(targets: Array<{ x: number; y: number; flags: number }>): void {
    if (!this.statusGraphics || !this.statusGraphics.active) {
      this.statusGraphics = this.add.graphics().setDepth(2);
    }
    drawStatusRings(
      this.statusGraphics,
      targets.filter((t) => t.flags !== 0),
      this.cellSize * 0.32,
    );
  }

  // 호스트만 호출: 자기 자신의 공격이든, 파티원에게서 전달받은 피해 이벤트든
  // 여기로 모여서 "진짜" 공유 체력에 반영된다.
  private applyDamage(monsterId: number, amount: number): void {
    const monster = this.hostMonsters.find((m) => m.id === monsterId);
    if (!monster) return;

    monster.hp = Math.max(0, monster.hp - amount);
    if (monster.hp <= 0) {
      spawnDeathBurst(this, monster.x, monster.y, this.cellSize);
      playSfx(monster.kind === 'boss' ? 'bossDefeat' : 'kill');
      monster.sprite.destroy();
      this.hostMonsters = this.hostMonsters.filter((m) => m.id !== monsterId);
      this.grantMana(monster.kind);
      broadcastKillReward({ kind: monster.kind });
    }
  }

  private spawnFloatingText(x: number, y: number, message: string, color: string): void {
    const text = this.add
      .text(x, y - px(10), message, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color,
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: y - px(40),
      alpha: 0,
      duration: 550,
      onComplete: () => text.destroy(),
    });
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
    const partySize = Math.max(1, getLatestMembers().length);
    const hp = Math.round(kind.baseHp * stageHpMultiplier(result.stage) * coopHpMultiplier(partySize));

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
      x: start.x,
      y: start.y,
      status: {},
    });

    this.refreshHud();

    if (result.kind === 'boss') {
      this.announceBoss();
    }
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
        st: statusFlags(m.status),
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
    const now = Date.now();
    const seen = new Set<number>();

    snapshot.forEach((m) => {
      seen.add(m.id);
      const existing = this.guestMonsters.get(m.id);

      if (!existing) {
        const sprite = this.createMonsterSprite(m.kind as MonsterKindId, m.species);
        const point = this.monsterPath.getPoint(m.t);
        sprite.setPosition(point.x, point.y);
        this.guestMonsters.set(m.id, {
          flags: m.st ?? 0,
          sprite,
          fromT: m.t,
          toT: m.t,
          snapshotAt: now,
          intervalMs: SYNC_INTERVAL_MS,
        });
        if (m.kind === 'boss') this.announceBoss();
        return;
      }

      // 지금 보간 중이던 위치를 새 시작점으로 삼아야 순간이동 없이 자연스럽게 이어진다.
      // 이번에 실제로 걸린 시간을 다음 보간 구간 길이로 써서, 네트워크가 들쭉날쭉해도
      // "잠깐 멈췄다가 순간이동"하는 대신 실제 도착 속도에 맞춰 계속 흐르게 한다.
      const measuredInterval = Phaser.Math.Clamp(now - existing.snapshotAt, 60, 600);
      existing.flags = m.st ?? 0;
      existing.fromT = this.interpolatedT(existing, now);
      existing.toT = m.t;
      existing.snapshotAt = now;
      existing.intervalMs = measuredInterval;
    });

    for (const [id, entry] of this.guestMonsters) {
      if (!seen.has(id)) {
        spawnDeathBurst(this, entry.sprite.x, entry.sprite.y, this.cellSize);
        playSfx('kill');
        entry.sprite.destroy();
        this.guestMonsters.delete(id);
      }
    }
  }

  // ----- 공통: 그리기 -----

  private layoutWaiting(): void {
    this.children.removeAll(true);
    this.confirmModalContainer = undefined;
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
    this.confirmModalContainer = undefined;
    this.guestMonsters = new Map();

    const { width, height } = this.scale;
    this.drawBackground(width, height);

    const headerHeight = height * 0.08;
    const fieldTop = height * 0.34;
    const fieldAreaHeight = height * 0.44;

    const boardLayout = computeBoardLayout(width, fieldTop, fieldAreaHeight);
    this.boardCells = getCellPositions(boardLayout);
    this.cellSize = boardLayout.cellSize;
    this.boardStep = boardLayout.cellSize + boardLayout.gap;

    const naturalFieldBottomY = boardLayout.originY + (FIELD_ROWS - 1) * this.boardStep + boardLayout.cellSize / 2 + boardLayout.gap / 2;
    this.fieldBottomY = naturalFieldBottomY;

    const pathPoints = this.resolveMapPathPoints(boardLayout, headerHeight);
    this.monsterPath = this.buildCurve(pathPoints);
    this.drawPath(this.monsterPath);
    this.drawFieldSlots(this.boardCells, boardLayout.cellSize);
    this.field.afterLayout();

    this.drawHeader(width, height);
    this.drawSpeedRow(width, headerHeight);
    this.field.drawActionBar(
      width / 2,
      this.fieldBottomY + boardLayout.cellSize * 0.55,
      Math.min(width * 0.94, px(460)),
      boardLayout.cellSize * 0.8,
    );
  }

  private confirmExit(): void {
    this.showConfirmModal({
      title: '협동 전투에서 나가시겠습니까?',
      subtitle: '지금 나가면 방에서 나가게 되고, 파티원은 계속 진행할 수 있어요',
      confirmLabel: '나가기',
      confirmColor: '#ff9a9a',
      onConfirm: () => this.scene.start('deck-select', { forceEdit: true }),
    });
  }

  // 강화 확인 등 솔로 모드와 동일한 공용 "확인/취소" 팝업.
  private showConfirmModal(options: {
    title: string;
    subtitle: string;
    confirmLabel: string;
    confirmColor: string;
    onConfirm: () => void;
  }): void {
    this.confirmModalContainer?.destroy(true);

    const { width, height } = this.scale;
    const container = this.add.container(0, 0).setDepth(900);
    this.confirmModalContainer = container;

    const backdrop = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55);
    container.add(backdrop);

    const cardWidth = Math.min(width * 0.78, px(320));
    const cardHeight = height * 0.22;
    const cardY = height * 0.5;

    const cardBg = this.add.graphics();
    cardBg.fillStyle(0x151a28, 0.97);
    cardBg.fillRoundedRect(width / 2 - cardWidth / 2, cardY - cardHeight / 2, cardWidth, cardHeight, px(14));
    cardBg.lineStyle(px(2), 0xd4b36a, 0.9);
    cardBg.strokeRoundedRect(width / 2 - cardWidth / 2, cardY - cardHeight / 2, cardWidth, cardHeight, px(14));
    container.add(cardBg);

    const title = this.add
      .text(width / 2, cardY - cardHeight * 0.28, options.title, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(15)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: cardWidth * 0.9 },
      })
      .setOrigin(0.5);
    container.add(title);

    const subtitle = this.add
      .text(width / 2, cardY - cardHeight * 0.02, options.subtitle, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(12)}px`,
        color: '#9a917d',
        align: 'center',
        wordWrap: { width: cardWidth * 0.9 },
      })
      .setOrigin(0.5);
    container.add(subtitle);

    const buttonY = cardY + cardHeight * 0.28;
    const buttonWidth = cardWidth * 0.42;
    const buttonHeight = cardHeight * 0.32;
    const gap = cardWidth * 0.06;
    const cancelX = width / 2 - buttonWidth / 2 - gap / 2;
    const confirmX = width / 2 + buttonWidth / 2 + gap / 2;

    const cancelBg = this.add.graphics();
    cancelBg.fillStyle(0x1f2536, 1);
    cancelBg.fillRoundedRect(cancelX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(8));
    cancelBg.lineStyle(px(1.5), 0x555555, 0.9);
    cancelBg.strokeRoundedRect(cancelX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(8));
    container.add(cancelBg);

    const cancelText = this.add
      .text(cancelX, buttonY, '취소', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#9a917d',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    container.add(cancelText);

    const cancelZone = this.add.zone(cancelX, buttonY, buttonWidth, buttonHeight).setInteractive({ useHandCursor: true });
    container.add(cancelZone);

    const confirmBg = this.add.graphics();
    confirmBg.fillStyle(0x2a2416, 1);
    confirmBg.fillRoundedRect(confirmX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(8));
    confirmBg.lineStyle(px(1.5), 0xd4b36a, 1);
    confirmBg.strokeRoundedRect(confirmX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, px(8));
    container.add(confirmBg);

    const confirmText = this.add
      .text(confirmX, buttonY, options.confirmLabel, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: options.confirmColor,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    container.add(confirmText);

    const confirmZone = this.add
      .zone(confirmX, buttonY, buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true });
    container.add(confirmZone);

    const close = () => {
      if (this.confirmModalContainer === container) this.confirmModalContainer = undefined;
      container.destroy(true);
    };

    cancelZone.on('pointerdown', close);
    confirmZone.on('pointerdown', () => {
      close();
      options.onConfirm();
    });
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
      .on('pointerdown', () => this.confirmExit());
    exitButton.setPadding(px(6), px(6), px(6), px(6));

    this.add
      .text(width - px(12), headerHeight * 0.4, `방 ${currentRoomCode()}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#9a917d',
      })
      .setOrigin(1, 0.5);

    // 스테이지·몬스터·마나 정보는 "나가기"/방 코드와 같은 줄에 두면 휴대폰
    // 좁은 화면에서 글씨가 겹치므로, 그 아래 전용 줄에 따로 표시한다.
    this.hudText = this.add
      .text(width / 2, headerHeight * 0.85, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#f6e6b4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.membersText = this.add
      .text(width / 2, headerHeight * 1.3, '', {
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
    this.hudText?.setText(
      `협동 전투 (베타) · 스테이지 ${this.waveState.stage} · 몬스터 ${count}마리 · 마나 ${this.economy.mana}`,
    );
    this.field?.refreshActionBar();
  }

  private refreshMembersText(): void {
    const names = this.members.map((m) => `${m.nickname}${m.isHost ? '(방장)' : ''}`).join(', ');
    const multiplier = coopHpMultiplier(Math.max(1, this.members.length));
    const difficultyNote = multiplier > 1 ? ` · 몬스터 체력 x${multiplier.toFixed(1)}` : '';
    this.membersText?.setText(names ? `함께: ${names}${difficultyNote}` : '');
  }

  // ----- 배속(솔로 모드와 동일한 1x/2x/4x/8x) -----
  // 실제 몬스터 이동·스폰을 계산하는 건 방장뿐이라, 배속도 방장만 조절할 수 있다.
  // 방장이 바꾸면 파티원에게도 알려줘서, 파티원 화면의 유닛 공격 속도도 같이
  // 빨라지게 맞춘다(몬스터 위치 자체는 방장이 보내주는 값을 그대로 따라가므로
  // 이미 저절로 빨라져 있다).

  private drawSpeedRow(width: number, headerHeight: number): void {
    if (this.isHost) {
      this.drawSpeedControls(width / 2, headerHeight * 1.75);
    } else {
      this.speedText = this.add
        .text(width / 2, headerHeight * 1.75, '', {
          fontFamily: TITLE_FONT,
          fontSize: `${px(12)}px`,
          color: '#8a8272',
        })
        .setOrigin(0.5);
      this.refreshSpeedText();
    }
  }

  private drawSpeedControls(centerX: number, y: number): void {
    this.speedButtonRefs = new Map();

    const speeds = [1, 2, 4, 8];
    const gap = px(10);
    const labelWidths = speeds.map((s) => `${s}x`.length);
    const totalWidth = labelWidths.reduce((sum, len) => sum + len * px(11) + px(16), 0) + gap * (speeds.length - 1);
    let cursorX = centerX - totalWidth / 2;

    speeds.forEach((speed) => {
      const label = `${speed}x`;
      const active = speed === this.gameSpeed;

      const text = this.add
        .text(0, y, label, {
          fontFamily: TITLE_FONT,
          fontSize: `${px(12)}px`,
          color: active ? '#ffd98a' : '#8a8272',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);

      const btnWidth = text.width + px(16);
      text.setX(cursorX + px(8));

      const bg = this.add.graphics();
      bg.fillStyle(active ? 0x2a2416 : 0x1f2536, 1);
      bg.fillRoundedRect(cursorX, y - px(11), btnWidth, px(22), px(6));
      bg.lineStyle(px(1.5), active ? 0xd4b36a : 0x555555, 0.9);
      bg.strokeRoundedRect(cursorX, y - px(11), btnWidth, px(22), px(6));
      this.children.moveBelow(bg, text);

      text.setOrigin(0.5, 0.5);
      text.setX(cursorX + btnWidth / 2);

      this.add
        .zone(cursorX + btnWidth / 2, y, btnWidth, px(22))
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.setGameSpeed(speed));

      this.speedButtonRefs.set(speed, { bg, text });
      cursorX += btnWidth + gap;
    });
  }

  // 방장 전용: 배속 버튼을 눌렀을 때. 자기 화면에 바로 적용하고 파티원에게도 전달한다.
  private setGameSpeed(value: number): void {
    this.applyGameSpeed(value);
    broadcastGameSpeed({ value });
  }

  // 방장·파티원 공통: 실제로 배속 값을 적용한다.
  private applyGameSpeed(value: number): void {
    this.gameSpeed = value;
    this.time.timeScale = value;
    this.tweens.timeScale = value;

    this.speedButtonRefs.forEach((refs, btnValue) => {
      const active = btnValue === value;
      refs.bg.clear();
      refs.bg.fillStyle(active ? 0x2a2416 : 0x1f2536, 1);
      refs.bg.fillRoundedRect(
        refs.text.x - refs.text.width / 2 - px(8),
        refs.text.y - px(11),
        refs.text.width + px(16),
        px(22),
        px(6),
      );
      refs.bg.lineStyle(px(1.5), active ? 0xd4b36a : 0x555555, 0.9);
      refs.bg.strokeRoundedRect(
        refs.text.x - refs.text.width / 2 - px(8),
        refs.text.y - px(11),
        refs.text.width + px(16),
        px(22),
        px(6),
      );
      refs.text.setColor(active ? '#ffd98a' : '#8a8272');
    });

    this.refreshSpeedText();
  }

  private refreshSpeedText(): void {
    this.speedText?.setText(this.gameSpeed === 1 ? '배속 1x (방장 설정)' : `배속 ${this.gameSpeed}x (방장 설정)`);
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

    return toOrthogonalPath([topPoint, ...corridorPoints]);
  }

  private buildCurve(points: { x: number; y: number }[]): Phaser.Curves.Path {
    const curve = new Phaser.Curves.Path(points[0].x, points[0].y);
    points.slice(1).forEach((p) => curve.lineTo(p.x, p.y));
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

  private drawFieldSlots(cells: CellPosition[], cellSize: number): void {
    const slotKey = `coop-slot-${Math.round(cellSize)}`;
    createSlotTexture(this, slotKey, Math.round(cellSize));
    cells.forEach((cell) => {
      this.add
        .image(cell.x, cell.y, slotKey)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.field.handleCellTap(cell));
    });
  }

  private createMonsterSprite(kindId: MonsterKindId, speciesId: string): Phaser.GameObjects.Image {
    const kind = MONSTER_KINDS[kindId];
    const size = Math.round(this.cellSize * kind.sizeRatio);
    const textureKey = `coop-monster-${kindId}-${speciesId}-${size}`;
    createMonsterTexture(this, textureKey, size, { ...kind, shape: speciesId as MonsterShapeId });
    return this.add.image(0, 0, textureKey);
  }
}
