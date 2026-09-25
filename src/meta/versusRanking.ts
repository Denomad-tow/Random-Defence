import { supabase } from '../core/supabaseClient';
import type { PartyMode } from './party';

export interface VersusMatchResult {
  mode: PartyMode;
  partySize: number;
  placement: number; // 1 = 우승
  stageReached: number;
}

export async function recordVersusResult(result: VersusMatchResult, nickname: string): Promise<void> {
  try {
    await supabase.from('versus_matches').insert({
      mode: result.mode,
      party_size: result.partySize,
      nickname,
      placement: result.placement,
      stage_reached: result.stageReached,
    });
  } catch {
    // 순위 기록은 실패해도 게임 진행에 영향을 주면 안 되니 조용히 무시한다.
  }
}

export interface LeaderboardRow {
  nickname: string;
  wins: number;
  games: number;
}

export async function fetchLeaderboard(partySize: number): Promise<LeaderboardRow[]> {
  try {
    const { data, error } = await supabase
      .from('versus_matches')
      .select('nickname, placement')
      .eq('party_size', partySize)
      .limit(2000);

    if (error || !data) return [];

    const stats = new Map<string, { wins: number; games: number }>();
    (data as Array<{ nickname: string; placement: number }>).forEach((row) => {
      const entry = stats.get(row.nickname) ?? { wins: 0, games: 0 };
      entry.games += 1;
      if (row.placement === 1) entry.wins += 1;
      stats.set(row.nickname, entry);
    });

    return Array.from(stats.entries())
      .map(([nickname, s]) => ({ nickname, wins: s.wins, games: s.games }))
      .sort((a, b) => b.wins - a.wins || b.games - a.games);
  } catch {
    return [];
  }
}
