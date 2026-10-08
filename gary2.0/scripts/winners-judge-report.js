#!/usr/bin/env node
/**
 * THE JUDGE'S WEEK (founder GO, Oct 8 2026): the Winners board against the rest of Gary's bets and against his
 * passes, with the judge's grade split. Read-only, for Adam and me. Nothing here is ever shown to Gary.
 *
 *   node scripts/winners-judge-report.js                          # the last 7 days, ET
 *   node scripts/winners-judge-report.js --from 2026-10-08 --to 2026-10-14
 */
import { createClient } from '@supabase/supabase-js';
await import('../src/loadEnv.js');

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const et = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const to = arg('--to') || et(new Date());
const from = arg('--from') || et(new Date(Date.parse(to + 'T12:00:00Z') - 6 * 86_400_000));
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await supabase.rpc('winners_judge_report', { p_from: from, p_to: to });
if (error) { console.error(error.message); process.exit(1); }
console.log(`THE JUDGE'S WEEK  ${from} to ${to}  (game picks with a result; W-L-P)`);
let last = '';
for (const r of data || []) {
  const head = r.bucket.slice(2);
  if (head !== last) { console.log(''); last = head; }
  console.log(`  ${head.padEnd(28)} ${String(r.league).padEnd(6)} ${r.w}-${r.l}-${r.p}`);
}
if (!data?.length) console.log('  no settled game picks in this range');
