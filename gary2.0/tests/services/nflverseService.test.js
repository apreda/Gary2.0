import { afterEach, describe, expect, it } from 'vitest';
import {
  parseCsv, nflverseCode, getPracticeReport, getSnapShare,
  NFLVERSE_TEAM_CODES, _clearNflverseCache, loadNflverseFile
} from '../../src/services/providers/nflverseService.js';
import { mkdtempSync, writeFileSync, utimesSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The NFL's closest thing to MLB's confirmed-lineup gate.
 *
 * BDL reports a status and nothing else, and "Questionable" alone is close to
 * noise: across 2025, 321 Questionable players had practiced FULLY, 758 were
 * limited, and 171 did not practice at all. Three different reads, rendered
 * identically. The practice report separates them.
 */

const INJ_HEADER = 'season,season_type,game_type,team,week,gsis_id,position,full_name,first_name,last_name,report_primary_injury,report_secondary_injury,report_status,practice_primary_injury,practice_secondary_injury,practice_status';
const injRow = (team, week, name, pos, report, practice, injury) =>
  `2025,REG,REG,${team},${week},00-000,${pos},${name},A,B,${injury},,${report},${injury},,${practice}`;

function fakeFetch(bodyByAsset) {
  return async (url) => {
    const asset = url.includes('snap_counts') ? 'snap_counts' : 'injuries';
    const body = bodyByAsset[asset];
    if (body === 404) return { status: 404, ok: false };
    return { status: 200, ok: true, text: async () => body };
  };
}

afterEach(() => _clearNflverseCache());

describe('CSV parsing', () => {
  it('handles quoted fields containing commas', () => {
    const rows = parseCsv('a,b\n"one, two",three\n');
    expect(rows).toEqual([{ a: 'one, two', b: 'three' }]);
  });

  it('handles escaped quotes', () => {
    const rows = parseCsv('a\n"say ""hi"""\n');
    expect(rows[0].a).toBe('say "hi"');
  });

  it('drops malformed short rows rather than shifting every column', () => {
    const rows = parseCsv('a,b,c\n1,2,3\n4,5\n');
    expect(rows).toHaveLength(1);
  });
});

describe('team codes', () => {
  it('covers all 32', () => {
    expect(Object.keys(NFLVERSE_TEAM_CODES)).toHaveLength(32);
  });

  it('resolves full names and nicknames but refuses ambiguity', () => {
    expect(nflverseCode('Detroit Lions')).toBe('DET');
    expect(nflverseCode('Packers')).toBe('GB');
    expect(nflverseCode('New York')).toBeNull();
    expect(nflverseCode('Nope')).toBeNull();
  });
});

describe('practice report — the read BDL cannot give', () => {
  const body = [
    INJ_HEADER,
    injRow('DET', 12, 'Taylor Decker', 'T', 'Questionable', 'Did Not Participate In Practice', 'Shoulder'),
    injRow('DET', 12, 'Khalil Dorsey', 'CB', 'Questionable', 'Full Participation in Practice', 'Wrist'),
    injRow('DET', 11, 'Old Row', 'WR', 'Out', 'Did Not Participate In Practice', 'Knee')
  ].join('\n');

  it('separates two identically-listed Questionable players', async () => {
    const r = await getPracticeReport('Detroit Lions', 2025, 12, { fetchImpl: fakeFetch({ injuries: body }) });
    expect(r.players).toHaveLength(2);
    expect(r.players.find((p) => p.name === 'Taylor Decker').practice).toBe('DNP');
    expect(r.players.find((p) => p.name === 'Khalil Dorsey').practice).toBe('Full');
    // Both are "Questionable" to BDL.
    expect(new Set(r.players.map((p) => p.game_status))).toEqual(new Set(['Questionable']));
  });

  it('defaults to the most recently filed week', async () => {
    const r = await getPracticeReport('Detroit Lions', 2025, null, { fetchImpl: fakeFetch({ injuries: body }) });
    expect(r.week).toBe(12);
  });

  it('honours an explicit week', async () => {
    const r = await getPracticeReport('Detroit Lions', 2025, 11, { fetchImpl: fakeFetch({ injuries: body }) });
    expect(r.week).toBe(11);
    expect(r.players[0].name).toBe('Old Row');
  });

  it('STATES that a season is unpublished — never returns an empty roster', async () => {
    const r = await getPracticeReport('Detroit Lions', 2026, 1, { fetchImpl: fakeFetch({ injuries: 404 }) });
    expect(r.unavailable).toBe(true);
    expect(r.reason).toMatch(/has not published .*2026/);
    expect(r.players).toBeUndefined();
  });

  it('a failed fetch is not an empty result', async () => {
    const boom = async () => { throw new Error('network down'); };
    const r = await getPracticeReport('Detroit Lions', 2025, 12, { fetchImpl: boom });
    expect(r.unavailable).toBe(true);
    expect(r.reason).toMatch(/Could not reach nflverse/);
  });
});

describe('snap share — usage, not depth chart', () => {
  const SNAP_HEADER = 'game_id,season,game_type,week,player,position,team,opponent,offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct';
  const body = [
    SNAP_HEADER,
    '2025_18_DET_CHI,2025,REG,18,Jared Goff,QB,DET,CHI,70,1,0,0,0,0',
    '2025_18_DET_CHI,2025,REG,18,Backup Guy,WR,DET,CHI,10,0.14,0,0,5,0.2',
    '2025_17_DET_MIN,2025,REG,17,Jared Goff,QB,DET,MIN,65,1,0,0,0,0'
  ].join('\n');

  it('reports the latest week and filters out low-usage noise', async () => {
    const r = await getSnapShare('Detroit Lions', 2025, { fetchImpl: fakeFetch({ snap_counts: body }) });
    expect(r.week).toBe(18);
    expect(r.opponent).toBe('CHI');
    expect(r.offense.join(' ')).toContain('Jared Goff QB 100%');
    // 14% is below the 25% floor — it is not a usage signal.
    expect(r.offense.join(' ')).not.toContain('Backup Guy');
  });

  it('states unavailability for an unpublished season', async () => {
    const r = await getSnapShare('Detroit Lions', 2026, { fetchImpl: fakeFetch({ snap_counts: 404 }) });
    expect(r.unavailable).toBe(true);
    expect(r.offense).toBeUndefined();
  });
});

// Nov 8 2026: every download timed out at 5:30 AM and the copies on disk were from Thursday night.
describe('a failed download and the copy on disk', () => {
  const TEAM_HEADER = 'season,week,team,season_type,game_id,opponent_team,passing_yards';
  const SCHEDULE = [
    { game_id: '2026_09_CIN_ATL', season: '2026', home_team: 'ATL', away_team: 'CIN', home_score: '20', away_score: '17', gameday: '2026-11-08', gametime: '09:30' },
    { game_id: '2026_09_TB_CHI', season: '2026', home_team: 'CHI', away_team: 'TB', home_score: '16', away_score: '0', gameday: '2026-11-08', gametime: '13:00' },
    { game_id: '2026_10_NE_DET', season: '2026', home_team: 'DET', away_team: 'NE', home_score: '', away_score: '', gameday: '2026-11-15', gametime: '09:30' }
  ];
  const teamRow = (game, team, opp) => `2026,9,${team},REG,${game},${opp},200`;
  const complete = [TEAM_HEADER, teamRow('2026_09_CIN_ATL', 'ATL', 'CIN'), teamRow('2026_09_CIN_ATL', 'CIN', 'ATL'),
    teamRow('2026_09_TB_CHI', 'CHI', 'TB'), teamRow('2026_09_TB_CHI', 'TB', 'CHI')].join('\n');
  const timeout = async () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; };
  const notFound = async () => ({ status: 404, ok: false });
  const copyOnDisk = (asset, body, hoursOld) => {
    const dir = mkdtempSync(join(tmpdir(), 'nflverse-copy-'));
    const file = join(dir, `${asset}_2026.csv`);
    writeFileSync(file, body);
    const t = (Date.now() - hoursOld * 3600_000) / 1000; utimesSync(file, t, t);
    return dir;
  };
  const opts = (diskDir, fetchImpl) => ({ fetchImpl, disk: true, diskDir, scheduleRows: SCHEDULE });

  it('a timeout with a complete copy 54 hours old returns the copy', async () => {
    const r = await loadNflverseFile('stats_team_week', 2026, opts(copyOnDisk('stats_team_week', complete, 54), timeout));
    expect(r.unavailable).toBeUndefined();
    expect(r.fromDisk).toBe(true);
    expect(r.ageHours).toBe(54);
    expect(r.rows).toHaveLength(4);
  });

  it('a timeout with a copy that lacks a finished game is a failed load', async () => {
    const lacking = complete.split('\n').filter((l) => !l.includes('2026_09_TB_CHI,TB')).join('\n');
    const r = await loadNflverseFile('stats_team_week', 2026, opts(copyOnDisk('stats_team_week', lacking, 54), timeout));
    expect(r.unavailable).toBe(true);
    expect(r.reason).toMatch(/^Could not reach nflverse for stats_team_week_2026\.csv/);
  });

  it('PFR charting stands in at any age; the injury file only under 12 hours', async () => {
    const pfr = await loadNflverseFile('advstats_week_def', 2026, opts(copyOnDisk('advstats_week_def', 'game_id,team\n2026_09_CIN_ATL,ATL', 54), timeout));
    expect(pfr.fromDisk).toBe(true);
    const old = await loadNflverseFile('injuries', 2026, opts(copyOnDisk('injuries', 'season,team,week\n2026,ATL,9', 13), timeout));
    expect(old.reason).toMatch(/^Could not reach nflverse/);
    _clearNflverseCache();
    const recent = await loadNflverseFile('injuries', 2026, opts(copyOnDisk('injuries', 'season,team,week\n2026,ATL,9', 11), timeout));
    expect(recent.fromDisk).toBe(true);
  });

  it('a 404 for a file with a copy on disk is a failed download, not "not published", and is not kept', async () => {
    const dir = copyOnDisk('injuries', 'season,team,week\n2026,ATL,9', 30);
    const r = await loadNflverseFile('injuries', 2026, opts(dir, notFound));
    expect(r.unavailable).toBe(true);
    expect(r.reason).toBe('Could not reach nflverse for injuries_2026.csv: HTTP 404');
    let asked = 0;
    const good = async () => { asked += 1; return { status: 200, ok: true, text: async () => 'season,team,week\n2026,ATL,10' }; };
    const next = await loadNflverseFile('injuries', 2026, opts(dir, good));
    expect(asked).toBe(1);
    expect(next.rows[0].week).toBe('10');
    // A complete per-game copy stands in for the 404.
    const team = await loadNflverseFile('stats_team_week', 2026, opts(copyOnDisk('stats_team_week', complete, 30), notFound));
    expect(team.fromDisk).toBe(true);
  });

  it('a 404 with no copy on disk still reads "has not published"', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nflverse-empty-'));
    const r = await loadNflverseFile('stats_team_week', 2026, opts(dir, notFound));
    expect(r.reason).toMatch(/has not published stats_team_week_2026\.csv/);
  });

  it('a good download is used, saved and kept as before; the copy on disk is not read', async () => {
    const dir = copyOnDisk('stats_team_week', TEAM_HEADER, 54);
    let asked = 0;
    const good = async () => { asked += 1; return { status: 200, ok: true, text: async () => complete, headers: { get: () => 'Tue, 10 Nov 2026 17:04:20 GMT' } }; };
    const r = await loadNflverseFile('stats_team_week', 2026, opts(dir, good));
    expect(r.fromDisk).toBeUndefined();
    expect(r.rows).toHaveLength(4);
    expect(r.modified).toBe('Tue, 10 Nov 2026 17:04:20 GMT');
    expect(existsSync(join(dir, 'stats_team_week_2026.csv.modified'))).toBe(true);
    await loadNflverseFile('stats_team_week', 2026, opts(dir, good));
    expect(asked).toBe(1);
  });
});
