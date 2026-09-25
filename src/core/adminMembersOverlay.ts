import { listMembers, type MemberInfo } from '../meta/mail';
import { subscribeOnline } from '../meta/globalChat';
import { injectStyle } from './adminMailOverlay';

const STYLE_ID = 'rd-members-style';

function injectMembersStyle(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rd-members-summary {
      text-align: center;
      font-size: 12px;
      color: #9a917d;
      margin-bottom: 10px;
    }
    .rd-members-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 55vh;
      overflow-y: auto;
      margin-bottom: 12px;
    }
    .rd-members-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: 8px;
      background: #0d1018;
      border: 1px solid rgba(212, 179, 106, 0.25);
    }
    .rd-members-name {
      font-size: 13.5px;
      font-weight: 700;
      color: #f0e9d8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rd-members-time {
      font-size: 11px;
      color: #9fd8ff;
      flex-shrink: 0;
      text-align: right;
    }
    .rd-members-time.old {
      color: #8a8272;
    }
    .rd-members-empty {
      text-align: center;
      font-size: 12px;
      color: #6a6458;
      padding: 16px 0;
    }
  `;
  document.head.appendChild(style);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTime(iso: string | null): string {
  if (!iso) return '기록 없음';
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function mountAdminMembersOverlay(): void {
  injectStyle();
  injectMembersStyle();

  const overlay = document.createElement('div');
  overlay.className = 'rd-admin-overlay';

  const card = document.createElement('div');
  card.className = 'rd-admin-card';
  overlay.appendChild(card);

  const title = document.createElement('div');
  title.className = 'rd-admin-title';
  title.textContent = '회원 목록 (운영자)';
  card.appendChild(title);

  const summary = document.createElement('div');
  summary.className = 'rd-members-summary';
  summary.textContent = '불러오는 중...';
  card.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'rd-members-list';
  card.appendChild(list);

  const buttons = document.createElement('div');
  buttons.className = 'rd-admin-buttons';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'rd-admin-cancel';
  closeButton.textContent = '닫기';
  closeButton.addEventListener('click', () => overlay.remove());
  buttons.appendChild(closeButton);
  card.appendChild(buttons);

  let members: MemberInfo[] | null | undefined;
  let online = new Set<string>();

  // 접속 중인 사람은 맨 위로 올리고 초록 점 + "접속 중"으로 표시한다. 접속 중
  // 목록은 실시간으로 바뀌므로, 창이 열려 있는 동안 계속 다시 그린다.
  function render(): void {
    list.innerHTML = '';

    if (members === undefined) return;

    if (members === null) {
      summary.textContent = '';
      const failed = document.createElement('div');
      failed.className = 'rd-members-empty';
      failed.textContent = '목록을 불러오지 못했어요';
      list.appendChild(failed);
      return;
    }

    const onlineCount = members.filter((m) => online.has(m.nickname)).length;
    summary.textContent = `운영자를 뺀 가입자 ${members.length}명 · 지금 접속 중 ${onlineCount}명`;

    if (members.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'rd-members-empty';
      empty.textContent = '아직 가입한 회원이 없어요';
      list.appendChild(empty);
      return;
    }

    const sorted = [...members].sort((a, b) => Number(online.has(b.nickname)) - Number(online.has(a.nickname)));

    sorted.forEach((member) => {
      const isOnline = online.has(member.nickname);
      const row = document.createElement('div');
      row.className = 'rd-members-row';

      const name = document.createElement('span');
      name.className = 'rd-members-name';
      name.textContent = `${isOnline ? '🟢 ' : ''}${member.nickname}`;
      row.appendChild(name);

      const time = document.createElement('span');
      const lastSeen = member.last_seen_at ?? member.created_at;
      const isOld = !isOnline && (!lastSeen || Date.now() - new Date(lastSeen).getTime() > WEEK_MS);
      time.className = isOld ? 'rd-members-time old' : 'rd-members-time';
      time.textContent = isOnline ? '접속 중' : formatTime(member.last_seen_at);
      row.appendChild(time);

      list.appendChild(row);
    });
  }

  const unsubscribeOnline = subscribeOnline((nicknames) => {
    online = new Set(nicknames);
    render();
  });

  void listMembers().then((result) => {
    members = result;
    render();
  });

  closeButton.addEventListener('click', unsubscribeOnline);

  document.body.appendChild(overlay);
}
