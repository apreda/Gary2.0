import 'server-only';
import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedCron(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const received = request.headers.get('authorization') ?? '';
  const expectedHeader = `Bearer ${expected}`;
  const a = Buffer.from(received);
  const b = Buffer.from(expectedHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}
