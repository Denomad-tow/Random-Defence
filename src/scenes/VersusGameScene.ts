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
import { MAX_MONSTERS_ON_FIELD, GIFT_CHANCE } from '../core/versusBalance';
import { MONSTER_KINDS, pickRandomSpecies, type MonsterKindId } from '../core/monsters';
import { pickRandomMapPreset, type MapPreset } from '../core/mapPresets';
import { NORMAL_UNITS, type UnitDef } from '../core/units';
import {
  createInitialEconomy,
  type EconomyState,
} from '../core/economy';
import { loadDeckSlot, loadActiveSlot } from '../meta/deck';
import { getCurrentNickname } from '../meta/auth';
import { computeRunReward, type RunReward } from '../meta/rewards';
import { recordVersusResult } from '../meta/versusRanking';
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
  setMembersHandler,
  getLatestMembers,
  broadcastVersusStatus,
  setVersusStatusHandler,
  broadcastVersusGift,
  setVersusGiftHandler,
  broadcastVersusEliminated,
  setVersusEliminatedHandler,
  broadcastVersusWin,
  setVersusWinHandler,
  setChatHandler,
  broadcastChat,
  type PartyMember,
  type PartyMode,
  type VersusStatusPayload,
  type VersusEliminatedPayload,
  type VersusWinPayload,
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
  type HitResult,
} from '../core/effectsEngine';
import { drawStatusRings } from '../core/statusRings';
import { PlayerField } from '../core/playerField';
import { playSfx } from '../core/sfx';
import { playProjectile, spawnDeathBurst } from '../core/combatVfx';

const TITLE_FONT = '"Noto Serif KR", serif';
const SPAWN_INTERVAL_MS = 1100;
const FIRST_SPAWN_DELAY_MS = 2000;
const STATUS_INTERVAL_MS = 600;

interface MyMonster {
  id: number;
  kind: MonsterKindId;
  species: string;
  t: number;
  hp: number;
  maxHp: number;
  crawlSpeed: number;
  isGift: boolean;
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  status: StatusEffects;
}

interface OpponentStatus {
  stage: number;
  pileCount: number;
  eliminated: boolean;
  rank?: number;
}

// 6단계(경쟁 파티전): 협동전과 달리 몬스터 길·체력을 공유하지 않는다. 각자
// 자기 필드에서 솔로 모드처럼 따로 싸우고, 그 대신 몬스터를 잡을 때마다 일정
// 확률로 다른 플레이어에게 몬스터를 보낼 수 있다(core/versusBalance.ts).
// 내 필드가 뚫리면(몬스터 100마리) 탈락하고, 마지막까지 남은 사람이 승리한다.
// 균형전 모드에서는 모두 일반 등급 유닛만 써서 그동안 키운 정도의 격차를 줄인다.
// 유닛 특수 효과(감속·기절·독·광역 등)는 core/effectsEngine.ts가 계산한다. 아직 합성·강화는
// 연결 안 됨.
export class VersusGameScene extends Phaser.Scene {
  private mode: PartyMode = 'versus-normal';
  private boardReady = false;
  private isEliminated = false;
  private isMatchOver = false;
  private monsterPath!: Phaser.Curves.Path;
  private boardCells: CellPosition[] = [];
  private cellSize = 0;
  private boardStep = 0;
  private fieldBottomY = 0;
  private currentMap!: MapPreset;
  private waveState: WaveState = createInitialWaveState();

  private myMonsters: MyMonster[] = [];
  private statusGraphics?: Phaser.GameObjects.Graphics;
  private nextMonsterId = 1;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private firstSpawnTimer?: Phaser.Time.TimerEvent;
  private statusTimer?: Phaser.Time.TimerEvent;

  private economy: EconomyState = createInitialEconomy();
  private field!: PlayerField;
  private deckUnitIds: string[] = [];
  private nickname = '';
  private chat?: ChatHandle;

  private members: PartyMember[] = [];
  private opponents = new Map<string, OpponentStatus>();

