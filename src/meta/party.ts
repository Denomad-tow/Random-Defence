import { supabase } from '../core/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

// "협동 파티전" 대기실: 서버 표(table) 없이 Supabase Realtime의 프레즌스(presence,
// 같은 채널에 접속한 사람 목록을 실시간으로 공유하는 기능)만으로 구현한다.
// 방 코드 = 채널 이름이라 별도 DB 저장이 필요 없고, 무료 요금제 한도 안에서 충분하다.

export interface PartyMember {
  nickname: string;
  isHost: boolean;
  joinedAt: number;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I 제외
const CODE_LENGTH = 5;

let channel: RealtimeChannel | null = null;
let hostFlag = false;
let roomCode = '';

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
): Promise<void> {
  leaveRoom();
  roomCode = code;
  hostFlag = isHost;

  channel = supabase.channel(`party-room-${code}`, {
    config: { presence: { key: nickname } },
  });

  channel.on('presence', { event: 'sync' }, () => {
    onMembersChange(membersFromPresence());
  });

  channel.on('broadcast', { event: 'start' }, () => {
    onStart();
  });

  return new Promise((resolve, reject) => {
    channel!.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel!.track({ nickname, isHost, joinedAt: Date.now() } satisfies PartyMember);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error('방에 연결하지 못했어요. 다시 시도해주세요.'));
      }
    });
  });
}

export async function createRoom(
  nickname: string,
  onMembersChange: (members: PartyMember[]) => void,
  onStart: () => void,
): Promise<string> {
  const code = randomCode();
  await connect(code, nickname, true, onMembersChange, onStart);
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
}

export function broadcastStart(): void {
  channel?.send({ type: 'broadcast', event: 'start', payload: {} });
}

export function isRoomHost(): boolean {
  return hostFlag;
}

export function currentRoomCode(): string {
  return roomCode;
}
