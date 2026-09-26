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

// ----- 협동전 기록 -----
// 협동전은 승패가 없어서 "몇 스테이지까지 갔는가"로 순위를 매긴다. 판이 끝날 때 참가자
// 각자가 자기 기록을 한 줄씩 남긴다.
export async function recordCoopResult(partySize: number, stageReached: number, nickname: string): Promise<void> {
  if (partySize < 2 || partySize > 5 || !nickname) return;
  try {
    await supabase.from('coop_matches').insert({
      party_size: partySize,
      nickname,
      stage_reached: stageReached,
    });
  } catch {
    // 순위 기록은 실패해도 게임 진행에 영향을 주면 안 되니 조용히 무시한다.
  }
}

export interface CoopLeaderboardRow {
  nickname: string;
  bestStage: number;
  games: number;
}

export async function fetchCoopLeaderboard(partySize: number): Promise<CoopLeaderboardRow[]> {
  try {
    const { data, error } = await supabase
      .from('coop_matches')
      .select('nickname, stage_reached')
      .eq('party_size', partySize)
      .limit(2000);

    if (error || !data) return [];

    const stats = new Map<string, { bestStage: number; games: number }>();
    (data as Array<{ nickname: string; stage_reached: number }>).forEach((row) => {
      const entry = stats.get(row.nickname) ?? { bestStage: 0, games: 0 };
      entry.games += 1;
      entry.bestStage = Math.max(entry.bestStage, row.stage_reached);
      stats.set(row.nickname, entry);
    });

    return Array.from(stats.entries())
      .map(([nickname, s]) => ({ nickname, bestStage: s.bestStage, games: s.games }))
      .sort((a, b) => b.bestStage - a.bestStage || b.games - a.games);
  } catch {
    return [];
  }
}
