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

/** One listed player on a football injury report (the pick JSON stores a list per side). */
export interface InjuryEntry {
  name?: string | null; status?: string | null; description?: string | null;
}

/**
 * `injuries` is polymorphic in daily_picks: MLB picks carry a sentence (or
 * nothing); NFL/NCAAF picks carry `{ away: InjuryEntry[], home: InjuryEntry[] }`.
 * Render through `injuryLines()`, never as a bare React child.
 */
export interface InjuryReport {
  away?: InjuryEntry[] | null; home?: InjuryEntry[] | null;
}

export interface GaryPick {
  pick?: string; type?: string; odds?: number; confidence?: number;
  homeTeam?: string; awayTeam?: string; league?: string; sport?: string;
  rationale?: string; time?: string; venue?: string; commence_time?: string;
  /** The plain-language read of the same call (written alongside the analysis). */
  rationale_plain?: string;
  gameSignificance?: string; pick_category?: string;
  pick_id?: string; statsData?: StatRow[]; sportsbook_odds?: SportsbookLine[];
  injuries?: string | InjuryReport | null; is_top_pick?: boolean;
  moneylineHome?: number; moneylineAway?: number;
  spread?: number; spreadOdds?: number; total?: number; trapAlert?: boolean;
  tournamentContext?: string;
  soccer_stage?: string | null; soccer_group?: string | null; soccer_round?: string | null;
}

export interface PropPick {
  game_id?: string | number; bdl_game_id?: string | number;
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
  /** BDL numbering, nfl_results only: 1 = preseason, 2 = regular, 3 = postseason. */
  season_type?: number | null;
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
  /** 'MLB' | 'MLB HR' | 'NFL' | 'NCAAF' | null on rows older than the column. */
  sport?: string | null;
}

export interface InsightRow {
  id: number; date: string; league: string | null; category: string | null;
  headline: string | null; detail: string | null; game: string | null;
  value: string | null; tone: string | null; spark: number[] | null;
  line_val: number | null; relevance_score: number | null;
  player_id: string | null; team_id: string | null; game_id: string | null;
  result: string | null; result_note: string | null;
}

export interface LiveScoreRow {
  date: string; league: string | null; game_id: string | null;
  away_abbr: string | null; home_abbr: string | null;
  away_score: number | null; home_score: number | null;
  status: string | null; detail: string | null;
  outs: number | null; bases: string | null;
}
