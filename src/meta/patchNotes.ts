import notesData from '../data/patchNotes.json';

// 공지사항(패치 노트). 새 버전을 낼 때 src/data/patchNotes.json 맨 위에 항목을 하나 추가하면
// 게임을 여는 모든 사람에게 "새 소식" 팝업이 한 번씩 뜬다.
export interface PatchNote {
  version: string;
  date: string;
  title: string;
  items: string[];
}

const SEEN_KEY = 'rd_seen_patch';

export const PATCH_NOTES: PatchNote[] = notesData as PatchNote[];

export function latestPatch(): PatchNote | undefined {
  return PATCH_NOTES[0];
}

export function loadSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

// 이 기기에서 아직 확인하지 않은 최신 공지가 있는가.
export function hasUnseenPatch(): boolean {
  const latest = latestPatch();
  return !!latest && loadSeenVersion() !== latest.version;
}

export function markPatchSeen(): void {
  const latest = latestPatch();
  if (!latest) return;
  try {
    localStorage.setItem(SEEN_KEY, latest.version);
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}

// 팝업에 쓸 내용 모양으로 바꾼다.
export function patchToModal(note: PatchNote): { title: string; subtitle: string; lines: string[] } {
  return {
    title: `v${note.version} · ${note.title}`,
    subtitle: note.date,
    lines: note.items.map((item) => `• ${item}`),
  };
}
