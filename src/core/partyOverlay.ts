import {
  createRoom,
  joinRoom,
  leaveRoom as leavePartyRoom,
  broadcastStart,
  isRoomHost,
  currentRoomCode,
  setRoomFullHandler,
  connectLobby,
  disconnectLobby,
  publishRoomToLobby,
  unpublishRoomFromLobby,
  type PartyMember,
  type PartyMode,
  type StartPayload,
  type LobbyRoomInfo,
} from '../meta/party';

const PARTY_SIZE_OPTIONS = [2, 3, 4, 5];
const DEFAULT_PARTY_SIZE = 4;

const PARTY_MODE_OPTIONS: { value: PartyMode; label: string; hint: string }[] = [
  { value: 'coop', label: '협동전', hint: '몬스터 체력을 다 같이 공유해서 함께 막아요' },
  { value: 'versus-normal', label: '경쟁전(일반)', hint: '각자 자기 필드에서, 지금까지 키운 덱 그대로 승부해요' },
  { value: 'versus-balanced', label: '경쟁전(균형)', hint: '각자 자기 필드에서, 모두 같은 조건(일반 등급)으로 승부해요' },
];
const DEFAULT_PARTY_MODE: PartyMode = 'coop';

function modeLabel(mode: PartyMode | undefined): string {
  return PARTY_MODE_OPTIONS.find((m) => m.value === mode)?.label ?? '협동전';
}

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
    .rd-party-mode-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 10px;
    }
    .rd-party-mode-btn {
      text-align: left;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1.5px solid rgba(212, 179, 106, 0.4);
      background: #0d1018;
      color: #9a917d;
      font-family: inherit;
      cursor: pointer;
    }
    .rd-party-mode-btn.rd-party-mode-active {
      border-color: #d4b36a;
      background: #2a2416;
    }
    .rd-party-mode-btn-label {
      font-size: 13px;
      font-weight: 700;
      color: inherit;
    }
    .rd-party-mode-btn.rd-party-mode-active .rd-party-mode-btn-label {
      color: #ffd98a;
    }
    .rd-party-mode-btn-hint {
      font-size: 10.5px;
      color: #8a8272;
      margin-top: 2px;
    }
    .rd-party-mode-display {
      text-align: center;
      font-size: 12px;
      color: #9fd8ff;
      margin-bottom: 10px;
    }
    .rd-party-size-row {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    }
    .rd-party-size-btn {
      flex: 1;
      padding: 8px 0;
      border-radius: 8px;
      border: 1.5px solid rgba(212, 179, 106, 0.4);
      background: #0d1018;
      color: #9a917d;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .rd-party-size-btn.rd-party-size-active {
      border-color: #d4b36a;
      background: #2a2416;
      color: #ffd98a;
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
    .rd-party-room-list-empty {
      font-size: 11.5px;
      color: #6a6458;
      text-align: center;
      padding: 10px 0;
    }
    .rd-party-room-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 160px;
      overflow-y: auto;
    }
    .rd-party-room-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 9px 12px;
      border-radius: 8px;
      border: 1.5px solid rgba(212, 179, 106, 0.4);
      background: #0d1018;
      cursor: pointer;
      font-family: inherit;
      text-align: left;
    }
    .rd-party-room-item:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .rd-party-room-item-code {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 2px;
      color: #ffd98a;
      flex-shrink: 0;
    }
    .rd-party-room-item-info {
      font-size: 11px;
      color: #9a917d;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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

export function mountPartyOverlay(
  nickname: string,
  onBack: () => void,
  onGameStart: (mode: PartyMode) => void,
): { unmount: (leaveChannel?: boolean) => void } {
  injectStyle();

  let view: 'menu' | 'waiting' = 'menu';
  let members: PartyMember[] = [];
  let busy = false;
  let errorMsg = '';
  let codeInputValue = '';
  let hostCodeInputValue = '';
  let selectedMaxSize = DEFAULT_PARTY_SIZE;
  let selectedMode: PartyMode = DEFAULT_PARTY_MODE;
  let openRooms: LobbyRoomInfo[] = [];

  const overlay = document.createElement('div');
  overlay.className = 'rd-party-overlay';
  document.body.appendChild(overlay);

  setRoomFullHandler(() => {
    view = 'menu';
    members = [];
    errorMsg = '방이 꽉 찼어요. 방장에게 다른 방을 만들어달라고 해보세요';
    render();
  });

  void connectLobby(nickname, (rooms) => {
    openRooms = rooms;
    if (view === 'menu') render();
  });

  function handleMembersChange(next: PartyMember[]): void {
    members = next;
    if (view === 'waiting') render();
  }

  function handleRoomStart(payload: StartPayload): void {
    onGameStart(payload.mode);
  }

  function handleCreate(): void {
    if (busy) return;

    const code = hostCodeInputValue.trim().toUpperCase();
    if (code.length < 4) {
      errorMsg = '4자 이상의 초대 코드를 정해주세요';
      render();
      return;
    }
    if (openRooms.some((r) => r.code === code)) {
      errorMsg = '이미 사용 중인 코드예요. 다른 코드를 정해주세요';
      render();
      return;
    }

    busy = true;
    errorMsg = '';
    render();

    createRoom(code, nickname, selectedMaxSize, selectedMode, handleMembersChange, handleRoomStart)
      .then(() => {
        busy = false;
        view = 'waiting';
        publishRoomToLobby({ code, hostNickname: nickname, mode: selectedMode, maxSize: selectedMaxSize });
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
    unpublishRoomFromLobby();
    const payload: StartPayload = { mode: selectedMode };
    broadcastStart(payload);
    handleRoomStart(payload);
  }

  function handleLeave(): void {
    if (isRoomHost()) unpublishRoomFromLobby();
    leavePartyRoom();
    view = 'menu';
    members = [];
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
    title.textContent = '파티전';
    card.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'rd-party-subtitle';
    subtitle.textContent = '친구와 같은 방에서 협동하거나 경쟁해보세요 (베타)';
    card.appendChild(subtitle);

    const createSection = document.createElement('div');
    createSection.className = 'rd-party-section';
    const createTitle = document.createElement('div');
    createTitle.className = 'rd-party-section-title';
    createTitle.textContent = '방 만들기';
    createSection.appendChild(createTitle);

    const modeRow = document.createElement('div');
    modeRow.className = 'rd-party-mode-row';
    PARTY_MODE_OPTIONS.forEach((opt) => {
      const modeBtn = document.createElement('button');
      modeBtn.type = 'button';
      modeBtn.className = `rd-party-mode-btn${opt.value === selectedMode ? ' rd-party-mode-active' : ''}`;

      const label = document.createElement('div');
      label.className = 'rd-party-mode-btn-label';
      label.textContent = opt.label;
      modeBtn.appendChild(label);

      const hint = document.createElement('div');
      hint.className = 'rd-party-mode-btn-hint';
      hint.textContent = opt.hint;
      modeBtn.appendChild(hint);

      modeBtn.addEventListener('click', () => {
        selectedMode = opt.value;
        render();
      });
      modeRow.appendChild(modeBtn);
    });
    createSection.appendChild(modeRow);

    const sizeRow = document.createElement('div');
    sizeRow.className = 'rd-party-size-row';
    PARTY_SIZE_OPTIONS.forEach((size) => {
      const sizeBtn = document.createElement('button');
      sizeBtn.type = 'button';
      sizeBtn.className = `rd-party-size-btn${size === selectedMaxSize ? ' rd-party-size-active' : ''}`;
      sizeBtn.textContent = `${size}인`;
      sizeBtn.addEventListener('click', () => {
        selectedMaxSize = size;
        render();
      });
      sizeRow.appendChild(sizeBtn);
    });
    createSection.appendChild(sizeRow);

    const codeLabel = document.createElement('div');
    codeLabel.className = 'rd-party-section-title';
    codeLabel.textContent = '초대 코드 정하기';
    createSection.appendChild(codeLabel);

    const codeRow = document.createElement('div');
    codeRow.className = 'rd-party-row';
    const hostCodeInput = document.createElement('input');
    hostCodeInput.type = 'text';
    hostCodeInput.maxLength = 8;
    hostCodeInput.placeholder = '원하는 코드 (예: ABCDE)';
    hostCodeInput.value = hostCodeInputValue;
    hostCodeInput.addEventListener('input', () => {
      hostCodeInputValue = hostCodeInput.value.toUpperCase();
      hostCodeInput.value = hostCodeInputValue;
    });
    codeRow.appendChild(hostCodeInput);
    createSection.appendChild(codeRow);

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'rd-party-btn';
    createBtn.textContent = busy ? '연결 중...' : '새 방 만들기';
    createBtn.disabled = busy;
    createBtn.addEventListener('click', handleCreate);
    createSection.appendChild(createBtn);
    card.appendChild(createSection);

    const errorText = document.createElement('div');
    errorText.className = 'rd-party-error';
    errorText.textContent = errorMsg;
    card.appendChild(errorText);

    const listSection = document.createElement('div');
    listSection.className = 'rd-party-section';
    const listTitle = document.createElement('div');
    listTitle.className = 'rd-party-section-title';
    listTitle.textContent = `지금 열려 있는 방 (${openRooms.length})`;
    listSection.appendChild(listTitle);

    if (openRooms.length === 0) {
      const emptyHint = document.createElement('div');
      emptyHint.className = 'rd-party-room-list-empty';
      emptyHint.textContent = '열려 있는 방이 없어요. 방을 직접 만들어보세요!';
      listSection.appendChild(emptyHint);
    } else {
      const list = document.createElement('div');
      list.className = 'rd-party-room-list';
      openRooms.forEach((room) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'rd-party-room-item';
        item.disabled = busy;

        const codeSpan = document.createElement('span');
        codeSpan.className = 'rd-party-room-item-code';
        codeSpan.textContent = room.code;
        item.appendChild(codeSpan);

        const infoSpan = document.createElement('span');
        infoSpan.className = 'rd-party-room-item-info';
        infoSpan.textContent = `${room.hostNickname} · ${modeLabel(room.mode)} · ${room.maxSize}인`;
        item.appendChild(infoSpan);

        item.addEventListener('click', () => handleJoin(room.code));
        list.appendChild(item);
      });
      listSection.appendChild(list);
    }
    card.appendChild(listSection);

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
    codeInput.maxLength = 8;
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

    const roomMode = members.find((m) => m.isHost)?.mode ?? selectedMode;
    const modeDisplay = document.createElement('div');
    modeDisplay.className = 'rd-party-mode-display';
    modeDisplay.textContent = `모드: ${modeLabel(roomMode)}`;
    card.appendChild(modeDisplay);

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

    const cap = members.find((m) => m.isHost)?.maxSize ?? selectedMaxSize;

    const status = document.createElement('div');
    if (isRoomHost()) {
      status.className = 'rd-party-status';
      status.textContent = `모인 인원: ${members.length}/${cap}명 · 준비되면 아래 버튼을 눌러주세요`;
    } else {
      status.className = 'rd-party-status';
      status.textContent = `모인 인원: ${members.length}/${cap}명 · 방장이 시작하길 기다리는 중...`;
    }
    card.appendChild(status);

    if (isRoomHost()) {
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

  function unmount(leaveChannel = true): void {
    if (leaveChannel) leavePartyRoom();
    disconnectLobby();
    overlay.remove();
  }

  render();
  return { unmount };
}
