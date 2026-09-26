import { supabase } from '../core/supabaseClient';
import { MONSTER_SPECIES } from '../core/monsters';
import type { RealtimeChannel } from '@supabase/supabase-js';

// "협동 파티전" 대기실 + 전투: 서버 표(table) 없이 Supabase Realtime의 프레즌스
// (presence, 같은 채널에 접속한 사람 목록을 실시간으로 공유하는 기능)와 브로드캐스트
// (broadcast, 채널에 있는 사람들에게 메시지를 실시간으로 뿌리는 기능)만으로 구현한다.
// 방 코드 = 채널 이름이라 별도 DB 저장이 필요 없고, 무료 요금제 한도 안에서 충분하다.
//
// 대기실에서 맺은 채널을 전투 화면(CoopGameScene)에서도 그대로 이어서 쓴다. 방을
// 나가지 않는 한 연결을 유지하고, 핸들러(onXxx)만 화면이 바뀔 때마다 갈아끼운다.

export interface PartyMember {
  nickname: string;
  isHost: boolean;
  joinedAt: number;
  maxSize?: number; // 방장 항목에만 있음: 이 방이 받을 수 있는 최대 인원(2~5)
  mode?: PartyMode; // 방장 항목에만 있음: 이 방의 게임 모드
  started?: boolean; // 방장 항목에만 있음: 게임이 시작되었는가(시작 알림 메시지를 놓친 참가자를 위한 보험)
}

export interface MonsterSnapshot {
  id: number;
  kind: string;
  species: string;
  t: number; // 길을 따라 이동한 진행도 (0~1)
  hp: number;
  maxHp: number;
  st?: number; // 상태이상 표시 비트(파티원 화면에 감속·기절·독·방어 감소 링을 그릴 때 씀)
}

export interface MonsterSyncPayload {
  mapId: string;
  stage: number;
  monsters: MonsterSnapshot[];
}

export interface DamageEventPayload {
  monsterId: number;
  amount: number;
  from: string; // 누가 때렸는지(닉네임). 나중에 기여도 보상 계산에 쓸 수 있다.
  unitId?: string; // 어떤 유닛이 때렸는지. 방장이 그 유닛의 특수 효과(감속·광역 등)를 적용한다.
  magnitude?: number; // 그 유닛의 연구(직업 레벨) 배율. 감속·독 수치에 곱한다.
}

// 냉기 결계처럼 "사거리 안 몬스터를 계속 느리게" 하는 유닛은 몬스터 위치를 아는 방장이
// 대신 적용해야 해서, 파티원이 자기 사거리 안에 있는 몬스터 번호를 주기적으로 알려준다.
export interface AuraPayload {
  unitId: string;
  monsterIds: number[];
  multiplier?: number; // 냉기 결계 유닛의 강화·레벨·연구 배율
}

export interface KillRewardPayload {
  kind: string; // MonsterKindId — 몬스터 종류별로 마나 보상이 다르다.
}

export interface GameOverPayload {
  stage: number; // 도달한 스테이지. 각자 이 숫자로 자기 몫의 보상을 계산한다.
}

export interface GameSpeedPayload {
  value: number; // 1/2/4/8
}

// coop = 협동전(몬스터 체력 공유), versus-normal = 경쟁전 일반(내 덱 그대로),
// versus-balanced = 경쟁전 균형(모두 일반 등급 유닛만 사용해서 격차를 줄임)
export type PartyMode = 'coop' | 'versus-normal' | 'versus-balanced';

export interface StartPayload {
  mode: PartyMode;
}

export interface VersusStatusPayload {
  nickname: string;
  stage: number;
  pileCount: number; // 필드에 쌓인 몬스터 수 (많을수록 위험)
}

export interface VersusGiftPayload {
  targetNickname: string; // 이 사람 필드에만 몬스터가 추가된다
  kind: string; // MonsterKindId
  from: string;
}

export interface VersusEliminatedPayload {
  nickname: string;
  rank: number; // 몇 등으로 탈락했는지 (숫자가 작을수록 늦게 탈락 = 높은 등수)
}

export interface VersusWinPayload {
  nickname: string;
}

export interface ChatPayload {
  nickname: string;
  message: string;
}

