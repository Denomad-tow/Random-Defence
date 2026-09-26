import { supabase } from './supabaseClient';

// 브라우저(localStorage)에만 있던 게임 데이터를 로그인한 계정에 묶어서
// Supabase에도 저장한다. 기존 meta/*.ts 저장 로직은 전혀 건드리지 않고,
// "지금 localStorage에 있는 이 키들을 통째로 서버와 맞춘다"는 동기화 층만
// 새로 추가하는 방식이다.
const SYNCED_KEYS = [
  'rd_gold',
  'rd_collection',
  'rd_decks',
  'rd_active_deck_slot',
  'rd_levels',
  'rd_boxes',
  'rd_gacha_pity',
  'rd_research',
  'rd_best_stage',
  'rd_attendance',
];

// 이 브라우저에 남아있는 게임 데이터가 어느 계정의 것인지 기억해둔다.
const OWNER_KEY = 'rd_data_owner';

// 서버와 마지막으로 맞춘 시점의 데이터 "지문". 폰에서 앱을 잠깐 떠났다가(카톡 등) 서버 저장이
// 끊긴 채로 앱이 종료되면, 서버에는 옛 데이터가 남는다. 다음 실행 때 그 옛 데이터로 덮어써서
// 방금 얻은 유닛이 사라지지 않도록, "이 기기에 아직 서버에 못 올린 변경이 있는지" 알아내는 데 쓴다.
const SYNCED_HASH_KEY = 'rd_synced_hash';

function snapshotHash(payload: Record<string, string | null>): string {
  const text = SYNCED_KEYS.map((key) => `${key}=${payload[key] ?? ''}`).join('\n');
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return String(hash);
}

function localPayload(): Record<string, string | null> {
  const payload: Record<string, string | null> = {};
  SYNCED_KEYS.forEach((key) => {
    payload[key] = localStorage.getItem(key);
  });
  return payload;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

// 이 브라우저에 남은 게임 데이터를 전부 지운다. 새로 가입하거나 탈퇴할 때
// 이전 계정의 데이터가 다음 계정으로 이어지지 않게 하기 위해 쓴다.
export function clearLocalGameData(): void {
  SYNCED_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(OWNER_KEY);
  localStorage.removeItem(SYNCED_HASH_KEY);
}

// 로그인 직후 한 번 호출: 서버에 저장된 데이터가 있으면 브라우저 저장소를
// 그 내용으로 덮어써서, 다른 기기에서 로그인해도 이어서 할 수 있게 한다.
export async function pullSnapshot(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  // 브라우저에 남은 데이터가 "다른 계정"의 것이면(같은 폰에서 계정을 바꿔 로그인한
  // 경우) 지우고 시작해서 이전 계정 데이터가 섞이지 않게 한다.
  const owner = localStorage.getItem(OWNER_KEY);
  if (owner && owner !== userId) clearLocalGameData();
  localStorage.setItem(OWNER_KEY, userId);

  try {
    const { data, error } = await supabase
      .from('player_data')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data?.data) return;

    // 이 기기에 서버에 못 올린 변경이 남아 있으면(서버 저장이 끊겼던 경우) 서버 데이터로
    // 덮어쓰지 않는다. 바로 뒤에 시작되는 동기화가 이 기기 데이터를 서버로 올린다.
    const syncedHash = localStorage.getItem(SYNCED_HASH_KEY);
    if (syncedHash !== null && syncedHash !== snapshotHash(localPayload())) return;

    const payload = data.data as Record<string, string | null>;
    SYNCED_KEYS.forEach((key) => {
      const value = payload[key];
      if (value === null || value === undefined) return;
      localStorage.setItem(key, value);
    });
    localStorage.setItem(SYNCED_HASH_KEY, snapshotHash(localPayload()));
  } catch {
    // 네트워크 오류 등으로 실패하면 브라우저에 있던 데이터로 그냥 진행한다.
  }
}

async function pushSnapshot(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  const payload = localPayload();

  try {
    const { error } = await supabase.from('player_data').upsert({
      user_id: userId,
      data: payload,
      updated_at: new Date().toISOString(),
    });
    if (!error) localStorage.setItem(SYNCED_HASH_KEY, snapshotHash(payload));
  } catch {
    // 네트워크가 끊긴 경우 등에는 다음 동기화 시도에서 다시 보낸다.
  }
}

const PUSH_INTERVAL_MS = 20000;

// 로그인 후 한 번 호출: 주기적으로, 그리고 탭을 떠나거나 창을 닫기 직전에
// 서버로 저장한다. 매초 저장하지 않고 꼭 필요한 순간(주기적 스냅샷 + 이탈
// 시점)에만 저장해 무료 요금제 사용량을 아낀다.
export function startCloudSync(): void {
  void pushSnapshot();

  setInterval(() => {
    void pushSnapshot();
  }, PUSH_INTERVAL_MS);

  window.addEventListener('beforeunload', () => {
    void pushSnapshot();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void pushSnapshot();
    }
  });
}

// 로그아웃 직전처럼, 확실히 저장을 끝낸 뒤에 다음 동작으로 넘어가야 할 때
// 사용한다.
export async function flushSnapshot(): Promise<void> {
  await pushSnapshot();
}
