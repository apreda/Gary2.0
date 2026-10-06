#!/usr/bin/env node
// GARY'S BANKROLL NOTEBOOK (founder GO, Oct 6 2026: "maybe he needs a memory file to carry on from day to day").
// Once a day, after the night's results are graded and before the day's bets, Gary reads his goal, his bankroll
// (start, now, the season, the last seven days, yesterday's bets, what is riding) and his notebook so far, and
// writes today's notebook in his own words. The bet step (src/services/pickdesk/garyBet.js) shows him the latest
// entry every time he decides a bet. Runs hourly from launchd (com.gary.bankroll-notebook) from 7 AM ET; a day
// that already has its entry exits at once. Never touches a pick or a bet.
import '../src/loadEnv.js';
import { pathToFileURL } from 'node:url';
import { supabaseAdmin as supabase } from '../src/supabaseClient.js';
import { createModelSession, sendToSessionWithRetry } from '../src/services/agentic/orchestrator/sessionManager.js';
import { GAME_PICK_MODEL } from '../src/services/agentic/orchestrator/orchestratorConfig.js';
import { GOAL, BET_EFFORT, bankrollBlock, notebookBlock } from '../src/services/pickdesk/garyBet.js';

const FIRST_HOUR_ET = 7;   // daily results grade at 2:00 and 6:45 AM ET
const MAX_CHARS = 8000;

const etNow = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};

export function notebookAsk({ brief, previous }) {
  return [
    'You are Gary. Winners is your real-money board, and you run its bankroll yourself: you decide which of your picks you bet and how much.',
    '',
    GOAL,
    '',
    bankrollBlock(brief),
    '',
    previous ? notebookBlock(previous) : 'YOUR NOTEBOOK: this is its first entry.',
    '',
    "Your notebook is yours. You read it every time you decide a bet, and it carries from one day to the next. Write today's version now: how you are running the bankroll, how you decide what to bet and how much, and anything from your bets so far that you want to carry forward. Under 300 words, in your own words, for yourself.",
    'Return only the notebook text.',
  ].join('\n');
}

export function cleanNotebook(raw) {
  const text = String(raw || '').replace(/^```(?:\w+)?\s*/, '').replace(/```\s*$/, '').trim();
  return text && text.length <= MAX_CHARS ? text : null;
}

async function main() {
  const force = process.argv.includes('--now');
  const { date, hour } = etNow();
  if (!force && hour < FIRST_HOUR_ET) return;
  const have = await supabase.from('gary_bankroll_notebook').select('written_for').eq('written_for', date).maybeSingle();
  if (have.error) throw have.error;
  if (have.data) return;

  const [briefRes, prevRes] = await Promise.all([
    supabase.rpc('winners_bankroll_brief'),
    supabase.from('gary_bankroll_notebook').select('written_for,notebook').order('written_for', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (briefRes.error) throw briefRes.error;     // no notebook without his real numbers; the next hour tries again
  if (prevRes.error) throw prevRes.error;

  const session = await createModelSession({ modelName: GAME_PICK_MODEL, systemPrompt: '', tools: [], thinkingLevel: BET_EFFORT });
  const res = await sendToSessionWithRetry(session, notebookAsk({ brief: briefRes.data, previous: prevRes.data }), {});
  const notebook = cleanNotebook(res?.content);
  if (!notebook) throw new Error('the notebook answer was empty or too long');

  const { error } = await supabase.from('gary_bankroll_notebook')
    .upsert({ written_for: date, notebook, model: res?.model || session.modelName || GAME_PICK_MODEL, bankroll: briefRes.data },
      { onConflict: 'written_for', ignoreDuplicates: true });
  if (error) throw error;
  console.log(`[Notebook] ${new Date().toISOString()} written for ${date} (${res?.model || GAME_PICK_MODEL}):\n${notebook}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => process.exit(0)).catch((e) => { console.error(`[Notebook] ${new Date().toISOString()} ${e?.message || e}`); process.exit(1); });
}