// 방 코드는 방장이 직접 정한다(자동 생성 없음). 대신 "지금 열려 있는 방" 목록을
// 보여주기 위해, 별도의 공용 로비 채널(party-lobby) 하나에 방장들이 자기 방
// 정보(코드·닉네임·모드·정원)를 프레즌스로 올려둔다. 방장이 나가거나 게임을
// 시작하면 내려가고, 접속이 끊기면 자동으로 사라진다(별도 정리 로직 불필요).
export interface LobbyRoomInfo {
  code: string;
  hostNickname: string;
  mode: PartyMode;
  maxSize: number;
}

const LOBBY_CHANNEL_NAME = 'party-lobby';
let lobbyChannel: RealtimeChannel | null = null;

let channel: RealtimeChannel | null = null;
let hostFlag = false;
let roomCode = '';
let latestMembers: PartyMember[] = [];
let myMember: PartyMember | null = null;
let startFired = false; // 시작 처리를 이미 했는가(메시지와 프레즌스 두 경로로 와도 한 번만 처리)

let membersHandler: (members: PartyMember[]) => void = () => {};
let startHandler: (payload: StartPayload) => void = () => {};
let monsterSyncHandler: (payload: MonsterSyncPayload) => void = () => {};
let damageHandler: (payload: DamageEventPayload) => void = () => {};
let killRewardHandler: (payload: KillRewardPayload) => void = () => {};
let gameOverHandler: (payload: GameOverPayload) => void = () => {};
let gameSpeedHandler: (payload: GameSpeedPayload) => void = () => {};
let roomFullHandler: () => void = () => {};
let versusStatusHandler: (payload: VersusStatusPayload) => void = () => {};
let versusGiftHandler: (payload: VersusGiftPayload) => void = () => {};
let versusEliminatedHandler: (payload: VersusEliminatedPayload) => void = () => {};
let versusWinHandler: (payload: VersusWinPayload) => void = () => {};
let chatHandler: (payload: ChatPayload) => void = () => {};
let auraHandler: (payload: AuraPayload) => void = () => {};

