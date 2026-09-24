import { STARTER_COUNT, type UnitDef } from '../core/units';

const COLLECTION_KEY = 'rd_collection';

export function loadCollection(): string[] {
  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCollection(ownedIds: string[]): void {
  try {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(ownedIds));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}

export function ensureStarterCollection(pool: UnitDef[]): string[] {
  const existing = loadCollection();
  if (existing.length > 0) return existing;

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const starter = shuffled.slice(0, STARTER_COUNT).map((u) => u.id);
  saveCollection(starter);
  return starter;
}

export function addToCollection(unitId: string): string[] {
  const next = [...loadCollection(), unitId];
  saveCollection(next);
  return next;
}

export function consumeDuplicates(unitId: string, count: number): void {
  const collection = loadCollection();
  let remaining = count;
  const next: string[] = [];

  collection.forEach((id) => {
    if (id === unitId && remaining > 0) {
      remaining -= 1;
      return;
    }
    next.push(id);
  });

  saveCollection(next);
}
