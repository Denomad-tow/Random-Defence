import { adminResetPassword, listNicknames } from '../meta/mail';
import { injectStyle } from './adminMailOverlay';

export function mountAdminResetPasswordOverlay(): void {
  injectStyle();

  const overlay = document.createElement('div');
  overlay.className = 'rd-admin-overlay';

  const card = document.createElement('div');
  card.className = 'rd-admin-card';
  overlay.appendChild(card);

  const title = document.createElement('div');
  title.className = 'rd-admin-title';
  title.textContent = '비밀번호 초기화 (운영자)';
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

  const nicknameSelect = document.createElement('select');
  const loadingOption = document.createElement('option');
  loadingOption.value = '';
  loadingOption.textContent = '불러오는 중...';
  nicknameSelect.appendChild(loadingOption);
  addField('계정 닉네임', nicknameSelect);

  void listNicknames().then((nicknames) => {
    nicknameSelect.innerHTML = '';
    nicknames.forEach((nick) => {
      const option = document.createElement('option');
      option.value = nick;
      option.textContent = nick;
      nicknameSelect.appendChild(option);
    });
  });

  const passwordInput = document.createElement('input');
  passwordInput.type = 'text';
  passwordInput.maxLength = 30;
  passwordInput.placeholder = '임시 비밀번호 (6자 이상)';
  addField('새 임시 비밀번호', passwordInput);

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
  cancelButton.addEventListener('click', () => overlay.remove());
  buttons.appendChild(cancelButton);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'rd-admin-submit';
  submitButton.textContent = '변경하기';
  buttons.appendChild(submitButton);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleSubmit();
  });

  async function handleSubmit(): Promise<void> {
    status.textContent = '';
    status.classList.remove('ok');

    const nickname = nicknameSelect.value;
    const newPassword = passwordInput.value.trim();

    if (!nickname) {
      status.textContent = '계정을 선택해주세요';
      return;
    }
    if (newPassword.length < 6) {
      status.textContent = '비밀번호는 6자 이상이어야 해요';
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = '변경 중...';
    const ok = await adminResetPassword(nickname, newPassword);
    submitButton.disabled = false;
    submitButton.textContent = '변경하기';

    if (!ok) {
      status.textContent = '변경에 실패했어요';
      return;
    }

    status.classList.add('ok');
    status.textContent = `${nickname} 님의 비밀번호를 바꿨어요. 이 비밀번호를 직접 알려주세요`;
    passwordInput.value = '';
  }

  document.body.appendChild(overlay);
}
