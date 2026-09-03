#!/usr/bin/env node
// MOCK NFL DAY — sim design fixture (founder, Sep 3 2026).
//
// Week 1 kicks off Thu Sep 10; until then the NFL surfaces have nothing to
// render, so the football sections under the pick card cannot be designed.
// This script clones a REAL stored NFL day (the Aug 28-29 preseason finale)
// for three games — every table the iOS app reads for NFL — remaps the ids
// so no real result can ever grade the clones, swaps every date/kickoff/
// as-of for a token the app fills at request time, and writes the result as
// ios/GaryApp/GaryMockFixture.swift (raw JSON literals inside #if DEBUG, so
// a Release binary carries none of it). GaryMock.swift serves it.
//
//   node scripts/mock-nfl-fixture.js            # regenerate the fixture
//
// Tokens the app resolves (GaryMock.fill):
//   {{DATE}}        today's ET date
//   {{ET HH:MM}}    today at that ET clock time, ISO-8601 UTC
//   {{ASOF HH:MM}}  min(now - 45m, kickoff - 30m) — a receipt observed before kickoff
//   {{PUB HH:MM}}   min(now - 90m, kickoff - 60m) — the pick published before the receipt

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { ballDontLieService } from '../src/services/ballDontLieService.js';
import { gameLabel } from '../src/services/insights/shared.js';
import { footballSeasonForDate, loadFootballSlate } from '../src/services/insights/footballData.js';
import { computeNflFantasyEdges } from '../src/services/insights/computers/nflFantasyEdges.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
);

// The three cloned games: a spread dog, a spread dog, a moneyline favorite.
// `date` = the day their rows were written; `kick` = today's mock kickoff (ET).
const GAMES = [
  { id: 1393585, date: '2026-08-28', kick: '13:00', label: '1:00 PM', away: 'Atlanta Falcons', home: 'Miami Dolphins', awayAbbr: 'ATL', homeAbbr: 'MIA' },
  { id: 1393594, date: '2026-08-29', kick: '16:25', label: '4:25 PM', away: 'Detroit Lions', home: 'Indianapolis Colts', awayAbbr: 'DET', homeAbbr: 'IND' },
  { id: 1393595, date: '2026-08-29', kick: '20:20', label: '8:20 PM', away: 'Chicago Bears', home: 'Tennessee Titans', awayAbbr: 'CHI', homeAbbr: 'TEN' },
];
const ID_OFFSET = 9_000_000;
const mockId = (id) => Number(id) + ID_OFFSET;
const mockPickId = (id) => `mock-nfl-${mockId(id)}`;
const gameById = new Map(GAMES.map((g) => [String(g.id), g]));

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../ios/GaryApp/GaryMockFixture.swift');

function parseJsonb(v) {
  if (Array.isArray(v) || (v && typeof v === 'object')) return v;
  try { return JSON.parse(v || '[]'); } catch { return []; }
}

/** Walk any JSON value, rewriting the date/id keys the app and the proof contract read. */
function retime(value, game, key = null) {
  if (Array.isArray(value)) return value.map((v) => retime(v, game));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (['created_at', 'updated_at', 'graded_at', 'generated_by'].includes(k)) continue;
      out[k] = retime(v, game, k);
    }
    return out;
  }
  switch (key) {
    case 'date': case 'scheduled_date': case 'through': case 'report_date': case 'game_date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? '{{DATE}}' : value;
    case 'commence_time': case 'kickoff':
      return `{{ET ${game.kick}}}`;
    case 'as_of':
      return `{{ASOF ${game.kick}}}`;
    case 'published_at':
      return `{{PUB ${game.kick}}}`;
    case 'game_id': case 'bdl_game_id':
      if (value == null) return value;
      return typeof value === 'number' ? mockId(value) : String(mockId(value));
    case 'pick_id':
      return value == null ? value : mockPickId(game.id);
    case 'result': case 'result_note':
      return null;
    default:
      return value;
  }
}

