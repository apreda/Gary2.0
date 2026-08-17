import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  findStandingsRow,
  matchupIncludesBothTeams,
  pickSideByName,
} from '../../src/services/teamIdentity.js';

const mlbDeskSrc = readFileSync(new URL('../../src/services/pickdesk/mlbDesk.js', import.meta.url), 'utf8');
const scoutMlbSrc = readFileSync(new URL('../../src/services/agentic/scoutReport/sports/mlb.js', import.meta.url), 'utf8');
const garyBrainSrc = readFileSync(new URL('../../src/services/pickdesk/garyBrain.js', import.meta.url), 'utf8');
const gameRecapSrc = readFileSync(new URL('../../src/services/gameRecap.js', import.meta.url), 'utf8');

// Leakage-audit findings 1-4 (founder GO, Aug 17): every team match below used
// the LAST WORD of the team name, and MLB has one collision — Sox. Whole-name
// exact matching (or longest-suffix comparison) kills the class.

const standings = [
  { team: { id: 5, display_name: 'Boston Red Sox', name: 'Red Sox', location: 'Boston', abbreviation: 'BOS' }, wins: 60, losses: 55 },
  { team: { id: 6, display_name: 'Chicago White Sox', name: 'White Sox', location: 'Chicago', abbreviation: 'CHW' }, wins: 45, losses: 70 },
  { team: { id: 7, display_name: 'St. Louis Cardinals', name: 'Cardinals', location: 'St. Louis', abbreviation: 'STL' }, wins: 63, losses: 52 },
];

describe('findStandingsRow', () => {
  it('resolves the RIGHT Sox by nickname and by full name, regardless of array order', () => {
    expect(findStandingsRow(standings, 'White Sox')?.team.id).toBe(6);
    expect(findStandingsRow(standings, 'Red Sox')?.team.id).toBe(5);
    expect(findStandingsRow(standings, 'Chicago White Sox')?.team.id).toBe(6);
    expect(findStandingsRow(standings, 'Boston Red Sox')?.team.id).toBe(5);
  });

  it('matches abbreviations exactly and folds punctuation', () => {
    expect(findStandingsRow(standings, 'CHW')?.team.id).toBe(6);
    expect(findStandingsRow(standings, 'St Louis Cardinals')?.team.id).toBe(7);
  });

  it('resolves a nickname against display_name-only rows via UNIQUE word-suffix', () => {
    const displayOnly = [
      { team: { display_name: 'Boston Red Sox' }, wins: 60, losses: 55 },
      { team: { display_name: 'Chicago White Sox' }, wins: 45, losses: 70 },
      { team: { display_name: 'Minnesota Twins' }, wins: 57, losses: 60 },
    ];
    expect(findStandingsRow(displayOnly, 'White Sox')?.team.display_name).toBe('Chicago White Sox');
    expect(findStandingsRow(displayOnly, 'Twins')?.team.display_name).toBe('Minnesota Twins');
    // "Sox" suffixes BOTH Sox rows — ambiguous, never guess.
    expect(findStandingsRow(displayOnly, 'Sox')).toBe(null);
  });

  it('returns null instead of guessing when nothing matches exactly', () => {
    expect(findStandingsRow(standings, 'Sox')).toBe(null);
    expect(findStandingsRow(standings, 'Springfield Isotopes')).toBe(null);
    expect(findStandingsRow(null, 'Red Sox')).toBe(null);
    expect(findStandingsRow(standings, '')).toBe(null);
  });
});

describe('pickSideByName', () => {
  it('reads the correct side in a Sox-vs-Sox matchup (the finding-3 case)', () => {
    expect(pickSideByName('White Sox ML -144', 'Boston Red Sox', 'Chicago White Sox')).toBe('away');
    expect(pickSideByName('Red Sox ML +120', 'Boston Red Sox', 'Chicago White Sox')).toBe('home');
  });

  it('still works for ordinary matchups and run lines', () => {
    expect(pickSideByName('Cardinals ML +142', 'Cincinnati Reds', 'St. Louis Cardinals')).toBe('away');
    expect(pickSideByName('Reds -1.5 +150', 'Cincinnati Reds', 'St. Louis Cardinals')).toBe('home');
  });

  it('returns null when the text names neither team', () => {
    expect(pickSideByName('Over 9.5 -110', 'Cincinnati Reds', 'St. Louis Cardinals')).toBe(null);
  });
});

describe('matchupIncludesBothTeams', () => {
  it('keeps rows for the exact Sox-vs-Sox game and rejects the other Sox game that day', () => {
    expect(matchupIncludesBothTeams('White Sox @ Red Sox', 'Red Sox', 'White Sox')).toBe(true);
    // Finding-4 case: another same-day game with one Sox team must not match.
    expect(matchupIncludesBothTeams('White Sox @ Cubs', 'Red Sox', 'White Sox')).toBe(false);
    expect(matchupIncludesBothTeams('Yankees @ Red Sox', 'Red Sox', 'White Sox')).toBe(false);
  });

  it('accepts ordinary matchups by nickname in either order', () => {
    expect(matchupIncludesBothTeams('Cardinals @ Reds', 'Reds', 'Cardinals')).toBe(true);
    expect(matchupIncludesBothTeams('Reds vs Cardinals', 'Reds', 'Cardinals')).toBe(true);
    expect(matchupIncludesBothTeams('Cardinals @ Cubs', 'Reds', 'Cardinals')).toBe(false);
  });
});

describe('call-site wiring', () => {
  it('routes the desk stakes line through findStandingsRow (finding 1)', () => {
    expect(mlbDeskSrc).toContain('findStandingsRow(');
    expect(mlbDeskSrc).not.toContain('dn.includes(lw)');
  });

  it('routes situational-flag games-played through findStandingsRow (finding 2)', () => {
    expect(scoutMlbSrc).toContain('findStandingsRow(');
    expect(scoutMlbSrc).not.toContain(".toLowerCase().includes(lw)");
  });

  it('routes pick-side detection through pickSideByName (finding 3)', () => {
    expect(garyBrainSrc).toContain('pickSideByName(');
    expect(garyBrainSrc).not.toContain("split(' ').pop()");
  });

  it('routes the recap prop-row filter through matchupIncludesBothTeams (finding 4)', () => {
    expect(gameRecapSrc).toContain('matchupIncludesBothTeams(');
  });
});
