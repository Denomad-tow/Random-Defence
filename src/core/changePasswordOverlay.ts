import { changePassword } from '../meta/auth';

const STYLE_ID = 'rd-chpw-style';

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rd-chpw-overlay {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(4, 5, 9, 0.78);
      font-family: 'Noto Serif KR', serif;
      color: #f0e9d8;
      padding: 16px;
    }
    .rd-chpw-card {
      width: min(86vw, 340px);
      background: rgba(21, 26, 40, 0.96);
      border: 1px solid rgba(212, 179, 106, 0.55);
      border-radius: 14px;
      padding: 24px 22px;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.55);
    }
    .rd-chpw-title {
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      color: #f6e6b4;
      margin-bottom: 16px;
    }
    .rd-chpw-field {
      margin-bottom: 12px;
    }
    .rd-chpw-field label {
      display: block;
      font-size: 11px;
      color: #9a917d;
      margin-bottom: 4px;
    }
    .rd-chpw-field input {
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid rgba(212, 179, 106, 0.4);
      background: #0d1018;
      color: #f0e9d8;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      box-sizing: border-box;
    }
    .rd-chpw-field input:focus {
      border-color: #d4b36a;
    }
    .rd-chpw-status {
      min-height: 16px;
      font-size: 11.5px;
      color: #ff8a8a;
      margin: 4px 0 8px;
      text-align: center;
    }
    .rd-chpw-status.ok {
      color: #a8ffb0;
    }
    .rd-chpw-buttons {
      display: flex;
      gap: 8px;
    }
    .rd-chpw-buttons button {
      flex: 1;
      padding: 12px 0;
      border-radius: 10px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .rd-chpw-cancel {
      border: 1px solid rgba(212, 179, 106, 0.5);
      background: #151a28;
      color: #d8cfae;
    }
    .rd-chpw-submit {
      border: 2px solid #d4b36a;
      background: #151a28;
      color: #f6e6b4;
    }
    .rd-chpw-buttons button:disabled {
      opacity: 0.6;
      cursor: default;
    }
  `;
  document.head.appendChild(style);
}

export function showChangePasswordOverlay(nickname: string): void {
  injectStyle();

  const overlay = document.createElement('div');
  overlay.className = 'rd-chpw-overlay';

  const card = document.createElement('div');
  card.className = 'rd-chpw-card';
  overlay.appendChild(card);

  const title = document.createElement('div');
  title.className = 'rd-chpw-title';
  title.textContent = '비밀번호 변경';
  card.appendChild(title);

  const form = document.createElement('form');
  card.appendChild(form);

  function addPasswordField(labelText: string, autocomplete: 'current-password' | 'new-password'): HTMLInputElement {
    const field = document.createElement('div');
    field.className = 'rd-chpw-field';
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'password';
    input.autocomplete = autocomplete;
    field.appendChild(label);
    field.appendChild(input);
    form.appendChild(field);
    return input;
  }

  const currentInput = addPasswordField('현재 비밀번호 (임시 비밀번호도 가능)', 'current-password');
  const newInput = addPasswordField('새 비밀번호 (6자 이상)', 'new-password');
  const confirmInput = addPasswordField('새 비밀번호 확인', 'new-password');

  const status = document.createElement('div');
  status.className = 'rd-chpw-status';
  form.appendChild(status);

  const buttons = document.createElement('div');
  buttons.className = 'rd-chpw-buttons';
  form.appendChild(buttons);

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'rd-chpw-cancel';
  cancelButton.textContent = '취소';
  cancelButton.addEventListener('click', () => overlay.remove());
  buttons.appendChild(cancelButton);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'rd-chpw-submit';
  submitButton.textContent = '변경하기';
  buttons.appendChild(submitButton);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleSubmit();
  });

  async function handleSubmit(): Promise<void> {
    status.textContent = '';
    status.classList.remove('ok');

    if (!currentInput.value || !newInput.value) {
      status.textContent = '비밀번호를 모두 입력해주세요';
      return;
    }
    if (newInput.value !== confirmInput.value) {
      status.textContent = '새 비밀번호 확인이 일치하지 않아요';
      return;
    }

    submitButton.disabled = true;
    cancelButton.disabled = true;
    submitButton.textContent = '변경 중...';

    const result = await changePassword(nickname, currentInput.value, newInput.value);

    if (!result.ok) {
      status.textContent = result.error ?? '오류가 발생했어요';
      submitButton.disabled = false;
      cancelButton.disabled = false;
      submitButton.textContent = '변경하기';
      return;
    }

    status.classList.add('ok');
    status.textContent = '비밀번호를 바꿨어요!';
    submitButton.textContent = '완료';
    cancelButton.disabled = false;
    setTimeout(() => overlay.remove(), 1000);
  }

  document.body.appendChild(overlay);
  currentInput.focus();
}
