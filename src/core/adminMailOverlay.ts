import { sendMail, findUserByNickname } from '../meta/mail';
import { BOX_TYPES } from '../meta/gacha';

const STYLE_ID = 'rd-admin-mail-style';

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rd-admin-overlay {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.6);
      font-family: 'Noto Serif KR', serif;
      color: #f0e9d8;
      padding: 16px;
    }
    .rd-admin-card {
      width: min(92vw, 380px);
      max-height: 90vh;
      overflow-y: auto;
      background: rgba(21, 26, 40, 0.97);
      border: 1px solid rgba(212, 179, 106, 0.55);
      border-radius: 14px;
      padding: 22px 20px;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.5);
    }
    .rd-admin-title {
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      color: #f6e6b4;
      margin-bottom: 16px;
    }
    .rd-admin-field {
      margin-bottom: 12px;
    }
    .rd-admin-field label {
      display: block;
      font-size: 11px;
      color: #9a917d;
      margin-bottom: 4px;
    }
    .rd-admin-field input,
    .rd-admin-field textarea,
    .rd-admin-field select {
      width: 100%;
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
    .rd-admin-field textarea {
      min-height: 64px;
      resize: vertical;
    }
    .rd-admin-row {
      display: flex;
      gap: 10px;
    }
    .rd-admin-row .rd-admin-field {
      flex: 1;
    }
    .rd-admin-recipient-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }
    .rd-admin-recipient-tab {
      flex: 1;
      padding: 8px 0;
      text-align: center;
      border-radius: 8px;
      border: 1px solid rgba(212, 179, 106, 0.35);
      background: transparent;
      color: #8a8272;
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .rd-admin-recipient-tab.active {
      background: rgba(42, 36, 22, 0.9);
      border-color: #d4b36a;
      color: #ffd98a;
      font-weight: 700;
    }
    .rd-admin-status {
      min-height: 16px;
      font-size: 11.5px;
      color: #ff8a8a;
      margin-bottom: 8px;
      text-align: center;
    }
    .rd-admin-status.ok {
      color: #a8ffb0;
    }
    .rd-admin-buttons {
      display: flex;
      gap: 10px;
      margin-top: 8px;
    }
    .rd-admin-buttons button {
      flex: 1;
      padding: 11px 0;
      border-radius: 10px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .rd-admin-cancel {
      border: 1.5px solid #555;
      background: #1f2536;
      color: #9a917d;
    }
    .rd-admin-submit {
      border: 2px solid #d4b36a;
      background: #151a28;
      color: #f6e6b4;
    }
    .rd-admin-submit:disabled {
      opacity: 0.6;
      cursor: default;
    }
  `;
  document.head.appendChild(style);
}

export function mountAdminMailOverlay(onSent: () => void): void {
  injectStyle();

  let recipientMode: 'all' | 'nickname' = 'all';

  const overlay = document.createElement('div');
  overlay.className = 'rd-admin-overlay';

  const card = document.createElement('div');
  card.className = 'rd-admin-card';
  overlay.appendChild(card);

  const title = document.createElement('div');
  title.className = 'rd-admin-title';
  title.textContent = '우편 발송 (운영자)';
  card.appendChild(title);

  const form = document.createElement('form');
  card.appendChild(form);

  function addField(labelText: string, input: HTMLElement): void {
    const field = document.createElement('div');
    field.className = 'rd-admin-field';
    const label = document.createElement('label');
    label.textContent = labelText;
    field.appendChild(label);
    field.appendChild(input);
    form.appendChild(field);
  }

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.maxLength = 40;
  addField('제목', titleInput);

  const bodyInput = document.createElement('textarea');
  bodyInput.maxLength = 300;
  addField('내용', bodyInput);

  const recipientTabs = document.createElement('div');
  recipientTabs.className = 'rd-admin-recipient-tabs';
  form.appendChild(recipientTabs);

  const allTab = document.createElement('button');
  allTab.type = 'button';
  allTab.className = 'rd-admin-recipient-tab active';
  allTab.textContent = '전체 발송';
  recipientTabs.appendChild(allTab);

  const nicknameTab = document.createElement('button');
  nicknameTab.type = 'button';
  nicknameTab.className = 'rd-admin-recipient-tab';
  nicknameTab.textContent = '특정 닉네임';
  recipientTabs.appendChild(nicknameTab);

  const nicknameInput = document.createElement('input');
  nicknameInput.type = 'text';
  nicknameInput.maxLength = 12;
  nicknameInput.placeholder = '받는 사람 닉네임';
  const nicknameField = document.createElement('div');
  nicknameField.className = 'rd-admin-field';
  nicknameField.style.display = 'none';
  nicknameField.appendChild(nicknameInput);
  form.appendChild(nicknameField);

  function setRecipientMode(mode: 'all' | 'nickname'): void {
    recipientMode = mode;
    allTab.classList.toggle('active', mode === 'all');
    nicknameTab.classList.toggle('active', mode === 'nickname');
    nicknameField.style.display = mode === 'nickname' ? 'block' : 'none';
  }

  allTab.addEventListener('click', () => setRecipientMode('all'));
  nicknameTab.addEventListener('click', () => setRecipientMode('nickname'));

  const row = document.createElement('div');
  row.className = 'rd-admin-row';
  form.appendChild(row);

  const goldInput = document.createElement('input');
  goldInput.type = 'number';
  goldInput.min = '0';
  goldInput.value = '0';
  const goldField = document.createElement('div');
  goldField.className = 'rd-admin-field';
  const goldLabel = document.createElement('label');
  goldLabel.textContent = '골드';
  goldField.appendChild(goldLabel);
  goldField.appendChild(goldInput);
  row.appendChild(goldField);

  const boxCountInput = document.createElement('input');
  boxCountInput.type = 'number';
  boxCountInput.min = '0';
  boxCountInput.value = '0';
  const boxCountField = document.createElement('div');
  boxCountField.className = 'rd-admin-field';
  const boxCountLabel = document.createElement('label');
  boxCountLabel.textContent = '상자 개수';
  boxCountField.appendChild(boxCountLabel);
  boxCountField.appendChild(boxCountInput);
  row.appendChild(boxCountField);

  const boxSelect = document.createElement('select');
  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = '상자 없음';
  boxSelect.appendChild(noneOption);
  BOX_TYPES.forEach((box) => {
    const option = document.createElement('option');
    option.value = box.id;
    option.textContent = box.name;
    boxSelect.appendChild(option);
  });
  addField('상자 종류', boxSelect);

  const status = document.createElement('div');
  status.className = 'rd-admin-status';
  form.appendChild(status);

  const buttons = document.createElement('div');
  buttons.className = 'rd-admin-buttons';
  form.appendChild(buttons);

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'rd-admin-cancel';
  cancelButton.textContent = '닫기';
  buttons.appendChild(cancelButton);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'rd-admin-submit';
  submitButton.textContent = '보내기';
  buttons.appendChild(submitButton);

  const close = () => overlay.remove();
  cancelButton.addEventListener('click', close);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleSubmit();
  });

  async function handleSubmit(): Promise<void> {
    status.textContent = '';
    status.classList.remove('ok');

    const titleValue = titleInput.value.trim();
    const bodyValue = bodyInput.value.trim();
    const gold = Math.max(0, Math.floor(Number(goldInput.value) || 0));
    const boxCount = Math.max(0, Math.floor(Number(boxCountInput.value) || 0));
    const boxId = boxSelect.value || null;

    if (!titleValue) {
      status.textContent = '제목을 입력해주세요';
      return;
    }

    let recipientId: string | null = null;
    if (recipientMode === 'nickname') {
      const nickname = nicknameInput.value.trim();
      if (!nickname) {
        status.textContent = '받는 사람 닉네임을 입력해주세요';
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = '확인 중...';
      recipientId = await findUserByNickname(nickname);
      if (!recipientId) {
        status.textContent = '해당 닉네임을 찾을 수 없어요';
        submitButton.disabled = false;
        submitButton.textContent = '보내기';
        return;
      }
    }

    submitButton.disabled = true;
    submitButton.textContent = '보내는 중...';

    const count = await sendMail({
      title: titleValue,
      body: bodyValue,
      gold,
      boxId,
      boxCount: boxId ? boxCount : 0,
      recipientId,
    });

    if (count === null) {
      status.textContent = '발송에 실패했어요';
      submitButton.disabled = false;
      submitButton.textContent = '보내기';
      return;
    }

    status.classList.add('ok');
    status.textContent = `${count}명에게 보냈어요!`;
    submitButton.disabled = false;
    submitButton.textContent = '보내기';

    onSent();
    setTimeout(close, 900);
  }

  document.body.appendChild(overlay);
  titleInput.focus();
}
