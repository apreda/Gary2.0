import { cookies } from 'next/headers';
import { currentUser } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
};

/** Minimal shell state only; authorization continues to live at each data source. */
export async function GET() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.getAll().some(cookie => cookie.name.startsWith('sb-'));
  if (!hasSession) return Response.json({ signedIn: false }, { headers });

  const user = await currentUser();
  return Response.json({ signedIn: Boolean(user) }, { headers });
}
