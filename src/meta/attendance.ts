import { ATTENDANCE_REWARDS, ATTENDANCE_CYCLE_LENGTH, type AttendanceReward } from '../core/attendanceBalance';
import { addBox } from './boxes';

const ATTENDANCE_KEY = 'rd_attendance';

interface AttendanceState {
  lastClaimedDay: number; // 0 = 아직 한 번도 안 받음, 1~7 = 마지막으로 받은 일차
  lastClaimedDate: string; // YYYY-MM-DD, 기기 로컬 날짜 기준
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadState(): AttendanceState {
  try {
    const raw = localStorage.getItem(ATTENDANCE_KEY);
    if (!raw) return { lastClaimedDay: 0, lastClaimedDate: '' };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.lastClaimedDay === 'number' && typeof parsed.lastClaimedDate === 'string') {
      return parsed;
    }
    return { lastClaimedDay: 0, lastClaimedDate: '' };
  } catch {
    return { lastClaimedDay: 0, lastClaimedDate: '' };
  }
}

function saveState(state: AttendanceState): void {
  try {
    localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(state));
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
  addBox(reward.boxId, reward.count);
  saveState({ lastClaimedDay: day, lastClaimedDate: todayString() });
  return { day, reward };
}