function membersFromPresence(): PartyMember[] {
  if (!channel) return [];
  const state = channel.presenceState<PartyMember>();
  return Object.values(state)
    .flat()
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

function connect(
  code: string,
  nickname: string,
  isHost: boolean,
  onMembersChange: (members: PartyMember[]) => void,
  onStart: (payload: StartPayload) => void,
  maxSize?: number,
  mode?: PartyMode,
): Promise<void> {
  leaveRoom();
  roomCode = code;
  hostFlag = isHost;
  startFired = false;
  myMember = null;
  membersHandler = onMembersChange;
  startHandler = onStart;
  monsterSyncHandler = () => {};
  damageHandler = () => {};
  killRewardHandler = () => {};
  gameOverHandler = () => {};
  gameSpeedHandler = () => {};
  versusStatusHandler = () => {};
  versusGiftHandler = () => {};
  versusEliminatedHandler = () => {};
  versusWinHandler = () => {};
  chatHandler = () => {};
  auraHandler = () => {};
  // roomFullHandler는 leaveRoom()에서 지우지 않는다 — 정원 초과로 스스로 나갈 때
  // leaveRoom()을 호출한 "다음"에 이 핸들러를 불러야 하기 때문.

  channel = supabase.channel(`party-room-${code}`, {
    config: { presence: { key: nickname } },
  });

  channel.on('presence', { event: 'sync' }, () => {
    latestMembers = membersFromPresence();
    membersHandler(latestMembers);

    // 시작 알림 메시지(broadcast)는 한 번 보내면 끝이라 네트워크 사정으로 놓칠 수 있다(특히 휴대폰).
    // 방장이 프레즌스에 "시작됨"을 올려두므로, 메시지를 못 받았어도 여기서 알아채고 게임을 시작한다.
    if (!isHost && !startFired) {
      const startedHost = latestMembers.find((m) => m.isHost && m.started && m.mode);
      if (startedHost && startedHost.mode) {
        startFired = true;
        startHandler({ mode: startedHost.mode });
        return;
      }
    }

    // 참가자 쪽에서만 정원을 확인한다. 방장이 정해둔 정원(maxSize)보다 늦게
    // 들어온(joinedAt 기준) 사람은 스스로 방을 나간다. 서버가 없는 구조라
    // 완벽하게 막을 수는 없지만, 친구끼리 쓰는 캐주얼한 용도로는 충분하다.
    if (!isHost) {
      const host = latestMembers.find((m) => m.isHost);
      const cap = host?.maxSize;
      if (cap) {
        const sorted = [...latestMembers].sort((a, b) => a.joinedAt - b.joinedAt);
        const myIndex = sorted.findIndex((m) => m.nickname === nickname);
        if (myIndex >= cap) {
          leaveRoom();
          roomFullHandler();
        }
      }
    }
  });

  channel.on('broadcast', { event: 'start' }, (msg) => {
    if (startFired) return;
    startFired = true;
    startHandler(msg.payload as StartPayload);
  });

  channel.on('broadcast', { event: 'monster-sync' }, (msg) => {
    monsterSyncHandler(decodeSync(msg.payload as WireSync));
  });

  channel.on('broadcast', { event: 'damage' }, (msg) => {
    damageHandler(msg.payload as DamageEventPayload);
  });

  // 파티원이 여러 번 때린 것을 한 메시지로 묶어 보낸 것을 풀어서, 하나씩 방장 처리 함수로 넘긴다.
  channel.on('broadcast', { event: 'damage-batch' }, (msg) => {
    const payload = msg.payload as WireDamageBatch;
    payload.h.forEach((hit) => {
      damageHandler({
        monsterId: hit[0],
        amount: hit[1],
        from: payload.f,
        unitId: hit[2] || undefined,
        magnitude: hit[3],
      });
    });
  });

  channel.on('broadcast', { event: 'kill-reward' }, (msg) => {
    killRewardHandler(msg.payload as KillRewardPayload);
  });

  channel.on('broadcast', { event: 'game-over' }, (msg) => {
    gameOverHandler(msg.payload as GameOverPayload);
  });

  channel.on('broadcast', { event: 'game-speed' }, (msg) => {
    gameSpeedHandler(msg.payload as GameSpeedPayload);
  });

  channel.on('broadcast', { event: 'versus-status' }, (msg) => {
    versusStatusHandler(msg.payload as VersusStatusPayload);
  });

  channel.on('broadcast', { event: 'versus-gift' }, (msg) => {
    versusGiftHandler(msg.payload as VersusGiftPayload);
  });

  channel.on('broadcast', { event: 'versus-eliminated' }, (msg) => {
    versusEliminatedHandler(msg.payload as VersusEliminatedPayload);
  });

  channel.on('broadcast', { event: 'versus-win' }, (msg) => {
    versusWinHandler(msg.payload as VersusWinPayload);
  });

  channel.on('broadcast', { event: 'chat' }, (msg) => {
    chatHandler(msg.payload as ChatPayload);
  });

  channel.on('broadcast', { event: 'aura' }, (msg) => {
    auraHandler(msg.payload as AuraPayload);
  });

  return new Promise((resolve, reject) => {
    channel!.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        const member: PartyMember = { nickname, isHost, joinedAt: Date.now() };
        if (isHost && maxSize) member.maxSize = maxSize;
        if (isHost && mode) member.mode = mode;
        myMember = member;
        void channel!.track(member);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error('방에 연결하지 못했어요. 다시 시도해주세요.'));
      }
    });
  });
}

export async function createRoom(
  code: string,
  nickname: string,
  maxSize: number,
  mode: PartyMode,
  onMembersChange: (members: PartyMember[]) => void,
  onStart: (payload: StartPayload) => void,
): Promise<void> {
  await connect(code.toUpperCase(), nickname, true, onMembersChange, onStart, maxSize, mode);
}

export async function joinRoom(
  code: string,
  nickname: string,
  onMembersChange: (members: PartyMember[]) => void,
  onStart: (payload: StartPayload) => void,
): Promise<void> {
  await connect(code.toUpperCase(), nickname, false, onMembersChange, onStart);
}

export function leaveRoom(): void {
  damageQueue = [];
  if (damageFlushTimer !== undefined) {
    window.clearTimeout(damageFlushTimer);
    damageFlushTimer = undefined;
  }
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  hostFlag = false;
  roomCode = '';
  latestMembers = [];
  membersHandler = () => {};
  startHandler = () => {};
  monsterSyncHandler = () => {};
  damageHandler = () => {};
  killRewardHandler = () => {};
  gameOverHandler = () => {};
  gameSpeedHandler = () => {};
  versusStatusHandler = () => {};
  versusGiftHandler = () => {};
  versusEliminatedHandler = () => {};
  versusWinHandler = () => {};
  chatHandler = () => {};
  auraHandler = () => {};
  // roomFullHandler는 여기서 지우지 않는다 — 정원 초과로 나갈 때는 leaveRoom() 안에서
  // 호출한 뒤 곧바로 이 핸들러로 알려줘야 하기 때문에, 연결 하나에 묶이지 않는다.
}

