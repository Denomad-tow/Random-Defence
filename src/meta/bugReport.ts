import { supabase } from '../core/supabaseClient';

// 버그 제보는 서버 함수(submit_bug_report)를 통해 관리자("관리") 계정의
// 우편함으로 바로 전달된다. 별도 표 없이 기존 우편함(mail) 구조를 재사용한다.
export async function submitBugReport(message: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('submit_bug_report', { p_message: message });
    return !error;
  } catch {
    return false;
  }
}
