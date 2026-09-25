const STYLE_ID = 'rd-chat-style';

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rd-chat-toggle {
      position: fixed;
      top: 62px;
      right: 12px;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      border: 2px solid #d4b36a;
      background: rgba(21, 26, 40, 0.92);
      color: #ffd98a;
      font-size: 17px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 900;
      cursor: pointer;
      padding: 0;
    }
    .rd-chat-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 16px;
      height: 16px;
      padding: 0 3px;
      border-radius: 8px;
      background: #ff5a5a;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      display: none;
      align-items: center;
      justify-content: center;
      font-family: 'Noto Serif KR', serif;
    }
    .rd-chat-panel {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 46%;
      background: rgba(10, 12, 20, 0.97);
      border-top: 1px solid rgba(212, 179, 106, 0.5);
      border-radius: 16px 16px 0 0;
      display: flex;
      flex-direction: column;
      transform: translateY(100%);
      transition: transform 0.22s ease;
      z-index: 950;
      font-family: 'Noto Serif KR', serif;
    }
    .rd-chat-panel.rd-chat-open {
      transform: translateY(0);
    }
    .rd-chat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      color: #f6e6b4;
      font-weight: 700;
      font-size: 14px;
      border-bottom: 1px solid rgba(212, 179, 106, 0.3);
      flex-shrink: 0;
    }
    .rd-chat-close {
      background: none;
      border: none;
      color: #9a917d;
      font-size: 16px;
      cursor: pointer;
      padding: 4px 8px;
    }
    .rd-chat-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .rd-chat-row {
      font-size: 13px;
      color: #c9c2af;
      line-height: 1.4;
      word-break: break-word;
    }
    .rd-chat-name {
      font-weight: 700;
      color: #9fd8ff;
      margin-right: 6px;
    }
    .rd-chat-row.mine .rd-chat-name {
      color: #ffd98a;
    }
    .rd-chat-empty {
      font-size: 12px;
      color: #6a6458;
      text-align: center;
      margin-top: 12px;
    }
    .rd-chat-form {
      display: flex;
      gap: 8px;
      padding: 10px 14px;
      padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid rgba(212, 179, 106, 0.3);
      flex-shrink: 0;
    }
    .rd-chat-form input {
      flex: 1;
      min-width: 0;
      padding: 9px 10px;
      border-radius: 8px;
      border: 1px solid rgba(212, 179, 106, 0.4);
      background: #0d1018;
      color: #f0e9d8;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      box-sizing: border-box;
    }
    .rd-chat-form button {
      padding: 9px 14px;
      border-radius: 8px;
      border: 2px solid #d4b36a;
      background: #151a28;
      color: #f6e6b4;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      flex-shrink: 0;
    }
  `;
  document.head.appendChild(style);
}

export interface ChatHandle {
  addMessage(nickname: string, message: string, isMine: boolean, silent?: boolean): void;
  destroy(): void;
}

export function mountChatOverlay(onSend: (message: string) => void): ChatHandle {
  injectStyle();

  let open = false;
  let unread = 0;
  let hasMessages = false;

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'rd-chat-toggle';
  toggleBtn.textContent = '💬';
  document.body.appendChild(toggleBtn);

  const badge = document.createElement('div');
  badge.className = 'rd-chat-badge';
  toggleBtn.appendChild(badge);

  const panel = document.createElement('div');
  panel.className = 'rd-chat-panel';
  document.body.appendChild(panel);

  const header = document.createElement('div');
  header.className = 'rd-chat-header';
  header.textContent = '채팅';
  panel.appendChild(header);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'rd-chat-close';
  closeBtn.textContent = '✕';
  header.appendChild(closeBtn);

  const list = document.createElement('div');
  list.className = 'rd-chat-list';
  panel.appendChild(list);

  const emptyHint = document.createElement('div');
  emptyHint.className = 'rd-chat-empty';
  emptyHint.textContent = '아직 대화가 없어요. 첫 메시지를 보내보세요!';
  list.appendChild(emptyHint);

  const form = document.createElement('form');
  form.className = 'rd-chat-form';
  panel.appendChild(form);

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 120;
  input.placeholder = '메시지 입력...';
  form.appendChild(input);

  const sendBtn = document.createElement('button');
  sendBtn.type = 'submit';
  sendBtn.textContent = '보내기';
  form.appendChild(sendBtn);

  function setOpen(next: boolean): void {
    open = next;
    panel.classList.toggle('rd-chat-open', open);
    if (open) {
      unread = 0;
      badge.style.display = 'none';
      input.focus();
    }
  }

  toggleBtn.addEventListener('click', () => setOpen(!open));
  closeBtn.addEventListener('click', () => setOpen(false));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    onSend(text);
    input.value = '';
  });

  return {
    addMessage(nickname, message, isMine, silent = false) {
      if (!hasMessages) {
        hasMessages = true;
        emptyHint.remove();
      }

      const row = document.createElement('div');
      row.className = isMine ? 'rd-chat-row mine' : 'rd-chat-row';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'rd-chat-name';
      nameSpan.textContent = nickname;
      const msgSpan = document.createElement('span');
      msgSpan.textContent = message;
      row.appendChild(nameSpan);
      row.appendChild(msgSpan);
      list.appendChild(row);
      list.scrollTop = list.scrollHeight;

      if (!open && !isMine && !silent) {
        unread += 1;
        badge.textContent = String(unread);
        badge.style.display = 'flex';
      }
    },
    destroy() {
      toggleBtn.remove();
      panel.remove();
    },
  };
}