async function loadPicks() {
  const { data, error } = await supabase
    .from('weekly_nfl_picks').select('picks').eq('week_start', '2026-08-25').eq('season', 2026).limit(1);
  if (error) throw error;
  const all = parseJsonb(data?.[0]?.picks);
  return GAMES.map((g) => {
    const pick = all.find((p) => p.awayTeam === g.away && p.homeTeam === g.home);
    if (!pick) throw new Error(`no stored pick for ${g.away} @ ${g.home}`);
    const clone = retime({ ...pick, game_id: g.id, bdl_game_id: g.id, pick_id: pick.pick_id }, g);
    clone.time = g.label;
    clone.awayTeamAbbreviation = clone.awayTeamAbbreviation || g.awayAbbr;
    clone.homeTeamAbbreviation = clone.homeTeamAbbreviation || g.homeAbbr;
    return clone;
  });
}

async function loadConnections() {
  const rows = [];
  for (const g of GAMES) {
    const { data, error } = await supabase
      .from('insight_connections')
      .select('date,league,category,headline,detail,game,value,tone,spark,line_val,relevance_score,player_id,team_id,game_id,meta,result,result_note')
      .eq('league', 'NFL').eq('date', g.date).eq('game_id', String(g.id))
      .neq('category', 'next_slate')
      .order('relevance_score', { ascending: false });
    if (error) throw error;
    // The stored fantasy rows predate the card contract (Sep 3 2026); the
    // live writer regenerates them below in the shape the Fantasy Corner reads.
    for (const r of data) if (!String(r.category).startsWith('fantasy_')) rows.push(retime(r, g));
  }
  rows.push(...await loadFantasyRows());
  return rows.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
}

/** Runs the real NFL fantasy writer against the cloned slates (BDL + the analyst pass). */
async function loadFantasyRows() {
  const out = [];
  for (const date of [...new Set(GAMES.map((g) => g.date))]) {
    const games = await loadFootballSlate({ bdl: ballDontLieService, league: 'nfl', date });
    const wanted = games.filter((game) => gameById.has(String(game?.id)));
    if (!wanted.length) { console.warn(`no BDL slate rows for ${date}`); continue; }
    const rows = await computeNflFantasyEdges({
      date, season: footballSeasonForDate(date), league: 'nfl', games: wanted,
      slateGameIds: new Set(wanted.map((game) => game.id)), bdl: ballDontLieService, helpers: { gameLabel },
    });
    for (const r of rows) {
      const g = gameById.get(String(r.game_id));
      if (!g) continue;
      // insight_connections stores ids as TEXT; the app decodes them as String
      // and a numeric id fails the row's decode (the writer stringifies at persist).
      const text = (v) => (v == null ? null : String(v));
      out.push(retime({
        ...r, date, league: 'NFL', game_id: text(r.game_id), player_id: text(r.player_id), team_id: text(r.team_id),
        result: null, result_note: null,
      }, g));
    }
  }
  console.log(`  fantasy rows regenerated by the live writer: ${out.length}`);
  return out;
}

async function loadBoardRows(picks) {
  const boards = {};
  for (const d of [...new Set(GAMES.map((g) => g.date))]) {
    const { data, error } = await supabase.from('tomorrow_board').select('board').eq('date', d).limit(1);
    if (error) throw error;
    boards[d] = parseJsonb(data?.[0]?.board).filter((r) => (r.league || '').toUpperCase() === 'NFL');
  }
  const template = boards['2026-08-29'].find((r) => r.bdl_game_id === 1393595);
  return GAMES.map((g, i) => {
    const real = boards[g.date].find((r) => r.bdl_game_id === g.id);
    const pick = picks[i];
    // DET @ IND never got a board row on Aug 29; shape it off the CHI @ TEN row.
    const row = real ?? {
      ...template,
      away_team: g.away, home_team: g.home,
      spread: pick.spread != null ? -pick.spread : template.spread,
      total: pick.total ?? template.total,
    };
    return retime({ ...row, bdl_game_id: g.id, away_abbr: row.away_abbr ?? g.awayAbbr, home_abbr: row.home_abbr ?? g.homeAbbr }, g);
  });
}