export function broadcastStart(payload: StartPayload): void {
  startFired = true;
  channel?.send({ type: 'broadcast', event: 'start', payload });

  // 메시지를 놓친 참가자를 위한 보험: 방장 프레즌스에 "시작됨"과 모드를 올려둔다.
  if (hostFlag && channel && myMember) {
    myMember = { ...myMember, started: true, mode: payload.mode };
    void channel.track(myMember);
  }
}

export function setMonsterSyncHandler(handler: (payload: MonsterSyncPayload) => void): void {
  monsterSyncHandler = handler;
}

export function setMembersHandler(handler: (members: PartyMember[]) => void): void {
  membersHandler = handler;
}

// ----- 몬스터 위치 전달을 가볍게: 이름표 대신 숫자 배열로 압축해서 보낸다 -----
// 후반에 몬스터가 100마리 가까이 되면 예전 방식(글자 이름표 포함)은 한 번에 9KB 가까이 돼서
// 초당 6~7번 보내면 휴대폰 회선에 부담이 컸다. 몬스터 하나를 [번호, 종류, 모양, 위치, 체력, 최대체력, 상태]
// 일곱 개 숫자로 줄이면 크기가 1/4 정도가 된다.
const KIND_IDS = ['normal', 'elite', 'boss'];
const SPECIES_IDS: string[] = MONSTER_SPECIES.map((sp) => sp.id as string);

interface WireSync {
  a: string; // 맵 이름
  g: number; // 스테이지
  m: number[][]; // [id, kind, species, t*10000, hp, maxHp, st]
}

function encodeSync(payload: MonsterSyncPayload): WireSync {
  return {
    a: payload.mapId,
    g: payload.stage,
    m: payload.monsters.map((m) => [
      m.id,
      Math.max(0, KIND_IDS.indexOf(m.kind)),
      Math.max(0, SPECIES_IDS.indexOf(m.species)),
      Math.round(m.t * 10000),
      Math.ceil(m.hp),
      Math.round(m.maxHp),
      m.st ?? 0,
    ]),
  };
}

function decodeSync(wire: WireSync): MonsterSyncPayload {
  return {
    mapId: wire.a,
    stage: wire.g,
    monsters: wire.m.map((v) => ({
      id: v[0],
      kind: KIND_IDS[v[1]] ?? 'normal',
      species: SPECIES_IDS[v[2]] ?? SPECIES_IDS[0],
      t: v[3] / 10000,
      hp: v[4],
      maxHp: v[5],
      st: v[6],
    })),
  };
}

export function broadcastMonsterSync(payload: MonsterSyncPayload): void {
  channel?.send({ type: 'broadcast', event: 'monster-sync', payload: encodeSync(payload) });
}

export function setDamageHandler(handler: (payload: DamageEventPayload) => void): void {
  damageHandler = handler;
}

// 공격할 때마다 메시지를 하나씩 보내면 후반(유닛 많고 공격 빠름)에 초당 수백 개가 되어 실시간 서버의
// 초당 메시지 제한에 걸려 멈추거나 끊긴다. 그래서 0.12초 동안 쌓인 공격을 한 메시지로 묶어 보낸다.
const DAMAGE_FLUSH_MS = 120;
const MAX_HITS_PER_MESSAGE = 80;
const MAX_QUEUED_HITS = 240;

type WireHit = [number, number, string, number]; // [몬스터 번호, 피해, 유닛 id, 효과 배율]
interface WireDamageBatch {
  f: string; // 보낸 사람 닉네임
  h: WireHit[];
}

let damageQueue: DamageEventPayload[] = [];
let damageFlushTimer: number | undefined;

function flushDamage(): void {
  damageFlushTimer = undefined;
  const queue = damageQueue;
  damageQueue = [];
  if (!channel) return;

  while (queue.length > 0) {
    const chunk = queue.splice(0, MAX_HITS_PER_MESSAGE);
    const payload: WireDamageBatch = {
      f: chunk[0].from,
      h: chunk.map((hit): WireHit => [hit.monsterId, hit.amount, hit.unitId ?? '', hit.magnitude ?? 1]),
    };
    channel.send({ type: 'broadcast', event: 'damage-batch', payload });
  }
}

export function broadcastDamage(payload: DamageEventPayload): void {
  damageQueue.push(payload);
  if (damageQueue.length > MAX_QUEUED_HITS) damageQueue.splice(0, damageQueue.length - MAX_QUEUED_HITS);
  if (damageFlushTimer === undefined) damageFlushTimer = window.setTimeout(flushDamage, DAMAGE_FLUSH_MS);
}

