import { supabase } from '../core/supabaseClient';
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
    startHandler(msg.payload as StartPayload);
  });

  channel.on('broadcast', { event: 'monster-sync' }, (msg) => {
    monsterSyncHandler(msg.payload as MonsterSyncPayload);
  });

  channel.on('broadcast', { event: 'damage' }, (msg) => {
    damageHandler(msg.payload as DamageEventPayload);
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
  channel?.send({ type: 'broadcast', event: 'start', payload });
}

export function setMonsterSyncHandler(handler: (payload: MonsterSyncPayload) => void): void {
  monsterSyncHandler = handler;
}

export function setMembersHandler(handler: (members: PartyMember[]) => void): void {
  membersHandler = handler;
}

export function broadcastMonsterSync(payload: MonsterSyncPayload): void {
  channel?.send({ type: 'broadcast', event: 'monster-sync', payload });
}

export function setDamageHandler(handler: (payload: DamageEventPayload) => void): void {
  damageHandler = handler;
}

export function broadcastDamage(payload: DamageEventPayload): void {
  channel?.send({ type: 'broadcast', event: 'damage', payload });
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
