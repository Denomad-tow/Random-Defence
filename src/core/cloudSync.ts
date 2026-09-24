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
];

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

// 로그인 직후 한 번 호출: 서버에 저장된 데이터가 있으면 브라우저 저장소를
// 그 내용으로 덮어써서, 다른 기기에서 로그인해도 이어서 할 수 있게 한다.
export async function pullSnapshot(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('player_data')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data?.data) return;

    const payload = data.data as Record<string, string | null>;
    SYNCED_KEYS.forEach((key) => {
      const value = payload[key];
      if (value === null || value === undefined) return;
      localStorage.setItem(key, value);
    });
  } catch {
    // 네트워크 오류 등으로 실패하면 브라우저에 있던 데이터로 그냥 진행한다.
  }
}

async function pushSnapshot(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  const payload: Record<string, string | null> = {};
  SYNCED_KEYS.forEach((key) => {
    payload[key] = localStorage.getItem(key);
  });

  try {
    await supabase.from('player_data').upsert({
      user_id: userId,
      data: payload,
      updated_at: new Date().toISOString(),
    });
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
