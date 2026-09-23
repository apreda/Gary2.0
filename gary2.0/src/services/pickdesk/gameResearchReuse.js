import { supabase, supabaseAdmin } from '../../supabaseClient.js';

// The props desk read the web again for the same game the pick lane had just
// researched: six searches per build (news, storylines, both pens' press,
// both starters' press), repeated on every account failure. Founder, Sep 23
// 2026: props reuse the game pick's research. The pick lane stores the full
// desk it read (pick_desks); this lifts that desk's searched sections so the
// props desk searches only for what the game desk never asked (the starters'
// press) or when no game desk exists yet.

const NEWS = '═══ GAME CONTEXT (odds, preview, pitchers) ═══';
const TEAM_STATE = '═══ SEASON CONTEXT (form, standings, player backgrounds) ═══';
const BULLPEN = '═══ BULLPEN ═══';
const MAX_AGE_MS = 8 * 60 * 60 * 1000;

function sectionBody(desk, header) {
  const start = desk.indexOf(header);
  if (start < 0) return null;
  const from = start + header.length;
  const next = desk.indexOf('\n═══ ', from);
  const body = desk.slice(from, next < 0 ? undefined : next).trim();
  return body || null;
}

// The pen snapshot prints each club's reporting as "THE PEN, AS REPORTED —
// <club>", marked "(unavailable)" when its search came back empty; only a
// club with reporting is reused, the other still searches.
function penReporting(desk) {
  const out = {};
  const re = /THE PEN, AS REPORTED — ([^\n]+)\n([\s\S]*?)(?=\n\nTHE PEN, AS REPORTED — |\n\nLive status check:|\n═══ |$)/g;
  for (const m of desk.matchAll(re)) {
    if (/\(unavailable\)\s*$/.test(m[1]) || !m[2].trim()) continue;
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}

/** The reused pen reporting for one club: the desk's club name ("Red Sox") inside the full name ("Boston Red Sox"). */
export function penFor(research, team) {
  const name = String(team || '').trim().toLowerCase();
  if (!name) return null;
  const hit = Object.entries(research?.pen || {}).find(([club]) => club.toLowerCase().includes(name));
  return hit ? hit[1] : null;
}

/** Today's stored game-desk research for this matchup, or null to search as before. */
export async function loadGameDeskResearch({ gameDate, matchup, now = Date.now(), client = supabaseAdmin || supabase } = {}) {
  if (!gameDate || !matchup || !client) return null;
  try {
    const { data, error } = await client.from('pick_desks')
      .select('desk, created_at').eq('game_date', gameDate).eq('matchup', matchup).maybeSingle();
    if (error || !data?.desk) return null;
    if (now - Date.parse(data.created_at) > MAX_AGE_MS) return null;
    const research = { news: sectionBody(data.desk, NEWS), storylines: sectionBody(data.desk, TEAM_STATE), pen: penReporting(data.desk) };
    return research.news || research.storylines || Object.keys(research.pen).length ? research : null;
  } catch {
    return null;
  }
}
