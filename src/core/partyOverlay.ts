import {
  createRoom,
  joinRoom,
  leaveRoom as leavePartyRoom,
  broadcastStart,
  isRoomHost,
  currentRoomCode,
  type PartyMember,
} from '../meta/party';

const STYLE_ID = 'rd-party-style';

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rd-party-overlay {
      position: fixed;
      inset: 0;
      z-index: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 30%, #10131f 0%, #07080d 70%);
      font-family: 'Noto Serif KR', serif;
      color: #f0e9d8;
    }
    .rd-party-card {
      width: min(90vw, 380px);
      max-height: 88vh;
      overflow-y: auto;
      background: rgba(21, 26, 40, 0.92);
      border: 1px solid rgba(212, 179, 106, 0.55);
      border-radius: 14px;
      padding: 24px 22px;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.5);
      box-sizing: border-box;
    }
    .rd-party-back {
      color: #9a917d;
      font-size: 12px;
      cursor: pointer;
      margin-bottom: 10px;
      display: inline-block;
    }
    .rd-party-title {
      text-align: center;
      font-size: 21px;
      font-weight: 700;
      color: #f6e6b4;
      margin-bottom: 4px;
    }
    .rd-party-subtitle {
      text-align: center;
      font-size: 11.5px;
      color: #9a917d;
      margin-bottom: 18px;
    }
    .rd-party-section {
      border: 1px solid rgba(212, 179, 106, 0.3);
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .rd-party-section-title {
      font-size: 13px;
      color: #ffd98a;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .rd-party-btn {
      width: 100%;
      padding: 11px 0;
      border-radius: 10px;
      border: 2px solid #d4b36a;
      background: #151a28;
      color: #f6e6b4;
      font-family: inherit;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .rd-party-btn:disabled {
      opacity: 0.55;
      cursor: default;
    }
    .rd-party-row {
      display: flex;
      gap: 8px;
    }
    .rd-party-row input {
      flex: 1;
      min-width: 0;
      padding: 10px 10px;
      border-radius: 8px;
      border: 1px solid rgba(212, 179, 106, 0.4);
      background: #0d1018;
      color: #f0e9d8;
      font-size: 15px;
      font-family: inherit;
      letter-spacing: 2px;
      text-align: center;
      text-transform: uppercase;
      outline: none;
    }
    .rd-party-row button {
      flex-shrink: 0;
      padding: 0 16px;
      border-radius: 8px;
      border: 2px solid #8fbfff;
      background: #151a28;
      color: #9fd8ff;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .rd-party-row button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .rd-party-error {
      min-height: 14px;
      font-size: 11.5px;
      color: #ff8a8a;
      margin-top: 8px;
      text-align: center;
    }
    .rd-party-code-display {
      text-align: center;
      font-size: 34px;
      font-weight: 700;
      letter-spacing: 8px;
      color: #ffd98a;
      margin: 6px 0 4px;
    }
    .rd-party-code-hint {
      text-align: center;
      font-size: 11px;
      color: #9a917d;
      margin-bottom: 16px;
    }
    .rd-party-members {
      list-style: none;
      margin: 0 0 16px;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .rd-party-member {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-radius: 8px;
      background: #0d1018;
      border: 1px solid rgba(212, 179, 106, 0.25);
      font-size: 13px;
    }
    .rd-party-member-host {
      color: #ffd98a;
      font-size: 10.5px;
      font-weight: 700;
    }
    .rd-party-status {
      text-align: center;
      font-size: 12.5px;
      color: #9a917d;
      margin-bottom: 12px;
    }
    .rd-party-status.rd-party-status-live {
      color: #a8ffb0;
      font-weight: 700;
    }
    .rd-party-leave {
      width: 100%;
      margin-top: 10px;
      padding: 9px 0;
      border-radius: 8px;
      border: 1.5px solid rgba(255, 154, 154, 0.6);
      background: transparent;
      color: #ff9a9a;
      font-family: inherit;
      font-size: 12.5px;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

export function mountPartyOverlay(nickname: string, onBack: () => void): { unmount: () => void } {
  injectStyle();

  let view: 'menu' | 'waiting' = 'menu';
  let members: PartyMember[] = [];
  let busy = false;
  let errorMsg = '';
  let gameStarted = false;
  let codeInputValue = '';

  const overlay = document.createElement('div');
  overlay.className = 'rd-party-overlay';
  document.body.appendChild(overlay);

  function handleMembersChange(next: PartyMember[]): void {
    members = next;
    if (view === 'waiting') render();
  }

  function handleRoomStart(): void {
    gameStarted = true;
    if (view === 'waiting') render();
  }

  function handleCreate(): void {
    if (busy) return;
    busy = true;
    errorMsg = '';
    render();

    createRoom(nickname, handleMembersChange, handleRoomStart)
      .then(() => {
        busy = false;
        gameStarted = false;
        view = 'waiting';
        render();
      })
      .catch((err: Error) => {
        busy = false;
        errorMsg = err.message;
        render();
      });
  }

  function handleJoin(code: string): void {
    if (busy) return;
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      errorMsg = '방 코드를 입력해주세요';
      render();
      return;
    }

    busy = true;
    errorMsg = '';
    render();

    joinRoom(trimmed, nickname, handleMembersChange, handleRoomStart)
      .then(() => {
        busy = false;
        gameStarted = false;
        view = 'waiting';
        render();
      })
      .catch((err: Error) => {
        busy = false;
        errorMsg = err.message;
        render();
      });
  }

  function handleHostStart(): void {
    broadcastStart();
    handleRoomStart();
  }

  function handleLeave(): void {
    leavePartyRoom();
    view = 'menu';
    members = [];
    gameStarted = false;
    errorMsg = '';
    codeInputValue = '';
    render();
  }

  function handleBack(): void {
    unmount();
    onBack();
  }

  function render(): void {
    overlay.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'rd-party-card';
    overlay.appendChild(card);

    if (view === 'menu') renderMenu(card);
    else renderWaiting(card);
  }

  function renderMenu(card: HTMLDivElement): void {
    const back = document.createElement('div');
    back.className = 'rd-party-back';
    back.textContent = '← 뒤로';
    back.addEventListener('click', handleBack);
    card.appendChild(back);

    const title = document.createElement('div');
    title.className = 'rd-party-title';
    title.textContent = '협동 파티전';
    card.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'rd-party-subtitle';
    subtitle.textContent = '친구와 같은 방에 모여보세요 (베타 · 대기실만 가능)';
    card.appendChild(subtitle);

    const createSection = document.createElement('div');
    createSection.className = 'rd-party-section';
    const createTitle = document.createElement('div');
    createTitle.className = 'rd-party-section-title';
    createTitle.textContent = '방 만들기';
    createSection.appendChild(createTitle);

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'rd-party-btn';
    createBtn.textContent = busy ? '연결 중...' : '새 방 만들기';
    createBtn.disabled = busy;
    createBtn.addEventListener('click', handleCreate);
    createSection.appendChild(createBtn);
    card.appendChild(createSection);

    const joinSection = document.createElement('div');
    joinSection.className = 'rd-party-section';
    const joinTitle = document.createElement('div');
    joinTitle.className = 'rd-party-section-title';
    joinTitle.textContent = '코드로 참가하기';
    joinSection.appendChild(joinTitle);

    const row = document.createElement('div');
    row.className = 'rd-party-row';

    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.maxLength = 5;
    codeInput.placeholder = '방 코드';
    codeInput.value = codeInputValue;
    codeInput.addEventListener('input', () => {
      codeInputValue = codeInput.value.toUpperCase();
      codeInput.value = codeInputValue;
    });
    row.appendChild(codeInput);

    const joinBtn = document.createElement('button');
    joinBtn.type = 'button';
    joinBtn.textContent = busy ? '연결 중...' : '참가하기';
    joinBtn.disabled = busy;
    joinBtn.addEventListener('click', () => handleJoin(codeInput.value));
    row.appendChild(joinBtn);

    joinSection.appendChild(row);
    card.appendChild(joinSection);

    const errorText = document.createElement('div');
    errorText.className = 'rd-party-error';
    errorText.textContent = errorMsg;
    card.appendChild(errorText);
  }

  function renderWaiting(card: HTMLDivElement): void {
    const title = document.createElement('div');
    title.className = 'rd-party-title';
    title.textContent = '대기실';
    card.appendChild(title);

    const codeDisplay = document.createElement('div');
    codeDisplay.className = 'rd-party-code-display';
    codeDisplay.textContent = currentRoomCode();
    card.appendChild(codeDisplay);

    const codeHint = document.createElement('div');
    codeHint.className = 'rd-party-code-hint';
    codeHint.textContent = '이 코드를 친구에게 알려주세요';
    card.appendChild(codeHint);

    const list = document.createElement('ul');
    list.className = 'rd-party-members';
    members.forEach((m) => {
      const item = document.createElement('li');
      item.className = 'rd-party-member';

      const name = document.createElement('span');
      name.textContent = `${m.nickname}${m.nickname === nickname ? ' (나)' : ''}`;
      item.appendChild(name);

      if (m.isHost) {
        const hostTag = document.createElement('span');
        hostTag.className = 'rd-party-member-host';
        hostTag.textContent = '방장';
        item.appendChild(hostTag);
      }

      list.appendChild(item);
    });
    card.appendChild(list);

    const status = document.createElement('div');
    if (gameStarted) {
      status.className = 'rd-party-status rd-party-status-live';
      status.textContent = '🎉 게임 시작! (실제 협동 전투는 다음 업데이트에서 연결돼요)';
    } else if (isRoomHost()) {
      status.className = 'rd-party-status';
      status.textContent = `모인 인원: ${members.length}명 · 준비되면 아래 버튼을 눌러주세요`;
    } else {
      status.className = 'rd-party-status';
      status.textContent = '방장이 시작하길 기다리는 중...';
    }
    card.appendChild(status);

    if (isRoomHost() && !gameStarted) {
      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'rd-party-btn';
      startBtn.textContent = '게임 시작';
      startBtn.addEventListener('click', handleHostStart);
      card.appendChild(startBtn);
    }

    const leaveBtn = document.createElement('button');
    leaveBtn.type = 'button';
    leaveBtn.className = 'rd-party-leave';
    leaveBtn.textContent = '방 나가기';
    leaveBtn.addEventListener('click', handleLeave);
    card.appendChild(leaveBtn);
  }

  function unmount(): void {
    leavePartyRoom();
    overlay.remove();
  }

  render();
  return { unmount };
}