export function setKillRewardHandler(handler: (payload: KillRewardPayload) => void): void {
  killRewardHandler = handler;
}

export function broadcastKillReward(payload: KillRewardPayload): void {
  channel?.send({ type: 'broadcast', event: 'kill-reward', payload });
}

export function setGameOverHandler(handler: (payload: GameOverPayload) => void): void {
  gameOverHandler = handler;
}

export function broadcastGameOver(payload: GameOverPayload): void {
  channel?.send({ type: 'broadcast', event: 'game-over', payload });
}

export function setGameSpeedHandler(handler: (payload: GameSpeedPayload) => void): void {
  gameSpeedHandler = handler;
}

export function broadcastGameSpeed(payload: GameSpeedPayload): void {
  channel?.send({ type: 'broadcast', event: 'game-speed', payload });
}

export function setRoomFullHandler(handler: () => void): void {
  roomFullHandler = handler;
}

export function setVersusStatusHandler(handler: (payload: VersusStatusPayload) => void): void {
  versusStatusHandler = handler;
}

export function broadcastVersusStatus(payload: VersusStatusPayload): void {
  channel?.send({ type: 'broadcast', event: 'versus-status', payload });
}

export function setVersusGiftHandler(handler: (payload: VersusGiftPayload) => void): void {
  versusGiftHandler = handler;
}

export function broadcastVersusGift(payload: VersusGiftPayload): void {
  channel?.send({ type: 'broadcast', event: 'versus-gift', payload });
}

export function setVersusEliminatedHandler(handler: (payload: VersusEliminatedPayload) => void): void {
  versusEliminatedHandler = handler;
}

export function broadcastVersusEliminated(payload: VersusEliminatedPayload): void {
  channel?.send({ type: 'broadcast', event: 'versus-eliminated', payload });
}

export function setVersusWinHandler(handler: (payload: VersusWinPayload) => void): void {
  versusWinHandler = handler;
}

export function broadcastVersusWin(payload: VersusWinPayload): void {
  channel?.send({ type: 'broadcast', event: 'versus-win', payload });
}

export function setChatHandler(handler: (payload: ChatPayload) => void): void {
  chatHandler = handler;
}

export function broadcastChat(payload: ChatPayload): void {
  channel?.send({ type: 'broadcast', event: 'chat', payload });
}

// ----- 로비(지금 열려 있는 방 목록) -----

function lobbyRoomsFromPresence(): LobbyRoomInfo[] {
  if (!lobbyChannel) return [];
  const state = lobbyChannel.presenceState<LobbyRoomInfo>();
  return Object.values(state).flat();
}

// 파티 화면에 들어오면 한 번 호출한다. 이후 방을 열거나 닫을 때는
// publishRoomToLobby/unpublishRoomFromLobby만 부르면 되고, 이 연결 자체는
// 파티 화면을 나갈 때 disconnectLobby()로 끊는다.
export function connectLobby(nickname: string, onListChange: (rooms: LobbyRoomInfo[]) => void): Promise<void> {
  if (lobbyChannel) {
    onListChange(lobbyRoomsFromPresence());
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    lobbyChannel = supabase.channel(LOBBY_CHANNEL_NAME, {
      config: { presence: { key: nickname } },
    });

    lobbyChannel.on('presence', { event: 'sync' }, () => {
      onListChange(lobbyRoomsFromPresence());
    });

    lobbyChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
    });
  });
}

export function publishRoomToLobby(info: LobbyRoomInfo): void {
  void lobbyChannel?.track(info);
}

export function unpublishRoomFromLobby(): void {
  void lobbyChannel?.untrack();
}

export function disconnectLobby(): void {
  if (lobbyChannel) {
    void supabase.removeChannel(lobbyChannel);
    lobbyChannel = null;
  }
}

export function setAuraHandler(handler: (payload: AuraPayload) => void): void {
  auraHandler = handler;
}

export function broadcastAura(payload: AuraPayload): void {
  channel?.send({ type: 'broadcast', event: 'aura', payload });
}

export function isRoomHost(): boolean {
  return hostFlag;
}

export function currentRoomCode(): string {
  return roomCode;
}

export function isInRoom(): boolean {
  return channel !== null;
}

export function getLatestMembers(): PartyMember[] {
  return latestMembers;
}
