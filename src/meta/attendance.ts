import { addStat } from './stats';
import { ATTENDANCE_REWARDS, ATTENDANCE_CYCLE_LENGTH, type AttendanceReward } from '../core/attendanceBalance';
import { addBox } from './boxes';

const ATTENDANCE_KEY = 'rd_attendance';

// 보상표를 바꿀 때마다 이 숫자를 1 올린다. 저장된 진행도의 버전이 다르면(예전 보상표 기준으로
// 쌓인 진행이면) 진행을 초기화해서, 모든 사람이 새 보상표로 오늘부터 다시 1일차를 시작하게 한다.
const ATTENDANCE_VERSION = 3;

interface AttendanceState {
  lastClaimedDay: number; // 0 = 아직 한 번도 안 받음, 1~7 = 마지막으로 받은 일차
  lastClaimedDate: string; // YYYY-MM-DD, 기기 로컬 날짜 기준
  version: number;
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DEFAULT_STATE: AttendanceState = { lastClaimedDay: 0, lastClaimedDate: '', version: ATTENDANCE_VERSION };

function loadState(): AttendanceState {
  try {
    const raw = localStorage.getItem(ATTENDANCE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.lastClaimedDay === 'number' && typeof parsed.lastClaimedDate === 'string') {
      // 보상표 버전이 다르면(예전 데이터거나 보상표가 바뀌었으면) 진행을 초기화한다.
      if (parsed.version !== ATTENDANCE_VERSION) return { ...DEFAULT_STATE };
      return parsed as AttendanceState;
    }
    return { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state: Omit<AttendanceState, 'version'>): void {
  try {
    localStorage.setItem(ATTENDANCE_KEY, JSON.stringify({ ...state, version: ATTENDANCE_VERSION }));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}

export function canClaimAttendanceToday(): boolean {
  return loadState().lastClaimedDate !== todayString();
}

// 오늘 받을 수 있는(이미 받았다면 방금 받은) 출석 일차: 1~7
export function currentAttendanceDay(): number {
  const state = loadState();
  if (state.lastClaimedDate === todayString()) return state.lastClaimedDay;
  return (state.lastClaimedDay % ATTENDANCE_CYCLE_LENGTH) + 1;
}

export function claimAttendance(): { day: number; reward: AttendanceReward } | null {
  const state = loadState();
  if (state.lastClaimedDate === todayString()) return null;

  const day = (state.lastClaimedDay % ATTENDANCE_CYCLE_LENGTH) + 1;
  const reward = ATTENDANCE_REWARDS[day - 1];
  reward.forEach((item) => addBox(item.boxId, item.count));
  saveState({ lastClaimedDay: day, lastClaimedDate: todayString() });
  addStat('attendanceDays');
  return { day, reward };
}
