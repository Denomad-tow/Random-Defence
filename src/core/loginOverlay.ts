import { signIn, signUp, requestPasswordReset } from '../meta/auth';

const STYLE_ID = 'rd-login-style';

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rd-login-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 30%, #10131f 0%, #07080d 70%);
      font-family: 'Noto Serif KR', serif;
      color: #f0e9d8;
    }
    .rd-login-card {
      width: min(86vw, 340px);
      background: rgba(21, 26, 40, 0.92);
      border: 1px solid rgba(212, 179, 106, 0.55);
      border-radius: 14px;
      padding: 28px 24px;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.5);
    }
    .rd-login-title {
      text-align: center;
      font-size: 22px;
      font-weight: 700;
      color: #f6e6b4;
      margin-bottom: 4px;
    }
    .rd-login-subtitle {
      text-align: center;
      font-size: 12px;
      color: #9a917d;
      margin-bottom: 20px;
    }
    .rd-login-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 18px;
    }
    .rd-login-tab {
      flex: 1;
      padding: 8px 0;
      text-align: center;
      border-radius: 8px;
      border: 1px solid rgba(212, 179, 106, 0.35);
      background: transparent;
      color: #8a8272;
      font-family: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    .rd-login-tab.active {
      background: rgba(42, 36, 22, 0.9);
      border-color: #d4b36a;
      color: #ffd98a;
      font-weight: 700;
    }
    .rd-login-field {
      margin-bottom: 12px;
    }
    .rd-login-field label {
      display: block;
      font-size: 11px;
      color: #9a917d;
      margin-bottom: 4px;
    }
    .rd-login-field input {
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid rgba(212, 179, 106, 0.4);
      background: #0d1018;
      color: #f0e9d8;
      font-size: 14px;
      font-family: inherit;
      outline: none;
    }
    .rd-login-field input:focus {
      border-color: #d4b36a;
    }
    .rd-login-error {
      min-height: 16px;
      font-size: 11.5px;
      color: #ff8a8a;
      margin-bottom: 8px;
      text-align: center;
    }
    .rd-login-submit {
      width: 100%;
      padding: 12px 0;
      border-radius: 10px;
      border: 2px solid #d4b36a;
      background: #151a28;
      color: #f6e6b4;
      font-family: inherit;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 4px;
    }
    .rd-login-submit:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .rd-login-forgot {
      display: block;
      width: 100%;
      margin-top: 12px;
      padding: 6px 0;
      background: none;
      border: none;
      color: #8a8272;
      font-family: inherit;
      font-size: 12px;
      text-decoration: underline;
      cursor: pointer;
    }
    .rd-login-error.ok {
      color: #a8ffb0;
    }
  `;
  document.head.appendChild(style);
}

export function mountLoginOverlay(onAuthenticated: () => void): void {
  injectStyle();

  let mode: 'login' | 'signup' | 'reset' = 'login';

  const overlay = document.createElement('div');
  overlay.className = 'rd-login-overlay';

  const card = document.createElement('div');
  card.className = 'rd-login-card';
  overlay.appendChild(card);

  const title = document.createElement('div');
  title.className = 'rd-login-title';
  title.textContent = '랜덤 디펜스';
  card.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.className = 'rd-login-subtitle';
  subtitle.textContent = '닉네임으로 시작하세요';
  card.appendChild(subtitle);

  const tabs = document.createElement('div');
  tabs.className = 'rd-login-tabs';
  card.appendChild(tabs);

  const loginTab = document.createElement('button');
  loginTab.type = 'button';
  loginTab.className = 'rd-login-tab active';
  loginTab.textContent = '로그인';
  tabs.appendChild(loginTab);

  const signupTab = document.createElement('button');
  signupTab.type = 'button';
  signupTab.className = 'rd-login-tab';
  signupTab.textContent = '회원가입';
  tabs.appendChild(signupTab);

  const form = document.createElement('form');
  card.appendChild(form);

  const nicknameField = document.createElement('div');
  nicknameField.className = 'rd-login-field';
  const nicknameLabel = document.createElement('label');
  nicknameLabel.textContent = '닉네임';
  const nicknameInput = document.createElement('input');
  nicknameInput.type = 'text';
  nicknameInput.maxLength = 12;
  nicknameInput.autocomplete = 'username';
  nicknameField.appendChild(nicknameLabel);
  nicknameField.appendChild(nicknameInput);
  form.appendChild(nicknameField);

  const passwordField = document.createElement('div');
  passwordField.className = 'rd-login-field';
  const passwordLabel = document.createElement('label');
  passwordLabel.textContent = '비밀번호';
  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.autocomplete = 'current-password';
  passwordField.appendChild(passwordLabel);
  passwordField.appendChild(passwordInput);
  form.appendChild(passwordField);

  const errorText = document.createElement('div');
  errorText.className = 'rd-login-error';
  form.appendChild(errorText);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'rd-login-submit';
  submitButton.textContent = '로그인';
  form.appendChild(submitButton);

  const forgotButton = document.createElement('button');
  forgotButton.type = 'button';
  forgotButton.className = 'rd-login-forgot';
  forgotButton.textContent = '비밀번호를 잊으셨나요?';
  form.appendChild(forgotButton);

  function setMode(next: 'login' | 'signup' | 'reset'): void {
    mode = next;
    loginTab.classList.toggle('active', mode === 'login');
    signupTab.classList.toggle('active', mode === 'signup');
    passwordField.style.display = mode === 'reset' ? 'none' : 'block';
    forgotButton.style.display = mode === 'reset' ? 'none' : 'block';
    passwordInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    submitButton.textContent = mode === 'login' ? '로그인' : mode === 'signup' ? '가입하기' : '초기화 요청 보내기';
    subtitle.textContent = mode === 'reset' ? '닉네임을 입력하면 운영자에게 요청이 전달돼요' : '닉네임으로 시작하세요';
    errorText.textContent = '';
    errorText.classList.remove('ok');
  }

  loginTab.addEventListener('click', () => setMode('login'));
  signupTab.addEventListener('click', () => setMode('signup'));
  forgotButton.addEventListener('click', () => setMode('reset'));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleSubmit();
  });

  async function handleSubmit(): Promise<void> {
    errorText.textContent = '';
    errorText.classList.remove('ok');
    const nickname = nicknameInput.value.trim();
    const password = passwordInput.value;

    if (mode === 'reset') {
      if (!nickname) {
        errorText.textContent = '닉네임을 입력해주세요';
        return;
      }
      submitButton.disabled = true;
      submitButton.textContent = '보내는 중...';
      const resetResult = await requestPasswordReset(nickname);
      submitButton.disabled = false;
      submitButton.textContent = '초기화 요청 보내기';
      if (!resetResult.ok) {
        errorText.textContent = resetResult.error ?? '오류가 발생했어요';
        return;
      }
      errorText.classList.add('ok');
      errorText.textContent = '운영자에게 요청을 보냈어요. 운영자가 알려주는 임시 비밀번호로 로그인해주세요';
      return;
    }

    if (!nickname || !password) {
      errorText.textContent = '닉네임과 비밀번호를 입력해주세요';
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = mode === 'login' ? '로그인 중...' : '가입 중...';

    const result = mode === 'login' ? await signIn(nickname, password) : await signUp(nickname, password);

    if (!result.ok) {
      errorText.textContent = result.error ?? '오류가 발생했어요';
      submitButton.disabled = false;
      submitButton.textContent = mode === 'login' ? '로그인' : '가입하기';
      return;
    }

    overlay.remove();
    onAuthenticated();
  }

  document.body.appendChild(overlay);
  nicknameInput.focus();
}
