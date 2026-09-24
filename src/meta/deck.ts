export const DECK_SLOT_COUNT = 3;

const DECKS_KEY = 'rd_decks';
const ACTIVE_SLOT_KEY = 'rd_active_deck_slot';
const LEGACY_DECK_KEY = 'rd_deck';

type DeckSlots = (string[] | null)[];

function normalize(raw: unknown): DeckSlots {
  const arr = Array.isArray(raw) ? raw : [];
  const result: DeckSlots = [];

  for (let i = 0; i < DECK_SLOT_COUNT; i += 1) {
    const entry = arr[i];
    result.push(Array.isArray(entry) && entry.every((v) => typeof v === 'string') ? entry : null);
  }

  return result;
}

function migrateLegacyDeck(): void {
  try {
    const legacyRaw = localStorage.getItem(LEGACY_DECK_KEY);
    const alreadyMigrated = localStorage.getItem(DECKS_KEY);
    if (legacyRaw && !alreadyMigrated) {
      const legacy = JSON.parse(legacyRaw);
      if (Array.isArray(legacy)) {
        saveAllDeckSlots(normalize([legacy]));
      }
    }
    if (legacyRaw) localStorage.removeItem(LEGACY_DECK_KEY);
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}

export function loadAllDeckSlots(): DeckSlots {
  migrateLegacyDeck();

  try {
    const raw = localStorage.getItem(DECKS_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    // fallthrough to empty slots
  }

  return normalize([]);
}

function saveAllDeckSlots(slots: DeckSlots): void {
  try {
    localStorage.setItem(DECKS_KEY, JSON.stringify(slots));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}

export function loadDeckSlot(index: number): string[] | null {
  return loadAllDeckSlots()[index] ?? null;
}

export function saveDeckSlot(index: number, deck: string[]): void {
  const slots = loadAllDeckSlots();
  slots[index] = deck;
  saveAllDeckSlots(slots);
}

export function loadActiveSlot(): number {
  try {
    const raw = localStorage.getItem(ACTIVE_SLOT_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isInteger(value) && value >= 0 && value < DECK_SLOT_COUNT ? value : 0;
  } catch {
    return 0;
  }
}

export function saveActiveSlot(index: number): void {
  try {
    localStorage.setItem(ACTIVE_SLOT_KEY, String(index));
  } catch {
    // 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 무시한다.
  }
}
