import { getChatHistory, getMyNickname, sendGlobalChat, subscribeChat, subscribeOnline } from '../meta/globalChat';

// 덱 선택 화면 아래쪽 빈 공간에 "항상 보이는" 공용 채팅창. 버튼을 눌러 여는 방식이 아니라 새 메시지가
// 오면 바로 보인다. 접속 중인 사람 목록도 맨 위에 실시간으로 보인다. 화면을 나갈 때는 destroy()를 불러야 한다.

const STYLE_ID = 'rd-inline-chat-style';

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rd-inline-chat {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      width: min(96vw, 520px);
      bottom: calc(8px + env(safe-area-inset-bottom) + var(--rd-kb, 0px));
      display: flex;
      flex-direction: column;
      background: rgba(10, 12, 20, 0.92);
      border: 1px solid rgba(212, 179, 106, 0.45);
      border-radius: 12px;
      z-index: 850;
      font-family: 'Noto Serif KR', serif;
      overflow: hidden;
    }
    .rd-inline-online {
      padding: 5px 10px;
      font-size: 11px;
      color: #8fd39a;
      border-bottom: 1px solid rgba(212, 179, 106, 0.25);
      flex-shrink: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .rd-inline-list {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 6px 10px;
      min-height: 0;
    }
    .rd-inline-row {
      font-size: 12.5px;
      color: #d9d2bf;
      line-height: 1.45;
      word-break: break-all;
    }
    .rd-inline-row.mine .rd-inline-name { color: #ffd98a; }
    .rd-inline-name {
      color: #9fd8ff;
      font-weight: 700;
      margin-right: 6px;
    }
    .rd-inline-empty {
      color: #6a6458;
      font-size: 12px;
      text-align: center;
      padding: 8px 0;
    }
    .rd-inline-form {
      display: flex;
      gap: 6px;
      padding: 6px;
      border-top: 1px solid rgba(212, 179, 106, 0.25);
      flex-shrink: 0;
    }
    .rd-inline-form input {
      flex: 1;
      min-width: 0;
      background: #0d1018;
      border: 1px solid rgba(212, 179, 106, 0.4);
      border-radius: 8px;
      color: #f0e9d8;
      padding: 7px 10px;
      font-size: 16px;
      font-family: inherit;
      outline: none;
    }
    .rd-inline-form button {
      background: #2a2416;
      border: 1px solid #d4b36a;
      border-radius: 8px;
      color: #ffd98a;
      padding: 0 14px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

export interface InlineChatHandle {
  // 채팅창 윗부분의 화면 위치(CSS 픽셀). 그 아래 빈 공간을 모두 채운다.
  setTop(cssTop: number): void;
  destroy(): void;
}

export function mountInlineChat(): InlineChatHandle {
  injectStyle();

  const root = document.createElement('div');
  root.className = 'rd-inline-chat';
  document.body.appendChild(root);

  const online = document.createElement('div');
  online.className = 'rd-inline-online';
  online.textContent = '🟢 접속 중인 사람을 불러오는 중...';
  root.appendChild(online);

  const list = document.createElement('div');
  list.className = 'rd-inline-list';
  root.appendChild(list);

  const empty = document.createElement('div');
  empty.className = 'rd-inline-empty';
  empty.textContent = '아직 대화가 없어요. 첫 메시지를 보내보세요!';
  list.appendChild(empty);

  const form = document.createElement('form');
  form.className = 'rd-inline-form';
  root.appendChild(form);

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 120;
  input.placeholder = '메시지 입력...';
  form.appendChild(input);

  const send = document.createElement('button');
  send.type = 'submit';
  send.textContent = '보내기';
  form.appendChild(send);

  let hasMessages = false;

  function addMessage(nickname: string, message: string, isMine: boolean): void {
    if (!hasMessages) {
      hasMessages = true;
      empty.remove();
    }
    const row = document.createElement('div');
    row.className = isMine ? 'rd-inline-row mine' : 'rd-inline-row';
    const name = document.createElement('span');
    name.className = 'rd-inline-name';
    name.textContent = nickname;
    const text = document.createElement('span');
    text.textContent = message;
    row.appendChild(name);
    row.appendChild(text);
    list.appendChild(row);
    // 오래된 메시지는 지워서 화면이 무거워지지 않게 한다
    while (list.childElementCount > 80) list.firstElementChild?.remove();
    list.scrollTop = list.scrollHeight;
  }

  getChatHistory().forEach((msg) => addMessage(msg.nickname, msg.message, msg.nickname === getMyNickname()));

  const unsubscribeChat = subscribeChat((msg) => addMessage(msg.nickname, msg.message, msg.nickname === getMyNickname()));
  const unsubscribeOnline = subscribeOnline((nicknames) => {
    const me = getMyNickname();
    const others = nicknames.filter((n) => n !== me).sort();
    const names = [...others, ...(nicknames.includes(me) ? [`${me}(나)`] : [])];
    online.textContent = names.length > 0 ? `🟢 접속 중 ${names.length}명: ${names.join(', ')}` : '🟢 접속 중인 사람이 없어요';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    sendGlobalChat(text);
    input.value = '';
  });

  return {
    setTop(cssTop: number) {
      const available = window.innerHeight - cssTop;
      // 남는 공간이 너무 좁으면(아주 작은 화면) 숨긴다
      root.style.display = available < 110 ? 'none' : 'flex';
      root.style.top = `${Math.round(cssTop)}px`;
    },
    destroy() {
      unsubscribeChat();
      unsubscribeOnline();
      root.remove();
    },
  };
}
