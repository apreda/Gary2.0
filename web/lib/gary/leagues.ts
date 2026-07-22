export interface SportConfig {
  slug: string;        // URL segment
  code: string;        // league code in data
  name: string;        // display
  longName: string;    // SEO
  accent: string;      // hex — dot/badge use ONLY
  retired?: boolean;   // ended tournament: record pages stay, off today's surfaces
}

export const SPORTS: SportConfig[] = [
  { slug: 'mlb', code: 'MLB', name: 'MLB', longName: 'MLB Baseball', accent: '#7BC267' },
  { slug: 'nba', code: 'NBA', name: 'NBA', longName: 'NBA Basketball', accent: '#3B82F6' },
  { slug: 'nhl', code: 'NHL', name: 'NHL', longName: 'NHL Hockey', accent: '#00A3E0' },
  { slug: 'nfl', code: 'NFL', name: 'NFL', longName: 'NFL Football', accent: '#22C55E' },
  { slug: 'ncaab', code: 'NCAAB', name: 'NCAAB', longName: 'College Basketball', accent: '#F97316' },
  { slug: 'ncaaf', code: 'NCAAF', name: 'NCAAF', longName: 'College Football', accent: '#DC2626' },
  // Tournament ended Jul 19 2026 — the graded record remains the trophy case.
  { slug: 'world-cup', code: 'WC', name: 'World Cup', longName: '2026 FIFA World Cup', accent: '#14B8A6', retired: true },
];

export const sportBySlug = (slug: string) => SPORTS.find(s => s.slug === slug);
export const sportByCode = (code: string) => SPORTS.find(s => s.code === code.toUpperCase());

/** Historical league labels seen in results that are not routable sports. */
export const LEAGUE_DISPLAY: Record<string, string> = {
  WBC: 'World Baseball Classic',
  EPL: 'Premier League',
  WNBA: 'WNBA',
};

/**
 * Port of iOS PropPick.effectiveLeague (Models.swift:1098).
 * league field wins; sport is the fallback; substring matching tolerates
 * API keys like "basketball_nba".
 *
 * Order matters:
 * - WNBA checked before NBA (NBA must not swallow WNBA)
 * - exact 'mlb hr' checked BEFORE the mlb substring check
 */
export function normalizeLeague(league?: string | null, sport?: string | null): string | null {
  const raw = (league && league.length > 0 ? league : sport) ?? '';
  if (!raw) return null;
  const n = raw.toLowerCase();
  // WNBA first — must not be swallowed by the nba check
  if (n.includes('wnba')) return 'WNBA';
  if (n.includes('nba')) return 'NBA';
  if (n.includes('nfl')) return 'NFL';
  if (n.includes('nhl')) return 'NHL';
  if (n.includes('ncaab') || n.includes('ncaam')) return 'NCAAB';
  if (n.includes('ncaaf')) return 'NCAAF';
  if (n.includes('world_cup') || n.includes('worldcup') || n === 'wc' || n.includes('soccer_world_cup')) return 'WC';
  if (n.includes('epl') || n.includes('soccer_epl') || n.includes('premier')) return 'EPL';
  // exact 'mlb hr' BEFORE the mlb substring check — order matters
  if (n === 'mlb hr') return 'MLB HR';
  if (n.includes('mlb') || n.includes('wbc')) return 'MLB';
  return raw.toUpperCase();
}
