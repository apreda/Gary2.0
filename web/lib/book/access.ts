'use client';

import { supabaseBrowser } from '@/lib/auth/client';
import type { GaryPick, PropPick } from '@/lib/gary/types';

export interface WinnersAccess {
  preview_until: string;
  preview: boolean;
  founding: boolean;
  sports: string[];
  subscriptions: {
    product_key: string;
    pass_type: string;
    status: string;
    expires_at: string | null;
    cancel_at_period_end: boolean;
  }[];
  can_manage: boolean;
}
export interface WinnersBoard {
  access: WinnersAccess;
  boards: { league: string; kind: string; count: number; locked: boolean }[];
  tickets: {
    id?: string;
    candidate_id: string;
    game_date: string;
    league: string;
    kind: string;
    admitted_at: string;
    pick_snapshot: GaryPick & PropPick;
  }[];
}
export async function fetchAccess(): Promise<WinnersAccess> {
  const { data, error } = await supabaseBrowser().rpc('get_my_access');
  if (error || !data) throw new Error('Your Winners access could not load. Please retry.');
  return data as WinnersAccess;
}
export async function fetchWinners(date: string): Promise<WinnersBoard> {
  const { data, error } = await supabaseBrowser().rpc('get_winners_board', { p_date: date });
  if (error || !data) throw new Error('The Winners board could not load. Please retry.');
  return data as WinnersBoard;
}
export async function openBilling(
  kind: 'checkout' | 'portal',
  body: { leagues?: string[]; plan?: string } = {},
): Promise<void> {
  const { data, error } = await supabaseBrowser().functions.invoke(
    kind === 'checkout' ? 'create-checkout' : 'billing-portal',
    { body },
  );
  if (error || !data?.url) {
    let message: unknown = data?.error;
    if (error?.context instanceof Response) {
      try {
        message = (await error.context.json()).error;
      } catch {
        /* Use the friendly fallback. */
      }
    }
    throw new Error(
      typeof message === 'string' && message.length < 300
        ? message
        : kind === 'checkout'
          ? 'Checkout is not available right now. Your free Book and picks remain available.'
          : 'Billing could not open. Please retry.',
    );
  }
  const url = new URL(data.url);
  if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname))
    throw new Error('Billing returned an unavailable destination. Please retry.');
  window.location.assign(url.toString());
}
