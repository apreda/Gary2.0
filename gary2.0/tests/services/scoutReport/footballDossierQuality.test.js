import { describe, it, expect } from 'vitest';
import {
  formatOdds,
  calculateRestSituation,
  etGameDateLong,
} from '../../../src/services/agentic/scoutReport/shared/dataFetchers.js';
import { formatStartingQBs } from '../../../src/services/agentic/scoutReport/sports/nfl.js';

// ═══ Aug 20 2026 football dossier quality pass — every pin below reproduces
// a defect seen in a LIVE Rams@Chargers render that night. ═══════════════════

describe('formatOdds never prints NaN', () => {
  it('null moneylines render as Not available (the "Rams NaN | Chargers NaN" leak)', () => {
    const text = formatOdds({
      home_team: 'Los Angeles Chargers', away_team: 'Los Angeles Rams',
      moneyline_home: null, moneyline_away: null, spread_home: null,
    }, 'americanfootball_nfl');
    expect(text).toContain('Moneyline: Not available');
    expect(text).toContain('Spread: Not available');
    expect(text).not.toContain('NaN');
  });

  it('renders each spread with its own price', () => {
    const text = formatOdds({
      home_team: 'Houston Texans', away_team: 'Las Vegas Raiders',
      moneyline_home: -150, moneyline_away: 130,
      spread_home: -3.5, spread_home_odds: -110,
      spread_away: 3.5, spread_away_odds: -118,
    }, 'americanfootball_nfl');
    expect(text).toContain('Moneyline: Las Vegas Raiders +130 | Houston Texans -150');
    expect(text).toContain('Spread: Las Vegas Raiders +3.5 (-118) | Houston Texans -3.5 (-110)');
    expect(text).toContain('spreadHome: -3.5');
    expect(text).toContain('spreadHomeOdds: -110');
    expect(text).toContain('spreadAway: 3.5');
    expect(text).toContain('spreadAwayOdds: -118');
    expect(text).not.toMatch(/^\s*spreadOdds:/m);
  });

  it('supports an away favorite without deriving the wrong side', () => {
    const text = formatOdds({
      home_team: 'Home Team', away_team: 'Away Team',
      spread_home: 2.5, spread_home_odds: 102,
      spread_away: -2.5, spread_away_odds: -122,
    }, 'americanfootball_ncaaf');

    expect(text).toContain('Spread: Away Team -2.5 (-122) | Home Team +2.5 (+102)');
  });

  it('never borrows the home price when the away price is missing', () => {
    const text = formatOdds({
      home_team: 'Houston Texans', away_team: 'Las Vegas Raiders',
      spread_home: -1.5, spread_home_odds: 100,
      spread_away: 1.5, spread_away_odds: null,
    }, 'americanfootball_nfl');

    expect(text).toContain('Las Vegas Raiders +1.5 (price unavailable)');
    expect(text).toContain('Houston Texans -1.5 (+100)');
    expect(text).toContain('spreadAwayOdds: null');
  });

  it('renders an away-only spread from the correct team perspective', () => {
    const text = formatOdds({
      home_team: 'Home Team', away_team: 'Away Team',
      spread_home: null, spread_home_odds: null,
      spread_away: 4, spread_away_odds: -112,
    }, 'americanfootball_ncaaf');

    expect(text).toContain('Spread: Away Team +4.0 (-112) | Home Team -4.0 (price unavailable)');
    expect(text).toContain('spreadHome: -4');
    expect(text).toContain('spreadAway: 4');
  });
});

describe('starting QB block (the "? GP | 0 yds" and "0 career starts" classes)', () => {
  const herbert = {
    name: 'Justin Herbert', experience: '7th Season', jerseyNumber: '10',
    gamesPlayed: 17, passingYards: 4300, passingTds: 31, passingInterceptions: 9,
    passingCompletionPct: 66.2, qbRating: 98.4, statsSeason: 2025,
  };

  it('labels a prior-season line with its own season, omits nothing that exists', () => {
    const text = formatStartingQBs('Los Angeles Chargers', 'Los Angeles Rams', { home: herbert, away: null, season: 2026 });
    expect(text).toContain('[HOME] Los Angeles Chargers: Justin Herbert (7th Season) (#10)');
    expect(text).toContain('2025-26 season: 17 GP | 4300 yds | 31 TD / 9 INT | 66.2% | Rating: 98.4');
    expect(text).toContain('[AWAY] Los Angeles Rams: QB data unavailable');
    expect(text).not.toContain('?');
  });

  it('a vet with no note and no backup flag never creates a QB SITUATION', () => {
    const text = formatStartingQBs('Los Angeles Chargers', 'Los Angeles Rams', { home: herbert, away: null, season: 2026 });
    expect(text).not.toContain('QB SITUATION');
    expect(text).not.toContain('career starts');
  });

  it('omits unknown pct/rating instead of printing question marks', () => {
    const thin = { ...herbert, passingCompletionPct: undefined, qbRating: undefined };
    const text = formatStartingQBs('Los Angeles Chargers', 'Los Angeles Rams', { home: thin, away: null, season: 2026 });
    expect(text).toContain('2025-26 season: 17 GP | 4300 yds | 31 TD / 9 INT');
    expect(text).not.toContain('%');
    expect(text).not.toContain('Rating: ?');
  });

  it('a rookie note rows a season-scoped QB SITUATION, never "career starts"', () => {
    const rookie = {
      name: 'Ty Simpson', experience: '1st Season', jerseyNumber: '13',
      gamesPlayed: 0, passingYards: 0, passingTds: 0, statsSeason: null,
      experienceNote: 'ROOKIE QB — no NFL regular-season games on file',
    };
    const text = formatStartingQBs('Los Angeles Chargers', 'Los Angeles Rams', { home: null, away: rookie, season: 2026 });
    expect(text).toContain('ROOKIE QB — no NFL regular-season games on file');
    expect(text).toContain('QB SITUATION');
    expect(text).toContain('Current QB: Ty Simpson (no NFL stat line on file)');
    expect(text).not.toContain('career starts');
  });
});

describe('rest calculation uses ET calendar days (the "Aug 14 for an Aug 13 game" class)', () => {
  it('an 8 PM ET kickoff stored under the next UTC day counts as its ET date', () => {
    const games = [{
      date: '2026-08-14T00:00:00.000Z', // Aug 13, 8:00 PM ET
      home_team: { full_name: 'Houston Texans' },
      visitor_team: { full_name: 'Los Angeles Chargers' },
      home_team_score: 7, visitor_team_score: 27,
    }];
    const rest = calculateRestSituation(games, '2026-08-28T02:00:00.000Z', 'Los Angeles Chargers');
    expect(rest.lastGameDate).toBe('Aug 13');
    expect(rest.daysRest).toBe(14); // Aug 13 → Aug 27 ET
  });
});

describe('etGameDateLong', () => {
  it('resolves a UTC kickoff to its ET display date', () => {
    expect(etGameDateLong('2026-08-28T02:00:00.000Z')).toBe('August 27, 2026');
    expect(etGameDateLong('2026-08-27T23:00:00.000Z')).toBe('August 27, 2026');
  });
});
