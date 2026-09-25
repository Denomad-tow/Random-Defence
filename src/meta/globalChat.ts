import { supabase } from '../core/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

// 로그인한 모든 사람이 앱을 켜는 동안 들어가 있는 공용 실시간 채널 하나로
// (1) "지금 접속 중인 사람" 목록(프레즌스)과 (2) 덱 선택·개인전 화면 공용 채팅
// (브로드캐스트)을 함께 처리한다. 파티전 안의 채팅은 별도(파티 채널)라 여기와 무관하다.
// 서버 표(table)가 없어서 채팅 기록은 저장되지 않고, 이 브라우저가 켜져 있는 동안의
// 최근 대화만 메모리에 들고 있다.

export interface GlobalChatMessage {
  nickname: string;
  message: string;
}

const CHANNEL_NAME = 'global-lobby';
const HISTORY_LIMIT = 50;
const MAX_MESSAGE_LENGTH = 120;

let channel: RealtimeChannel | null = null;
let myNickname = '';
let history: GlobalChatMessage[] = [];
const messageListeners = new Set<(msg: GlobalChatMessage) => void>();
const onlineListeners = new Set<(nicknames: string[]) => void>();

function onlineFromPresence(): string[] {
  if (!channel) return [];
  return Object.keys(channel.presenceState());
}

function notifyOnline(): void {
  const list = onlineFromPresence();
  onlineListeners.forEach((listener) => listener(list));
}

function pushHistory(msg: GlobalChatMessage): void {
  history.push(msg);
  if (history.length > HISTORY_LIMIT) history = history.slice(-HISTORY_LIMIT);
  messageListeners.forEach((listener) => listener(msg));
}

// 로그인 직후 한 번 호출한다. 이미 연결돼 있으면 아무것도 하지 않는다.
export function connectGlobalChat(nickname: string): void {
  if (channel || !nickname) return;
  myNickname = nickname;

  channel = supabase.channel(CHANNEL_NAME, {
    config: { presence: { key: nickname } },
  });

  channel.on('presence', { event: 'sync' }, notifyOnline);

  channel.on('broadcast', { event: 'chat' }, (event) => {
    const payload = event.payload as Partial<GlobalChatMessage> | undefined;
    if (!payload || typeof payload.nickname !== 'string' || typeof payload.message !== 'string') return;
    pushHistory({
      nickname: payload.nickname.slice(0, 12),
      message: payload.message.slice(0, MAX_MESSAGE_LENGTH),
    });
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      void channel?.track({ nickname, at: Date.now() });
    }
  });
}

export function getMyNickname(): string {
  return myNickname;
}

export function getChatHistory(): GlobalChatMessage[] {
  return history;
}

export function sendGlobalChat(message: string): void {
  const trimmed = message.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!trimmed || !channel) return;

  const msg: GlobalChatMessage = { nickname: myNickname, message: trimmed };
  // 보낸 사람 본인에게는 서버가 되돌려주지 않으므로 직접 기록에 넣는다.
  pushHistory(msg);
  void channel.send({ type: 'broadcast', event: 'chat', payload: msg });
}

export function subscribeChat(listener: (msg: GlobalChatMessage) => void): () => void {
  messageListeners.add(listener);
  return () => messageListeners.delete(listener);
}

export function getOnlineNicknames(): string[] {
  return onlineFromPresence();
}

export function subscribeOnline(listener: (nicknames: string[]) => void): () => void {
  onlineListeners.add(listener);
  listener(onlineFromPresence());
  return () => onlineListeners.delete(listener);
}
