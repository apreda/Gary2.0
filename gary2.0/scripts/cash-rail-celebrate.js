#!/usr/bin/env node
/**
 * Cash Rail celebrations: draws Gary dancing in the scorer's number and team
 * colors for every touchdown and every +800-or-longer hit on today's live
 * boards (src/services/cashRail/celebrateRunner.js), using gpt-image with
 * Gary's real art as the reference, and stores the frames in the public
 * `celebrations` bucket. One pass per run.
 *
 * Usage:
 *   node scripts/cash-rail-celebrate.js                 # today's live boards, up to 2 plays
 *   node scripts/cash-rail-celebrate.js --game 1392323 --limit 1
 */
import '../src/loadEnv.js';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { runCelebrations } from '../src/services/cashRail/celebrateRunner.js';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : dflt; };
const GAME = arg('game', null);
const LIMIT = Number(arg('limit', 2));
const IMAGE_MODEL = process.env.CASH_RAIL_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
const GARY_REF = readFileSync(new URL('../assets/cash-rail/gary-ref.png', import.meta.url));
const BUCKET = 'celebrations';

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });
const must = ({ data, error }) => { if (error) throw error; return data; };
const etDate = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);

const db = {
  boards: async () => {
    let q = supabase.from('live_boards').select('league,game_id,status,hits,elapsed_s,updated_at').eq('league', 'NFL');
    if (GAME) q = q.eq('game_id', GAME);
    else q = q.in('date', [etDate(new Date()), etDate(new Date(Date.now() - 86_400_000))])
      .gte('updated_at', new Date(Date.now() - 20 * 60_000).toISOString());
    return must(await q);
  },
  existingPlayKeys: async (league, gameId) => must(await supabase.from('celebrations').select('play_key').eq('league', league).eq('game_id', gameId)).map(r => r.play_key),
  claim: async row => (must(await supabase.from('celebrations').upsert(row, { onConflict: 'league,game_id,play_key', ignoreDuplicates: true }).select('play_key')) ?? []).length > 0,
  markReady: async (playKey, assets) => { must(await supabase.from('celebrations').update({ status: 'ready', assets, ready_at: new Date().toISOString() }).eq('play_key', playKey).eq('status', 'generating')); },
  markFailed: async playKey => { must(await supabase.from('celebrations').update({ status: 'failed' }).eq('play_key', playKey).eq('status', 'generating')); },
};

const bdl = {
  player: async id => {
    const r = await fetch(`https://api.balldontlie.io/nfl/v1/players?player_ids[]=${id}`, { headers: { Authorization: process.env.BALLDONTLIE_API_KEY } });
    const p = r.ok ? (await r.json()).data?.[0] : null;
    return p ? { number: p.jersey_number ?? null, team: p.team?.abbreviation ?? null } : null;
  },
};

async function art({ prompt, transparent }) {
  const form = new FormData();
  form.append('model', IMAGE_MODEL);
  form.append('image[]', new Blob([GARY_REF], { type: 'image/png' }), 'gary.png');
  form.append('size', '1024x1536');
  form.append('quality', 'high');
  form.append('output_format', 'webp');
  if (transparent) form.append('background', 'transparent');
  form.append('prompt', prompt);
  const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  const j = await r.json();
  if (!r.ok || !j.data?.[0]?.b64_json) throw new Error(j.error?.message || `image ${r.status}`);
  return Buffer.from(j.data[0].b64_json, 'base64');
}

const store = {
  exists: async path => {
    const dir = path.split('/').slice(0, -1).join('/'), name = path.split('/').pop();
    return (must(await supabase.storage.from(BUCKET).list(dir, { search: name })) ?? []).some(f => f.name === name);
  },
  put: async (path, bytes) => {
    must(await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/webp', upsert: true }));
    return store.url(path);
  },
  url: path => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
};

const n = await runCelebrations({ db, bdl, art, store, limit: LIMIT, log: m => console.log(`[celebrate ${new Date().toISOString()}] ${m}`) });
console.log(`[celebrate] ${n} drawn`);
