import { mlbStatsApiService } from './mlbStatsApiService.enhanced.js';
import { oddsService } from './oddsService.js';
import { supabase } from '../supabaseClient.js';
import { getYesterdayDate } from '../utils/dateUtils.js';

export const teamPropService = {
  async generateTeamPropsForToday() {
    const games = await oddsService.getUpcomingGames('baseball_mlb');
    // Filter today's games...
    for (const game of todayGames) {
      const teams = [game.home_team, game.away_team];
      for (const team of teams) {
        for (const propType of ['home_run', 'stolen_base', 'two_hits']) {
          // Check if exists
          // If not, get stats, create prompt, call OpenAI, parse, store
        }
      }
    }
  },
  getHomeRunPrompt(team, opponent, stats) {
    return `You are an expert MLB analyst selecting a player from ${team} likely to hit a home run vs ${opponent}. Do NOT pick the obvious league leader. Consider: recent power surge, matchup vs pitcher (e.g., weak to lefties), park factors, weather, splits. Pick ONE player with rationale and confidence (0-1). JSON: {player, rationale, confidence}`;
  },
  // Similar for stolen_base and two_hits
  async gradeResults() {
    const yesterday = getYesterdayDate();
    const { data: props } = await supabase.from('team_specific_props').select('*').eq('date', yesterday);
    for (const prop of props) {
      // Fetch actual stats
      const outcome = await mlbStatsApiService.checkPropOutcome(prop); // Implement this method
      await supabase.from('team_specific_prop_results').insert({prop_id: prop.id, actual_outcome: outcome, grade_date: new Date().toISOString().split('T')[0]});
    }
  }
}; 