async function loadLeaguePulse(picks) {
  const { data, error } = await supabase
    .from('league_pulse').select('date,league,tab,title,subtitle,sort_note,columns,rows')
    .eq('league', 'NFL').eq('date', '2026-08-29').order('tab', { ascending: true });
  if (error) throw error;
  return data.map((row) => {
    const clone = retime(row, GAMES[2]);
    if (row.tab === 'the_board') {
      const byMatchup = new Map(row.rows.map((r) => [r.matchup, r]));
      clone.rows = GAMES.map((g, i) => {
        const key = `${g.awayAbbr} @ ${g.homeAbbr}`;
        const real = byMatchup.get(key) ?? byMatchup.get('DET @ IND');
        const pick = picks[i];
        return {
          ...real,
          matchup: key,
          kick: `${g.label} ET`,
          ...(byMatchup.has(key) ? {} : {
            spread: `${g.awayAbbr} ${pick.spread != null ? (-pick.spread > 0 ? '-' : '+') + Math.abs(pick.spread) : '-3.5'}`,
            total: String(pick.total ?? real.total),
          }),
        };
      });
    }
    return clone;
  });
}

async function loadWire() {
  const { data, error } = await supabase
    .from('wire_items')
    .select('id,date,league,kind,headline,subline,source_handle,game,relevance_score,meta')
    .eq('league', 'NFL').in('date', [...new Set(GAMES.map((g) => g.date))]);
  if (error) throw error;
  return data.map((r) => retime({ ...r, id: r.id + ID_OFFSET }, GAMES[2]));
}

function swiftLiteral(name, value) {
  const json = JSON.stringify(value, null, 1);
  if (json.includes('"""#')) throw new Error(`${name}: JSON contains the raw-string terminator`);
  return `    static let ${name} = #"""\n${json}\n"""#\n`;
}

const picks = await loadPicks();
const [connections, boardRows, leaguePulse, wireItems] = await Promise.all([
  loadConnections(), loadBoardRows(picks), loadLeaguePulse(picks), loadWire(),
]);

const swift = `#if DEBUG
// GENERATED by gary2.0/scripts/mock-nfl-fixture.js — a real NFL day (Aug 28-29
// 2026 preseason finale) cloned for the sim so the football surfaces can be
// designed before Week 1. Ids are remapped (+${ID_OFFSET}) so no stored result
// can grade these; every date/kickoff/as-of is a token GaryMock fills at
// request time. Edit copy freely for design passes; re-run the script to
// reset. Compiled out of Release entirely.
//
// Games: ${GAMES.map((g) => `${g.awayAbbr} @ ${g.homeAbbr} ${g.label}`).join(' · ')}
enum GaryMockFixture {
${swiftLiteral('weeklyNFLPicks', picks)}
${swiftLiteral('insightConnections', connections)}
${swiftLiteral('boardRows', boardRows)}
${swiftLiteral('leaguePulse', leaguePulse)}
${swiftLiteral('wireItems', wireItems)}
}
#endif
`;

fs.writeFileSync(OUT, swift);
console.log(`wrote ${OUT} (${(swift.length / 1024).toFixed(0)} KB): ${picks.length} picks · ${connections.length} insight rows · ${boardRows.length} board rows · ${leaguePulse.length} pulse tabs · ${wireItems.length} wire items`);
for (const p of picks) console.log(`  ${p.awayTeam} @ ${p.homeTeam} — ${p.pick} — ${(p.statsData || []).length} stats, ${(p.injuries?.away?.length || 0) + (p.injuries?.home?.length || 0)} injuries`);
const cats = {};
for (const r of connections) cats[r.category] = (cats[r.category] || 0) + 1;
console.log('  categories:', JSON.stringify(cats));
