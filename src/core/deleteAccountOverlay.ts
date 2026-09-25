import { deleteAccount } from '../meta/auth';

const STYLE_ID = 'rd-delacc-style';

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rd-delacc-overlay {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(4, 5, 9, 0.78);
      font-family: 'Noto Serif KR', serif;
      color: #f0e9d8;
    }
    .rd-delacc-card {
      width: min(86vw, 340px);
      background: rgba(21, 26, 40, 0.96);
      border: 1px solid rgba(255, 138, 138, 0.6);
      border-radius: 14px;
      padding: 26px 22px;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.55);
    }
    .rd-delacc-title {
      text-align: center;
      font-size: 19px;
      font-weight: 700;
      color: #ff9a9a;
      margin-bottom: 8px;
    }
    .rd-delacc-desc {
      text-align: center;
      font-size: 12.5px;
      line-height: 1.5;
      color: #c9c2af;
      margin-bottom: 18px;
    }
    .rd-delacc-field label {
      display: block;
      font-size: 11px;
      color: #9a917d;
      margin-bottom: 4px;
    }
    .rd-delacc-field input {
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 138, 138, 0.4);
      background: #0d1018;
      color: #f0e9d8;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      box-sizing: border-box;
    }
    .rd-delacc-field input:focus {
      border-color: #ff9a9a;
    }
    .rd-delacc-error {
      min-height: 16px;
      font-size: 11.5px;
      color: #ff8a8a;
      margin: 8px 0;
      text-align: center;
    }
    .rd-delacc-buttons {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }
    .rd-delacc-buttons button {
      flex: 1;
      padding: 12px 0;
      border-radius: 10px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .rd-delacc-cancel {
      border: 1px solid rgba(212, 179, 106, 0.5);
      background: #151a28;
      color: #d8cfae;
    }
    .rd-delacc-confirm {
      border: 2px solid #ff8a8a;
      background: #2a1616;
      color: #ff9a9a;
    }
    .rd-delacc-confirm:disabled {
      opacity: 0.6;
      cursor: default;
    }
  `;
  document.head.appendChild(style);
}

export function showDeleteAccountOverlay(nickname: string): void {
  injectStyle();

  const overlay = document.createElement('div');
  overlay.className = 'rd-delacc-overlay';

  const card = document.createElement('div');
  card.className = 'rd-delacc-card';
  overlay.appendChild(card);

  const title = document.createElement('div');
  title.className = 'rd-delacc-title';
  title.textContent = '정말 탈퇴하시겠어요?';
  card.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'rd-delacc-desc';
  desc.textContent = '탈퇴하면 캐릭터, 장비, 골드 등 모든 진행 데이터가 삭제되며 되돌릴 수 없어요. 계속하려면 비밀번호를 다시 입력해주세요.';
  card.appendChild(desc);

  const form = document.createElement('form');
  card.appendChild(form);

  const passwordField = document.createElement('div');
  passwordField.className = 'rd-delacc-field';
  const passwordLabel = document.createElement('label');
  passwordLabel.textContent = '비밀번호';
  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.autocomplete = 'current-password';
  passwordField.appendChild(passwordLabel);
  passwordField.appendChild(passwordInput);
  form.appendChild(passwordField);

  const errorText = document.createElement('div');
  errorText.className = 'rd-delacc-error';
  form.appendChild(errorText);

  const buttons = document.createElement('div');
  buttons.className = 'rd-delacc-buttons';
  form.appendChild(buttons);

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'rd-delacc-cancel';
  cancelButton.textContent = '취소';
  cancelButton.addEventListener('click', () => overlay.remove());
  buttons.appendChild(cancelButton);

  const confirmButton = document.createElement('button');
  confirmButton.type = 'submit';
  confirmButton.className = 'rd-delacc-confirm';
  confirmButton.textContent = '탈퇴하기';
  buttons.appendChild(confirmButton);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleSubmit();
  });

  async function handleSubmit(): Promise<void> {
    errorText.textContent = '';
    const password = passwordInput.value;

    if (!password) {
      errorText.textContent = '비밀번호를 입력해주세요';
      return;
    }

    confirmButton.disabled = true;
    cancelButton.disabled = true;
    confirmButton.textContent = '탈퇴 중...';

    const result = await deleteAccount(nickname, password);

    if (!result.ok) {
      errorText.textContent = result.error ?? '오류가 발생했어요';
      confirmButton.disabled = false;
      cancelButton.disabled = false;
      confirmButton.textContent = '탈퇴하기';
      return;
    }

    overlay.remove();
    window.location.reload();
  }

  document.body.appendChild(overlay);
  passwordInput.focus();
}