  private hudText?: Phaser.GameObjects.Text;
  private opponentsText?: Phaser.GameObjects.Text;
  private confirmModalContainer?: Phaser.GameObjects.Container;
  private gameSpeed = 1;
  private speedButtonRefs = new Map<number, { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text }>();
  private resultExtraText?: Phaser.GameObjects.Text;

  constructor() {
    super('versus-game');
  }

  init(data: { mode?: PartyMode }): void {
    this.mode = data?.mode ?? 'versus-normal';
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#07080d');
    this.boardReady = false;
    this.isEliminated = false;
    this.isMatchOver = false;
    this.waveState = createInitialWaveState();
    this.myMonsters = [];
    this.nextMonsterId = 1;
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
      // 균형전에서는 그동안 키운 레벨·연구 보너스를 빼서 격차를 줄인다.
      useMetaBonuses: this.mode !== 'versus-balanced',
    });
    this.field.registerDragHandlers();
    this.members = getLatestMembers();
    this.opponents = new Map();
    this.gameSpeed = 1;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;

    const savedDeck = loadDeckSlot(loadActiveSlot()) ?? [];
    this.deckUnitIds = savedDeck.length > 0 ? savedDeck : NORMAL_UNITS.filter((u) => u.rarity === 'normal').map((u) => u.id);

    this.events.once('shutdown', this.handleShutdown, this);
    setMembersHandler((members) => {
      this.members = members;
    });
    setVersusStatusHandler((payload) => this.handleOpponentStatus(payload));
    setVersusGiftHandler((payload) => {
      if (payload.targetNickname === this.nickname) this.receiveGift(payload.kind as MonsterKindId, payload.from);
    });
    setVersusEliminatedHandler((payload) => this.handleOpponentEliminated(payload));
    setVersusWinHandler((payload) => this.handleWinAnnounced(payload));

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

    this.currentMap = pickRandomMapPreset();
    this.layout();
    this.boardReady = true;
    this.startSimulation();
  }

  private deckPool(): UnitDef[] {
    if (this.mode === 'versus-balanced') {
      return NORMAL_UNITS.filter((u) => u.rarity === 'normal');
    }
    const pool = NORMAL_UNITS.filter((u) => this.deckUnitIds.includes(u.id));
    return pool.length > 0 ? pool : NORMAL_UNITS.filter((u) => u.rarity === 'normal');
  }

  update(_time: number, delta: number): void {
    if (!this.boardReady || this.isEliminated || this.isMatchOver) return;

    const dt = (delta / 1000) * this.gameSpeed;
    this.updateMonsters(dt);
    this.updateCombat(dt);
  }

  private updateMonsters(dt: number): void {
    const pathLength = this.monsterPath.getLength();

    // 독 피해로 몬스터가 죽어도 반복 중에 목록이 꼬이지 않도록 사본으로 돈다.
    [...this.myMonsters].forEach((m) => {
      const poison = tickMonsterStatus(m, dt);
      if (poison > 0) {
        this.spawnFloatingText(m.x, m.y, `-${poison}`, '#8ee08e');
        this.applyDamage(m.id, poison);
        if (!this.myMonsters.includes(m)) return;
      }

      const pxPerSec = m.crawlSpeed * this.boardStep * effectiveSpeedMultiplier(m.status);
      const tStep = pathLength > 0 ? (pxPerSec * dt) / pathLength : 0;
      m.t = Math.min(1, m.t + tStep);
      const point = this.monsterPath.getPoint(m.t);
      m.x = point.x;
      m.y = point.y;
      m.sprite.setPosition(point.x, point.y);
    });

    this.drawStatusMarks();

    // 끝까지 도달한 몬스터는 사라지지 않고 필드 끝에 계속 쌓인다(솔로 모드와 동일).
    if (this.myMonsters.length >= MAX_MONSTERS_ON_FIELD) {
      this.eliminateSelf();
    }
  }

  private handleShutdown(): void {
    this.firstSpawnTimer?.remove();
    this.spawnTimer?.remove();
    this.statusTimer?.remove();
    // 아직 승부가 안 났는데 중간에 나가면, 남은 사람들이 계속 기다리지 않도록
    // 탈락 처리를 해주고 나간다.
    if (!this.isEliminated && !this.isMatchOver) {
      this.eliminateSelf();
    }
    this.chat?.destroy();
    leaveRoom();
  }

  // ----- 전투 -----

  private fxGeometry(): { cellSize: number; boardStep: number } {
    return { cellSize: this.cellSize, boardStep: this.boardStep };
  }

  private buffSources(): BuffSource[] {
    const sources: BuffSource[] = [];
    this.field.placedUnits.forEach((placed, index) => {
      const cell = this.boardCells.find((c) => cellIndex(c.row, c.col) === index);
      if (cell) {
        sources.push({ index, unit: placed.unit, x: cell.x, y: cell.y, multiplier: this.field.effectMultiplier(placed.unit, placed.star) });
      }
    });
    return sources;
  }

  private updateCombat(dt: number): void {
    const sources = this.buffSources();
    const buffBonuses = computeBuffBonuses(sources, this.boardStep);

    // 냉기 결계: 사거리 안 몬스터를 계속 느리게 만든다.
    sources.forEach((source) => {
      const value = frostAuraValue(source.unit, source.multiplier);
      if (value === null) return;
      const inRange = nearestMonsters(this.myMonsters, source.x, source.y, source.unit.range * this.boardStep, Infinity);
      applyFrostAura(inRange, value);
    });

    this.field.placedUnits.forEach((placed, index) => {
      placed.cooldown -= dt;
      if (placed.cooldown > 0) return;

      const cell = this.boardCells.find((c) => cellIndex(c.row, c.col) === index);
      if (!cell) return;

      const gold = goldGenInfo(placed.unit, this.field.effectMultiplier(placed.unit, placed.star));
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
      const targets = nearestMonsters(this.myMonsters, cell.x, cell.y, rangePx, attackTargetCount(placed.unit));
      if (targets.length === 0) return;

      const bonus = (buffBonuses.get(index) ?? 0) + this.field.attackSpeedBonus();
      placed.cooldown = 1 / (placed.unit.attackSpeed * (1 + bonus));
      targets.forEach((target) => this.performAttack(cell, placed.unit, target, placed.star));
    });
  }

  // 발사체가 날아가 도착했을 때(그 사이 몬스터가 죽었으면 취소) 효과를 적용한다.
  private performAttack(cell: CellPosition, unit: UnitDef, target: MyMonster, star: number): void {
    playSfx('attack', { role: unit.role });
    playProjectile(
      this,
      cell,
      unit,
      () => (this.myMonsters.includes(target) ? { x: target.x, y: target.y } : null),
      () => {
        if (!this.myMonsters.includes(target)) return;

        const mana = rollManaLeech(unit);
        if (mana > 0) {
          this.economy = { ...this.economy, mana: this.economy.mana + mana };
          this.refreshHud();
          playSfx('mana');
        }

        this.applyHitResult(
          resolveHit(
            target,
            unit,
            this.field.attackOf(unit, star),
            this.myMonsters,
            this.fxGeometry(),
            this.field.statusMagnitude(unit, star),
          ),
        );
      },
    );
  }

  private applyHitResult(result: HitResult): void {
    if (result.damages.length > 0) playSfx('hit');
    result.damages.forEach((damage) => {
      const monster = this.myMonsters.find((m) => m.id === damage.monsterId);
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
  private drawStatusMarks(): void {
    if (!this.statusGraphics || !this.statusGraphics.active) {
      this.statusGraphics = this.add.graphics().setDepth(2);
    }
    drawStatusRings(
      this.statusGraphics,
      this.myMonsters.map((m) => ({ x: m.x, y: m.y, flags: statusFlags(m.status) })).filter((t) => t.flags !== 0),
      this.cellSize * 0.32,
    );
  }

  private applyDamage(monsterId: number, amount: number): void {
    const monster = this.myMonsters.find((m) => m.id === monsterId);
    if (!monster) return;

    monster.hp = Math.max(0, monster.hp - amount);
    if (monster.hp <= 0) {
      spawnDeathBurst(this, monster.x, monster.y, this.cellSize);
      playSfx(monster.kind === 'boss' ? 'bossDefeat' : 'kill');
      monster.sprite.destroy();
      this.myMonsters = this.myMonsters.filter((m) => m.id !== monsterId);
      this.grantMana(monster.kind);
      this.maybeSendGift();
    }
  }

  private grantMana(kindId: MonsterKindId): void {
    const reward = MONSTER_KINDS[kindId]?.manaReward ?? 1;
    this.economy = { ...this.economy, mana: this.economy.mana + reward };
    this.refreshHud();
  }

  // 몬스터를 잡을 때마다 일정 확률로, 살아있는 다른 플레이어 중 무작위 한 명에게
  // 몬스터를 하나 보낸다.
  private maybeSendGift(): void {
    if (Math.random() > GIFT_CHANCE) return;

    const candidates = this.members
      .map((m) => m.nickname)
      .filter((name) => name !== this.nickname && !this.opponents.get(name)?.eliminated);
    if (candidates.length === 0) return;

    const target = candidates[Math.floor(Math.random() * candidates.length)];
    broadcastVersusGift({ targetNickname: target, kind: 'normal', from: this.nickname });
  }

  private receiveGift(kind: MonsterKindId, from: string): void {
    if (!this.boardReady || this.isEliminated || this.isMatchOver) return;

    const hp = Math.round(MONSTER_KINDS[kind].baseHp * stageHpMultiplier(this.waveState.stage));
    const sprite = this.createMonsterSprite(kind, pickRandomSpecies().id, true);
    const start = this.monsterPath.getPoint(0);
    sprite.setPosition(start.x, start.y);

    this.myMonsters.push({
      id: this.nextMonsterId++,
      kind,
      species: 'gift',
      t: 0,
      hp,
      maxHp: hp,
      crawlSpeed: MONSTER_KINDS[kind].crawlSpeed,
      isGift: true,
      sprite,
      x: start.x,
      y: start.y,
      status: {},
    });

    this.spawnFloatingText(start.x, start.y, `${from}님이 보냄!`, '#ff9a9a');
    this.refreshHud();
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

  // ----- 몬스터 시뮬레이션 (각자 독립) -----

  private startSimulation(): void {
    this.firstSpawnTimer = this.time.delayedCall(FIRST_SPAWN_DELAY_MS, () => {
      this.spawnMonster();
      this.spawnTimer = this.time.addEvent({
        delay: SPAWN_INTERVAL_MS,
        loop: true,
        callback: () => this.spawnMonster(),
      });
    });

    this.statusTimer = this.time.addEvent({
      delay: STATUS_INTERVAL_MS,
      loop: true,
      callback: () => this.broadcastMyStatus(),
    });
  }

  private spawnMonster(): void {
    const result = nextSpawn(this.waveState);
    this.waveState = result.nextState;

    const kind = MONSTER_KINDS[result.kind];
    const species = pickRandomSpecies();
    const hp = Math.round(kind.baseHp * stageHpMultiplier(result.stage));

    const sprite = this.createMonsterSprite(result.kind, species.id, false);
    const start = this.monsterPath.getPoint(0);
    sprite.setPosition(start.x, start.y);

    this.myMonsters.push({
      id: this.nextMonsterId++,
      kind: result.kind,
      species: species.id,
      t: 0,
      hp,
      maxHp: hp,
      crawlSpeed: kind.crawlSpeed,
      isGift: false,
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

  private broadcastMyStatus(): void {
    broadcastVersusStatus({
      nickname: this.nickname,
      stage: this.waveState.stage,
      pileCount: this.myMonsters.length,
    });
  }

  // ----- 다른 플레이어 상태 -----

  private handleOpponentStatus(payload: VersusStatusPayload): void {
    if (payload.nickname === this.nickname) return;
    const existing = this.opponents.get(payload.nickname);
    if (existing?.eliminated) return;
    this.opponents.set(payload.nickname, { stage: payload.stage, pileCount: payload.pileCount, eliminated: false });
    this.refreshOpponentsText();
  }

  private handleOpponentEliminated(payload: VersusEliminatedPayload): void {
    const prev = this.opponents.get(payload.nickname);
    this.opponents.set(payload.nickname, {
      stage: prev?.stage ?? 0,
      pileCount: prev?.pileCount ?? 0,
      eliminated: true,
      rank: payload.rank,
    });
    this.refreshOpponentsText();
    this.checkForWin();
  }

  private handleWinAnnounced(payload: VersusWinPayload): void {
    if (this.isMatchOver) return;
    if (payload.nickname === this.nickname) return; // 내가 승리자면 이미 내 쪽에서 처리함
    this.isMatchOver = true;

    if (this.isEliminated) {
      // 이미 탈락 화면을 보고 있었다면, 최종 승자만 추가로 알려준다.
      this.resultExtraText?.setText(`${payload.nickname}님 최종 승리!`);
      return;
    }

    this.endMatch(false, undefined, `${payload.nickname}님 승리! (나는 계속 진행 중이었어요)`);
  }

  // 살아있는 사람 수(나 포함, 아직 탈락 소식이 안 온 사람은 살아있는 것으로 간주)를 세서
  // 나 혼자 남았으면 승리 처리한다.
  private checkForWin(): void {
    if (this.isMatchOver || this.isEliminated) return;

    const totalAliveOthers = this.members.filter(
      (m) => m.nickname !== this.nickname && !this.opponents.get(m.nickname)?.eliminated,
    ).length;

    if (totalAliveOthers === 0 && this.members.length > 1) {
      broadcastVersusWin({ nickname: this.nickname });
      this.isMatchOver = true;
      this.endMatch(true);
    }
  }

  // ----- 탈락 / 승리 처리 -----

  private eliminateSelf(): void {
    if (this.isEliminated || this.isMatchOver) return;
    this.isEliminated = true;

    const aliveIncludingMe = this.members.filter((m) => !this.opponents.get(m.nickname)?.eliminated).length;
    const rank = Math.max(1, aliveIncludingMe);

    broadcastVersusEliminated({ nickname: this.nickname, rank });
    this.endMatch(false, rank);
  }

  private endMatch(won: boolean, rank?: number, extraNote?: string): void {
    this.firstSpawnTimer?.remove();
    this.spawnTimer?.remove();
    this.statusTimer?.remove();

    const stage = this.waveState.stage;
    playSfx(won ? 'newRecord' : 'defeat');
    const reward = computeRunReward(stage);
    addGold(reward.gold);
    addBox(reward.boxId);
    void flushSnapshot();

    // 등수를 매길 수 있는 경우(승리했거나, 직접 탈락 처리된 경우)에만 순위표에
    // 기록한다. 남이 이겨서 전달받은 것뿐인 방어적인 경로는 등수를 정확히 알 수
    // 없어서 기록하지 않는다.
    const placement = won ? 1 : rank;
    if (placement !== undefined) {
      void recordVersusResult(
        { mode: this.mode, partySize: this.members.length, placement, stageReached: stage },
        this.nickname,
      );
    }

    const title = won ? '승리!' : rank ? `탈락! ${rank}등` : '경쟁 전투 종료';
    this.showResultOverlay(title, stage, reward, extraNote);
  }

  private showResultOverlay(title: string, stage: number, reward: RunReward, extraNote?: string): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72).setDepth(1000);

    this.add
      .text(width / 2, height * 0.3, title, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(title.length > 6 ? 22 : 30)}px`,
        color: '#ffd98a',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: width * 0.88 },
      })
      .setOrigin(0.5)
      .setDepth(1001);

    this.add
      .text(width / 2, height * 0.4, `도달 스테이지 ${stage}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(14)}px`,
        color: '#f6e6b4',
      })
      .setOrigin(0.5)
      .setDepth(1001);

    const boxName = getBoxType(reward.boxId).name;
    this.add
      .text(width / 2, height * 0.46, `보상: 골드 +${reward.gold} · ${boxName} +1`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(13)}px`,
        color: '#ffd98a',
      })
      .setOrigin(0.5)
      .setDepth(1001);

    this.resultExtraText = this.add
      .text(width / 2, height * 0.52, extraNote ?? '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(12)}px`,
        color: '#9fd8ff',
        align: 'center',
        wordWrap: { width: width * 0.88 },
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

  // ----- 그리기 -----

  private layout(): void {
    this.children.removeAll(true);
    this.confirmModalContainer = undefined;

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
    this.drawSpeedControls(width / 2, headerHeight * 2.0);
    this.field.drawActionBar(
      width / 2,
      this.fieldBottomY + boardLayout.cellSize * 0.55,
      Math.min(width * 0.94, px(460)),
      boardLayout.cellSize * 0.8,
    );
  }

  private confirmExit(): void {
    this.showConfirmModal({
      title: '경쟁 전투에서 나가시겠습니까?',
      subtitle: '지금 나가면 탈락 처리되고, 다른 사람들은 계속 진행할 수 있어요',
      confirmLabel: '나가기',
      confirmColor: '#ff9a9a',
      onConfirm: () => this.scene.start('deck-select', { forceEdit: true }),
    });
  }

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

    const modeLabel = this.mode === 'versus-balanced' ? '경쟁전(균형)' : '경쟁전(일반)';
    this.add
      .text(width - px(12), headerHeight * 0.4, `방 ${currentRoomCode()} · ${modeLabel}`, {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11)}px`,
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

    this.opponentsText = this.add
      .text(width / 2, headerHeight * 1.3, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${px(11.5)}px`,
        color: '#9fd8ff',
        align: 'center',
        wordWrap: { width: width * 0.92 },
      })
      .setOrigin(0.5, 0);

    this.refreshHud();
    this.refreshOpponentsText();
  }

  private refreshHud(): void {
    this.hudText?.setText(
      `경쟁 전투 (베타) · 스테이지 ${this.waveState.stage} · 몬스터 ${this.myMonsters.length}마리 · 마나 ${this.economy.mana}`,
    );
    this.field?.refreshActionBar();
  }

  private refreshOpponentsText(): void {
    const others = this.members.filter((m) => m.nickname !== this.nickname);
    if (others.length === 0) {
      this.opponentsText?.setText('');
      return;
    }

    const line = others
      .map((m) => {
        const status = this.opponents.get(m.nickname);
        if (!status) return `${m.nickname}(대기 중)`;
        if (status.eliminated) return `${m.nickname}(탈락${status.rank ? ` ${status.rank}등` : ''})`;
        return `${m.nickname}(스테이지 ${status.stage})`;
      })
      .join(' · ');

    this.opponentsText?.setText(`상대: ${line}`);
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

  // 경쟁전은 각자 자기 필드를 각자 계산하므로, 배속도 남에게 영향 없이 내 화면에만
  // 적용된다(협동전처럼 방장에게만 있는 게 아니라 누구나 조절 가능).
  private setGameSpeed(value: number): void {
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
  }

  private drawBackground(width: number, height: number): void {
    const glowKey = `versus-bg-glow-${Math.round(width)}x${Math.round(height)}`;
    const glowSize = Math.round(Math.max(width, height) * 1.1);
    createNightSkyGlowTexture(this, glowKey, glowSize);
    this.add.image(width / 2, height * 0.02, glowKey).setOrigin(0.5, 0);

    const starKey = `versus-bg-stars-${Math.round(width)}x${Math.round(height)}`;
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
    const slotKey = `versus-slot-${Math.round(cellSize)}`;
    createSlotTexture(this, slotKey, Math.round(cellSize));
    cells.forEach((cell) => {
      this.add
        .image(cell.x, cell.y, slotKey)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.field.handleCellTap(cell));
    });
  }

  private createMonsterSprite(kindId: MonsterKindId, speciesId: string, isGift: boolean): Phaser.GameObjects.Image {
    const kind = MONSTER_KINDS[kindId];
    const size = Math.round(this.cellSize * kind.sizeRatio);
    const textureKey = `versus-monster-${kindId}-${speciesId}-${size}${isGift ? '-gift' : ''}`;
    createMonsterTexture(this, textureKey, size, { ...kind, shape: speciesId as MonsterShapeId });
    const image = this.add.image(0, 0, textureKey);
    if (isGift) image.setTint(0xd9a8ff);
    return image;
  }
}
