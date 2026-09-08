import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatNflRosterDepth, fetchStartingQBs } from '../../../src/services/agentic/scoutReport/sports/nfl.js';
import { formatRecentForm, formatInjuryReport } from '../../../src/services/agentic/scoutReport/shared/dataFetchers.js';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { summarizeStatForContext } from '../../../src/services/agentic/orchestrator/orchestratorHelpers.js';

afterEach(() => vi.restoreAllMocks());
const roster = status => [{ depth: 1, position: 'QB', injury_status: status, player: { id: 10, first_name: 'Home', last_name: 'Starter', position_abbreviation: 'QB' } },
  { depth: 2, position: 'QB', injury_status: null, player: { id: 11, first_name: 'Home', last_name: 'Backup', position_abbreviation: 'QB' } }];

describe('NFL opening-night injury and recent-form evidence', () => {
  it.each(['Questionable', 'Q', 'Doubtful', 'D'])('keeps %s availability distinct from the age of each initial NFL injury report', status => {
    for (const timing of [
      { freshness: 'FRESH', daysSinceReport: 0, reportDateStr: 'Sep 7' },
      { freshness: 'STALE', daysSinceReport: 12, reportDateStr: 'Aug 27' },
      { freshness: 'UNKNOWN', daysSinceReport: null, reportDateStr: null },
    ]) {
      const text = formatInjuryReport('Home', 'Away', { home: [{ name: 'Listed Player', status,
        comment: 'Original complete practice report.', ...timing }], away: [] }, 'americanfootball_nfl');
      expect(text).toContain(`(${status})`);
      expect(text).toContain(status === 'Q' || status === 'Questionable' ? '[QUESTIONABLE' : '[DOUBTFUL');
      expect(text).toContain(timing.freshness);
      expect(text).toContain('Original complete practice report.');
      expect(text).not.toContain('[OUT');
      if (timing.reportDateStr) expect(text).toContain(`Reported ${timing.reportDateStr}`);
      else expect(text).toContain('report date unavailable');
    }
  });

  it('keeps actual OUT status and supplied NFL freshness without converting reserve status into season-long absence', () => {
    const text = formatInjuryReport('Home', 'Away', { home: [
      { name: 'Out Player', status: 'Out', freshness: 'FRESH', daysSinceReport: 1, reportDateStr: 'Sep 7' },
      { name: 'Reserve Player', status: 'IR-R', freshness: 'STALE', daysSinceReport: 20, reportDateStr: 'Aug 19' },
      { name: 'Unknown Player', status: null, freshness: 'UNKNOWN', daysSinceReport: null },
    ], away: [] }, 'NFL');
    expect(text).toContain('[OUT; FRESH — Reported Sep 7 (1d)]');
    expect(text).toContain('[IR-R; STALE — Reported Aug 19 (20d)]');
    expect(text).toContain('[UNKNOWN; UNKNOWN — report date unavailable]');
    expect(text).not.toContain('[SEASON-LONG]');
    expect(text).not.toContain('ESTABLISHED ABSENCES');
    expect(text.match(/Out Player/g)).toHaveLength(1);
  });

  it('retains the established non-NFL injury duration rendering', () => {
    const text = formatInjuryReport('Home', 'Away', { home: [{ name: 'Existing Player', status: 'Out',
      duration: 'FRESH', daysSinceReport: 1, reportDateStr: 'Sep 7' }], away: [] }, 'basketball_nba');
    expect(text).toContain('[FRESH — Since Sep 7 (1d)]');
  });

  it.each(['INJURIES', 'NFL_INJURIES'])('preserves grouped %s statuses, practice evidence and source limitations in supplemental context', token => {
    const report = { category: 'Injury Report', data_scope: 'Current report; game inactives not available.',
      home: { team: 'Home', total_listed: 3, out: ['Ruled Out (QB)'], doubtful: ['Uncertain (WR)'], questionable: [],
        injuries: [{ player: 'Reserve Player', status: 'PUP-R', comment: 'Reserve list' }],
        practice_report: { week: 1, report: ['Uncertain — Doubtful, practiced limited'] } },
      away: { team: 'Away', total_listed: 0, out: [], doubtful: [], questionable: [],
        practice_report: { note: 'Practice report lookup failed.' } } };
    const rendered = summarizeStatForContext(report, token, 'Home', 'Away', 'americanfootball_nfl');
    expect(rendered).not.toContain('No injuries reported');
    expect(JSON.parse(rendered.slice(rendered.indexOf(':') + 1))).toEqual(report);
  });

  it('does not describe a missing supplemental NFL injury response as a healthy roster', () => {
    const rendered = summarizeStatForContext({ home: { note: 'Provider unavailable' }, away: {} }, 'INJURIES', 'Home', 'Away', 'NFL');
    expect(rendered).toContain('Provider unavailable');
    expect(rendered).not.toContain('No injuries reported');
  });

  it('preserves the existing non-football injury formatter', () => {
    const rendered = summarizeStatForContext({ home: { injuries: [{ player: 'Starter', status: 'Questionable', comment: 'Ankle' }] },
      away: { injuries: [] } }, 'INJURIES', 'Home', 'Away', 'basketball_nba');
    expect(rendered).toContain('Starter [Questionable] (Ankle)');
    expect(rendered).toContain('Away No injuries reported');
  });

  it.each(['Questionable', 'Q', 'Doubtful', 'D'])('does not turn %s into a ruled-out roster label', status => {
    const output = formatNflRosterDepth('Home', 'Away', { home: [{ name: 'Home Starter', position: 'QB', depth: 1 }] },
      { home: [{ name: 'Home Starter', status }], away: [] });
    expect(output).not.toContain('[OUT]');
    expect(output).toContain(status.toUpperCase());
  });
  it('keeps missing statuses unknown and does not move an opponent injury onto the same-name home player', () => {
    const player = { name: 'Same Name', position: 'WR', depth: 1 };
    const output = formatNflRosterDepth('Home', 'Away', { home: [player], away: [player] },
      { home: [{ name: 'Same Name' }], away: [{ name: 'Same Name', status: 'Out' }] });
    expect(output).toContain('[UNKNOWN] WR: Same Name - UNKNOWN');
    expect(output).toContain('[OUT] WR: Same Name - OUT');
    expect(output.match(/\[OUT\]/g)).toHaveLength(1);
  });

  it('keeps preseason and prior regular-season form separate and dates every result', () => {
    const game = (id, date, season, season_type, homeScore, awayScore) => ({ id, date, season, season_type, status: 'Final',
      home_team: { name: 'Seattle Seahawks' }, visitor_team: { name: 'New England Patriots' }, home_team_score: homeScore, visitor_team_score: awayScore });
    const output = formatRecentForm('Seattle Seahawks', [
      game(1, '2026-08-29T02:00:00Z', 2026, 1, 17, 20),
      game(2, '2026-08-22T02:00:00Z', 2026, 1, 24, 14),
      game(3, '2026-01-04T21:00:00Z', 2025, 2, 21, 10),
    ], 5, { sport: 'NFL' });
    expect(output).toContain('2026 preseason');
    expect(output).toContain('2025 regular season');
    expect(output).toContain('1-1 last 2');
    expect(output).toContain('1-0 last 1');
    expect(output).not.toContain('2-1 last 3');
    expect(output).toContain('2026-08-28');
    expect(output).toContain('2025');
    expect(output).toContain('2026-01-04');
  });
  it.each([0, 17])('retains a final NFL %i-point tie as a tie rather than a loss', score => {
    const game = { date: '2026-08-28', season: 2026, season_type: 1, status: 'Final', home_team: { name: 'Home' },
      visitor_team: { name: 'Away' }, home_team_score: score, visitor_team_score: score };
    const output = formatRecentForm('Home', [game], 5, { sport: 'NFL' });
    expect(output).toContain('0-0-1 last 1');
    expect(output).toContain(`T vs Away (${score}-${score}) [2026-08-28]`);
    expect(output).not.toContain('L vs Away');
  });

  it.each(['D', 'Doubtful'])('keeps a %s QB explicitly uncertain instead of declaring the backup starts', async status => {
    vi.spyOn(ballDontLieService, 'getNflTeamRoster').mockResolvedValue(roster(status));
    const qb = await ballDontLieService.getStartingQBFromDepthChart(1, 2026);
    expect(qb).toMatchObject({ id: 10, injuryStatus: status, isBackup: false });
  });

  it.each(['PUP-R', 'IR-R', 'NFI-R', 'NFI', 'Reserve/PUP', 'Reserve/Injured'])('does not select a QB on the %s reserve list as available', async status => {
    vi.spyOn(ballDontLieService, 'getNflTeamRoster').mockResolvedValue(roster(status));
    const qb = await ballDontLieService.getStartingQBFromDepthChart(1, 2026);
    expect(qb).toMatchObject({ id: 11, isBackup: true });
  });

  it('leaves the starting QB unresolved when every listed QB is ruled out', async () => {
    const entries = roster('Out'); entries[1].injury_status = 'IR';
    vi.spyOn(ballDontLieService, 'getNflTeamRoster').mockResolvedValue(entries);
    expect(await ballDontLieService.getStartingQBFromDepthChart(1, 2026)).toBeNull();
  });
  it('uses a fresh exact-player official status while retaining the original cached depth chart', async () => {
    const entries = roster(null);
    vi.spyOn(ballDontLieService, 'getNflTeamRoster').mockResolvedValue(entries);
    const officialInjuries = [{ player: { id: 10, first_name: 'Home', last_name: 'Starter' }, status: 'Out',
      freshness: 'FRESH', daysSinceReport: 1, reportDate: '2026-09-08' }];
    expect(await ballDontLieService.getStartingQBFromDepthChart(1, 2026, 'americanfootball_nfl', { officialInjuries }))
      .toMatchObject({ id: 11, isBackup: true });
    expect(entries[0].injury_status).toBeNull();
  });
  it.each(['stale', 'future', 'different_id'])('does not let a %s official report replace the listed starter', async kind => {
    vi.spyOn(ballDontLieService, 'getNflTeamRoster').mockResolvedValue(roster(null));
    const injury = { player: { id: 10, first_name: 'Home', last_name: 'Starter' }, status: 'Out', freshness: 'FRESH', daysSinceReport: 1 };
    if (kind === 'stale') { injury.freshness = 'STALE'; injury.daysSinceReport = 14; }
    if (kind === 'future') injury.daysSinceReport = -1;
    if (kind === 'different_id') injury.player.id = 99;
    expect(await ballDontLieService.getStartingQBFromDepthChart(1, 2026, 'americanfootball_nfl', { officialInjuries: [injury] }))
      .toMatchObject({ id: 10, isBackup: false });
  });
  it('passes each team’s official injury record through the normal starting-QB lookup', async () => {
    vi.spyOn(ballDontLieService, 'getTeams').mockResolvedValue([{ id: 1, full_name: 'Home Team' }, { id: 2, full_name: 'Away Team' }]);
    const lookup = vi.spyOn(ballDontLieService, 'getStartingQBFromDepthChart').mockResolvedValue(null);
    const injuries = { home: [{ name: 'Home QB', status: 'Out' }], away: [{ name: 'Away QB', status: 'Q' }] };
    await fetchStartingQBs('Home Team', 'Away Team', 'NFL', injuries, 2026);
    expect(lookup).toHaveBeenCalledWith(1, 2026, 'americanfootball_nfl', { officialInjuries: injuries.home });
    expect(lookup).toHaveBeenCalledWith(2, 2026, 'americanfootball_nfl', { officialInjuries: injuries.away });
  });
});
