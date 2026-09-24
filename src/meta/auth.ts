import { supabase } from '../core/supabaseClient';

// Supabase Auth는 이메일 형식을 요구하지만, 친구들끼리 가볍게 즐기는 게임이라
// 실제 이메일 없이 "닉네임 + 비밀번호"만으로 가입/로그인하게 한다. 닉네임을
// 결정적으로(항상 같은 입력 -> 같은 결과) 가짜 이메일로 바꿔서 사용한다.
const EMAIL_DOMAIN = 'rd.local';

function nicknameToEmail(nickname: string): string {
  const bytes = new TextEncoder().encode(nickname.trim());
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `n${hex}@${EMAIL_DOMAIN}`;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}

export async function signUp(nickname: string, password: string): Promise<AuthResult> {
  const trimmed = nickname.trim();
  if (trimmed.length < 2 || trimmed.length > 12) {
    return { ok: false, error: '닉네임은 2~12자로 입력해주세요' };
  }
  if (password.length < 6) {
    return { ok: false, error: '비밀번호는 6자 이상이어야 해요' };
  }

  const email = nicknameToEmail(trimmed);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nickname: trimmed } },
  });

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return { ok: false, error: '이미 사용 중인 닉네임이에요' };
    }
    return { ok: false, error: error.message };
  }

  // Supabase 프로젝트의 "이메일 확인" 설정이 켜져 있으면 가입은 되지만
  // 세션이 바로 생기지 않는다. 실제 이메일이 없는 가짜 계정이라 확인
  // 메일을 받을 방법이 없으므로, 이 설정은 반드시 꺼져 있어야 한다.
  if (!data.session) {
    return {
      ok: false,
      error: 'Supabase 프로젝트에서 "Confirm email" 설정을 꺼주세요 (Authentication → Sign In / Providers → Email)',
    };
  }

  return { ok: true };
}

export async function signIn(nickname: string, password: string): Promise<AuthResult> {
  const email = nicknameToEmail(nickname);
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { ok: false, error: '닉네임 또는 비밀번호가 올바르지 않아요' };
  }

  return { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentNickname(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  return (user.user_metadata?.nickname as string | undefined) ?? null;
}

export async function hasSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}
