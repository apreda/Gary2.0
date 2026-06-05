export interface SportsbookLine {
  book?: string;
  ml?: number; ml_home?: number; ml_away?: number;
  spread?: number | string; spread_home?: string; spread_away?: string; spread_odds?: number;
  total?: number | string; total_over_odds?: number; total_under_odds?: number;
}

export interface StatRow {
  name?: string; token?: string;
  home?: Record<string, string | number | null>;
  away?: Record<string, string | number | null>;
}

export interface GaryPick {
  pick?: string; type?: string; odds?: number; confidence?: number;
  homeTeam?: string; awayTeam?: string; league?: string; sport?: string;
  rationale?: string; time?: string; venue?: string; commence_time?: string;
  pick_id?: string; statsData?: StatRow[]; sportsbook_odds?: SportsbookLine[];
  injuries?: string; is_top_pick?: boolean;
  moneylineHome?: number; moneylineAway?: number;
  spread?: number; spreadOdds?: number; total?: number; trapAlert?: boolean;
  tournamentContext?: string;
  soccer_stage?: string | null; soccer_group?: string | null; soccer_round?: string | null;
}

export interface PropPick {
  player?: string; team?: string; prop?: string; bet?: string;
  line?: string | number; odds?: number; confidence?: number;
  sport?: string; league?: string; matchup?: string;
  key_stats?: string[]; rationale?: string; analysis?: string;
  commence_time?: string; td_category?: string; position?: string;
}

export interface DailyPicksRow { id: string; date: string; picks: unknown }
export interface PropPicksRow { id: string; date: string; picks: unknown }
export interface WeeklyNflPicksRow {
  id: string; week_start: string; week_number: number; season: number; picks: unknown;
}

export interface GameResultRow {
  game_date: string | null; league: string | null; matchup: string | null;
  pick_text: string | null; result: string | null; final_score: string | null;
  confidence: number | null;
}

export interface NflResultRow extends GameResultRow {
  week_number: number | null; season: number | null;
  home_team: string | null; away_team: string | null;
  home_score: number | null; away_score: number | null;
}

export interface PropResultRow {
  game_date: string | null; player_name: string | null; prop_type: string | null;
  line_value: number | string | null; actual_value: number | string | null;
  result: string | null; odds: string | null; pick_text: string | null;
  matchup: string | null; bet: string | null;
}

export interface InsightRow {
  id: number; date: string; league: string | null; category: string | null;
  headline: string | null; detail: string | null; game: string | null;
  value: string | null; tone: string | null; spark: number[] | null;
  line_val: number | null; relevance_score: number | null;
  player_id: string | null; team_id: string | null; game_id: string | null;
  result: string | null; result_note: string | null;
}

export interface PlayerCardRow {
  date: string; league: string | null; player_id: string | null;
  player_name: string | null; team_abbr: string | null; game_id: string | null;
  payload: Record<string, unknown> | null;
}

export interface LiveScoreRow {
  date: string; league: string | null; game_id: string | null;
  away_abbr: string | null; home_abbr: string | null;
  away_score: number | null; home_score: number | null;
  status: string | null; detail: string | null;
  outs: number | null; bases: string | null;
}
