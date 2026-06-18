import { NextResponse } from 'next/server';

// Short, brandable App Store link for the X bio. X's profile website field caps at 100 chars, and the full
// App Store URL with the Custom Product Page id (ppid) + Apple campaign tag (ct) is too long to paste there.
// betwithgary.ai/get is short, looks better than a raw store URL, and carries ppid + ct through to Apple.
// 302 (temporary) so the destination can change without cache lock-in.
const APP_STORE_URL =
  'https://apps.apple.com/us/app/gary-ai/id6751238914?ppid=3c207d81-dc0d-4cc3-a50d-b5f47e29b18f&ct=x_bio';

export function GET() {
  return NextResponse.redirect(APP_STORE_URL, 302);
}
