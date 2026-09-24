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
}

export interface MonsterSnapshot {
  id: number;
  kind: string;
  species: string;
  t: number; // 길을 따라 이동한 진행도 (0~1)
  hp: number;
  maxHp: number;
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

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I 제외
const CODE_LENGTH = 5;

let channel: RealtimeChannel | null = null;
let hostFlag = false;
let roomCode = '';
let latestMembers: PartyMember[] = [];

let membersHandler: (members: PartyMember[]) => void = () => {};
let startHandler: () => void = () => {};
let monsterSyncHandler: (payload: MonsterSyncPayload) => void = () => {};
let damageHandler: (payload: DamageEventPayload) => void = () => {};
let killRewardHandler: (payload: KillRewardPayload) => void = () => {};
let gameOverHandler: (payload: GameOverPayload) => void = () => {};
let gameSpeedHandler: (payload: GameSpeedPayload) => void = () => {};
let roomFullHandler: () => void = () => {};

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

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
  onStart: () => void,
  maxSize?: number,
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

  channel.on('broadcast', { event: 'start' }, () => {
    startHandler();
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

  return new Promise((resolve, reject) => {
    channel!.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        const member: PartyMember = { nickname, isHost, joinedAt: Date.now() };
        if (isHost && maxSize) member.maxSize = maxSize;
        void channel!.track(member);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error('방에 연결하지 못했어요. 다시 시도해주세요.'));
      }
    });
  });
}

export async function createRoom(
  nickname: string,
  maxSize: number,
  onMembersChange: (members: PartyMember[]) => void,
  onStart: () => void,
): Promise<string> {
  const code = randomCode();
  await connect(code, nickname, true, onMembersChange, onStart, maxSize);
  return code;
}

export async function joinRoom(
  code: string,
  nickname: string,
  onMembersChange: (members: PartyMember[]) => void,
  onStart: () => void,
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
  // roomFullHandler는 여기서 지우지 않는다 — 정원 초과로 나갈 때는 leaveRoom() 안에서
  // 호출한 뒤 곧바로 이 핸들러로 알려줘야 하기 때문에, 연결 하나에 묶이지 않는다.
}

export function broadcastStart(): void {
  channel?.send({ type: 'broadcast', event: 'start', payload: {} });
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
