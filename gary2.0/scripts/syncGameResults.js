// Production script: Syncs real game results from TheSportsDB API to Supabase game_results for Gary's picks
// Usage: node scripts/syncGameResults.js

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dayjs from 'dayjs';
import dotenv from 'dotenv';
dotenv.config();

// --- CONFIG ---
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const THESPORTSDB_API_KEY = '3'; // Free tier, as in your config

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- HELPERS ---
const getYesterday = () => dayjs().subtract(1, 'day').format('YYYY-MM-DD');

async function fetchYesterdaysPicks() {
  const { data, error } = await supabase
    .from('daily_picks')
    .select('*')
    .eq('date', getYesterday());
  if (error) throw error;
  // picks is a JSON array in the 'picks' field
  if (!data || !data.length) return [];
  const picksArr = Array.isArray(data[0].picks) ? data[0].picks : JSON.parse(data[0].picks);
  return picksArr.map(p => ({ ...p, date: data[0].date }));
}

async function fetchSportsDBEvents(league, date) {
  // Map league to TheSportsDB API sport/league id
  const leagueMap = {
    NBA: '4387', // NBA Basketball
    MLB: '4424', // MLB Baseball
    NHL: '4380', // NHL Hockey
    NFL: '4391', // NFL Football
  };
  const leagueId = leagueMap[league];
  if (!leagueId) throw new Error(`Unknown league: ${league}`);
  const url = `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_API_KEY}/eventsday.php?d=${date}&l=${leagueId}`;
  const { data } = await axios.get(url);
  return data.events || [];
}

function normalizeTeamName(name) {
  return name.replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchEvent(pick, events) {
  const homeNorm = normalizeTeamName(pick.home_team);
  const awayNorm = normalizeTeamName(pick.away_team);
  return events.find(e =>
    normalizeTeamName(e.strHomeTeam) === homeNorm &&
    normalizeTeamName(e.strAwayTeam) === awayNorm
  );
}

function determineResult(pick, event) {
  if (!event || !event.intHomeScore || !event.intAwayScore) return { result: 'pending', final_score: null };
  const homeScore = parseInt(event.intHomeScore, 10);
  const awayScore = parseInt(event.intAwayScore, 10);
  // Moneyline: did Gary's pick win?
  let garyTeam = pick.shortPick;
  if (pick.betType && pick.betType.toLowerCase().includes('moneyline')) {
    garyTeam = pick.shortPick.replace(/ ML.*/, '').trim();
  }
  let result = 'pending';
  if (normalizeTeamName(garyTeam) === normalizeTeamName(pick.home_team)) {
    result = homeScore > awayScore ? 'gary_win' : 'gary_loss';
  } else if (normalizeTeamName(garyTeam) === normalizeTeamName(pick.away_team)) {
    result = awayScore > homeScore ? 'gary_win' : 'gary_loss';
  }
  return {
    result,
    final_score: `${event.intAwayScore}-${event.intHomeScore}`
  };
}

async function upsertGameResult(pick, resultData) {
  const { error } = await supabase
    .from('game_results')
    .upsert([{
      pick_id: pick.id,
      game_date: pick.date,
      league: pick.league,
      result: resultData.result,
      final_score: resultData.final_score,
      updated_at: new Date().toISOString()
    }], { onConflict: ['pick_id'] });
  if (error) throw error;
}

async function main() {
  const picks = await fetchYesterdaysPicks();
  if (!picks.length) {
    console.log('No picks found for yesterday.');
    return;
  }
  // Group picks by league
  const leagues = [...new Set(picks.map(p => p.league))];
  for (const league of leagues) {
    const leaguePicks = picks.filter(p => p.league === league);
    const events = await fetchSportsDBEvents(league, getYesterday());
    for (const pick of leaguePicks) {
      const event = matchEvent(pick, events);
      const resultData = determineResult(pick, event);
      await upsertGameResult(pick, resultData);
      console.log(`Updated result for pick ${pick.id}: ${resultData.result} (${resultData.final_score})`);
    }
  }
}

main().catch(console.error);
