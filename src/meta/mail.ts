import { supabase } from '../core/supabaseClient';

export interface MailItem {
  id: string;
  title: string;
  body: string;
  reward_gold: number;
  reward_box_id: string | null;
  reward_box_count: number;
  created_at: string;
  claimed_at: string | null;
}

export async function fetchUnclaimedMail(): Promise<MailItem[]> {
  try {
    const { data, error } = await supabase
      .from('mail')
      .select('*')
      .is('claimed_at', null)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data as MailItem[];
  } catch {
    return [];
  }
}

export async function claimMail(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('mail').update({ claimed_at: new Date().toISOString() }).eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

export async function isAdmin(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('am_i_admin');
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

export async function listNicknames(): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('admin_list_nicknames');
    if (error || !data) return [];
    return (data as Array<{ nickname: string }>).map((row) => row.nickname);
  } catch {
    return [];
  }
}

export async function findUserByNickname(nickname: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('admin_find_user_by_nickname', { p_nickname: nickname });
    if (error) return null;
    return (data as string | null) ?? null;
  } catch {
    return null;
  }
}

export interface SendMailParams {
  title: string;
  body: string;
  gold: number;
  boxId: string | null;
  boxCount: number;
  recipientId: string | null; // null = 전체 발송
}

export async function sendMail(params: SendMailParams): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc('admin_send_mail', {
      p_title: params.title,
      p_body: params.body,
      p_gold: params.gold,
      p_box_id: params.boxId,
      p_box_count: params.boxCount,
      p_recipient_id: params.recipientId,
    });

    if (error) return null;
    return data as number;
  } catch {
    return null;
  }
}
