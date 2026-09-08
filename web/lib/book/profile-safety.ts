'use client';

import { supabaseBrowser } from '@/lib/auth/client';

export const PROFILE_HELP_URL = '/terms#profile-safety';
export const REPORT_REASONS = [
  ['harassment', 'Harassment or abuse'], ['hate', 'Hateful content'], ['threats', 'Threats or violence'],
  ['sexual_content', 'Sexual content'], ['spam', 'Spam or links'], ['impersonation', 'Impersonation'], ['other', 'Something else'],
] as const;
export type ReportReason = typeof REPORT_REASONS[number][0];
export type ProfileSafetyState = { blocked: boolean; is_owner: boolean; my_profile_hidden: boolean };
export type BlockedProfile = { user_id: string; display_name: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(message: string | undefined): Error {
  const lower = (message ?? '').toLowerCase();
  if (lower.includes('not signed in') || lower.includes('jwt') || lower.includes('unauthorized')) return new Error('Sign in again to manage profile safety.');
  if (lower.includes('report limit')) return new Error('You have sent several reports recently. Try again later, or contact support for help.');
  if (lower.includes('block limit')) return new Error('Your blocked-player list is full. Remove a block before adding another.');
  if (lower.includes('not available')) return new Error('This profile is no longer available. Refresh to check it.');
  return new Error('This change could not be confirmed. Please retry.');
}
export async function fetchProfileSafety(userID: string): Promise<ProfileSafetyState> {
  const { data, error } = await supabaseBrowser().rpc('get_profile_safety', { p_user: userID });
  if (error || typeof data?.blocked !== 'boolean' || typeof data?.is_owner !== 'boolean' || typeof data?.my_profile_hidden !== 'boolean') throw failure(error?.message);
  return data as ProfileSafetyState;
}
export async function setProfileBlock(userID: string, blocked: boolean): Promise<void> {
  const { data, error } = await supabaseBrowser().rpc('set_profile_block', { p_user: userID, p_blocked: blocked });
  if (error || data?.ok !== true || data?.blocked !== blocked) throw failure(error?.message);
}
export async function reportProfile(userID: string, reason: ReportReason, details: string): Promise<string> {
  const { data, error } = await supabaseBrowser().rpc('report_profile', { p_user: userID, p_reason: reason, p_details: details.trim() });
  if (error || data?.ok !== true || typeof data?.report_id !== 'string' || !UUID.test(data.report_id)) throw failure(error?.message);
  return data.report_id;
}
export async function fetchBlockedProfiles(): Promise<BlockedProfile[]> {
  const { data, error } = await supabaseBrowser().rpc('my_blocked_profiles');
  if (error || !Array.isArray(data) || !data.every(row => typeof row?.user_id === 'string' && UUID.test(row.user_id) && typeof row.display_name === 'string')) throw failure(error?.message);
  return data as BlockedProfile[];
}
