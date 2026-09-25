import { submitBugReport } from '../meta/bugReport';

const STYLE_ID = 'rd-bugreport-style';

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rd-bugreport-overlay {
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
    .rd-bugreport-card {
      width: min(86vw, 340px);
      background: rgba(21, 26, 40, 0.96);
      border: 1px solid rgba(212, 179, 106, 0.55);
      border-radius: 14px;
      padding: 26px 22px;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.55);
    }
    .rd-bugreport-title {
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      color: #f6e6b4;
      margin-bottom: 8px;
    }
    .rd-bugreport-desc {
      text-align: center;
      font-size: 12px;
      line-height: 1.5;
      color: #9a917d;
      margin-bottom: 16px;
    }
    .rd-bugreport-field textarea {
      width: 100%;
      min-height: 110px;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid rgba(212, 179, 106, 0.4);
      background: #0d1018;
      color: #f0e9d8;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      box-sizing: border-box;
      resize: vertical;
    }
    .rd-bugreport-field textarea:focus {
      border-color: #d4b36a;
    }
    .rd-bugreport-status {
      min-height: 16px;
      font-size: 11.5px;
      color: #ff8a8a;
      margin: 8px 0;
      text-align: center;
    }
    .rd-bugreport-status.ok {
      color: #a8ffb0;
    }
    .rd-bugreport-buttons {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }
    .rd-bugreport-buttons button {
      flex: 1;
      padding: 12px 0;
      border-radius: 10px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .rd-bugreport-cancel {
      border: 1px solid rgba(212, 179, 106, 0.5);
      background: #151a28;
      color: #d8cfae;
    }
    .rd-bugreport-submit {
      border: 2px solid #d4b36a;
      background: #151a28;
      color: #f6e6b4;
    }
    .rd-bugreport-submit:disabled {
      opacity: 0.6;
      cursor: default;
    }
  `;
  document.head.appendChild(style);
}

export function showBugReportOverlay(): void {
  injectStyle();

  const overlay = document.createElement('div');
  overlay.className = 'rd-bugreport-overlay';

  const card = document.createElement('div');
  card.className = 'rd-bugreport-card';
  overlay.appendChild(card);

  const title = document.createElement('div');
  title.className = 'rd-bugreport-title';
  title.textContent = '버그 제보';
  card.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'rd-bugreport-desc';
  desc.textContent = '어떤 화면에서 무슨 문제가 있었는지 적어주시면 큰 도움이 돼요. 운영자 우편함으로 바로 전달됩니다.';
  card.appendChild(desc);

  const form = document.createElement('form');
  card.appendChild(form);

  const field = document.createElement('div');
  field.className = 'rd-bugreport-field';
  const textarea = document.createElement('textarea');
  textarea.maxLength = 500;
  textarea.placeholder = '예) 연구 화면에서 강화 버튼을 눌러도 반응이 없어요';
  field.appendChild(textarea);
  form.appendChild(field);

  const status = document.createElement('div');
  status.className = 'rd-bugreport-status';
  form.appendChild(status);

  const buttons = document.createElement('div');
  buttons.className = 'rd-bugreport-buttons';
  form.appendChild(buttons);

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'rd-bugreport-cancel';
  cancelButton.textContent = '취소';
  cancelButton.addEventListener('click', () => overlay.remove());
  buttons.appendChild(cancelButton);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'rd-bugreport-submit';
  submitButton.textContent = '보내기';
  buttons.appendChild(submitButton);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleSubmit();
  });

  async function handleSubmit(): Promise<void> {
    status.textContent = '';
    status.classList.remove('ok');
    const message = textarea.value.trim();

    if (!message) {
      status.textContent = '내용을 입력해주세요';
      return;
    }

    submitButton.disabled = true;
    cancelButton.disabled = true;
    submitButton.textContent = '보내는 중...';

    const ok = await submitBugReport(message);

    if (!ok) {
      status.textContent = '전송에 실패했어요. 잠시 후 다시 시도해주세요';
      submitButton.disabled = false;
      cancelButton.disabled = false;
      submitButton.textContent = '보내기';
      return;
    }

    status.classList.add('ok');
    status.textContent = '제보해주셔서 감사해요!';
    submitButton.textContent = '완료';
    setTimeout(() => overlay.remove(), 900);
  }

  document.body.appendChild(overlay);
  textarea.focus();
}
