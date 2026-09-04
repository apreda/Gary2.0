import { beforeEach, describe, expect, it, vi } from 'vitest';

// THE AVAILABILITY container, for college (NCAAF Picks page parity, founder
// Sep 3-4 2026). BDL publishes no college injury feed (ncaaf/v1/player_injuries
// is a 404), so this lane asks a grounded web search for the week's reported
// injuries, suspensions and opt-outs — and keeps ONLY names it can find on a
// side's BDL active roster. The roster decides the side and the position;
// the model only reports. NCAAF-owned: the NFL injuries feed is never read.

const search = vi.hoisted(() => ({ searchGrounded: vi.fn() }));
vi.mock('../../../src/services/insights/ncaafSearch.js', () => search);
vi.mock('../../../src/services/insights/solText.js', () => ({
  generateSolText: vi.fn(async () => JSON.stringify({ reads: [] })),
}));

const { computeNcaafAvailability } = await import('../../../src/services/insights/computers/ncaafAvailability.js');

const stanford = { id: 13, conference: 1, college: 'Stanford', name: 'Cardinal', full_name: 'Stanford Cardinal', abbreviation: 'STAN' };
const miami = { id: 8, conference: 1, college: 'Miami', name: 'Hurricanes', full_name: 'Miami Hurricanes', abbreviation: 'MIA' };

const game = { id: 457163, date: '2026-09-05T23:30:00.000Z', season: 2026, week: 1, home_team: stanford, visitor_team: miami };

const player = (id, first, last, position, team) => ({
  id, first_name: first, last_name: last, position, position_abbreviation: position, team,
});

const stanfordRoster = [
  player(501, 'Ben', 'Gulbranson', 'QB', stanford),
  player(503, 'Micah', 'Ford', 'RB', stanford),
  player(504, 'Emmett', 'Mosley V', 'WR', stanford),
  player(505, 'Tobin', 'Phillips', 'DL', stanford),
  player(506, 'David', 'Bailey', 'LB', stanford),
  player(507, 'Collin', 'Wright', 'CB', stanford),
];
const miamiRoster = [
  player(601, 'Carson', 'Beck', 'QB', miami),
  player(602, 'D.J.', 'Uiagalelei', 'QB', miami),
  player(603, 'Mark', 'Fletcher Jr.', 'RB', miami),
];

function reply(items) {
  return { success: true, data: `Here is the report:\n\`\`\`json\n${JSON.stringify(items)}\n\`\`\`` };
}

let bdl;
let ctx;

beforeEach(() => {
  vi.clearAllMocks();
  bdl = {
    getNcaafTeamPlayers: vi.fn(async (teamId) => (teamId === 13 ? stanfordRoster : teamId === 8 ? miamiRoster : [])),
    getNflPlayerInjuries: vi.fn(async () => []),
  };
  search.searchGrounded.mockResolvedValue(reply([]));
  ctx = {
    date: '2026-09-05',
    season: 2026,
    league: 'ncaaf',
    games: [game],
    bdl,
    helpers: { gameLabel: (g) => `${g.visitor_team.abbreviation} @ ${g.home_team.abbreviation}` },
  };
});

describe('computeNcaafAvailability', () => {
  it('is a no-op for any league but NCAAF and never reads the NFL injuries feed or searches', async () => {
    expect(await computeNcaafAvailability({ ...ctx, league: 'nfl' })).toEqual([]);
    expect(search.searchGrounded).not.toHaveBeenCalled();
    expect(bdl.getNflPlayerInjuries).not.toHaveBeenCalled();
  });

  it('asks one grounded search per game, naming both programs and the game date', async () => {
    await computeNcaafAvailability(ctx);
    expect(search.searchGrounded).toHaveBeenCalledTimes(1);
    const prompt = String(search.searchGrounded.mock.calls[0][0]);
    expect(prompt).toContain('Miami Hurricanes');
    expect(prompt).toContain('Stanford Cardinal');
    expect(prompt).toContain('2026-09-05');
    expect(prompt).toContain('JSON');
  });

  it('keeps only names on a side\'s active roster, with the roster deciding the side and the position', async () => {
    search.searchGrounded.mockResolvedValue(reply([
      { player: 'Micah Ford', team: 'Stanford', position: 'WR', status: 'out', note: 'Ford (ankle) will miss the opener, head coach Frank Reich said Wednesday.', source: 'The Athletic', reported: '2026-09-02' },
      { player: 'Made Up Guy', team: 'Stanford', position: 'QB', status: 'out', note: 'Not a real player.', source: 'nowhere' },
      // The model filed him under the wrong program; the roster knows better.
      { player: 'Carson Beck', team: 'Stanford', position: 'QB', status: 'questionable', note: 'Beck (elbow) was limited this week.', source: 'ESPN' },
    ]));

    const rows = await computeNcaafAvailability(ctx);

    expect(rows.length).toBe(2);
    const ford = rows.find((r) => r.player_id === 503);
    expect(ford.category).toBe('injury');
    expect(ford.headline).toBe('Micah Ford (RB) is out for STAN');
    expect(ford.detail).toBe('Ford (ankle) will miss the opener, head coach Frank Reich said Wednesday. Per The Athletic, Sep 2.');
    expect(ford.value).toBe('OUT');
    expect(ford.tone).toBe('bad');
    expect(ford.team_id).toBe(13);
    expect(ford.game_id).toBe(457163);
    expect(ford.game).toBe('MIA @ STAN');
    expect(ford.meta).toMatchObject({
      source: 'search_grounded_roster_verified', status: 'out', position: 'RB', reported: '2026-09-02', through: '2026-09-05',
    });
    const beck = rows.find((r) => r.player_id === 601);
    expect(beck.headline).toBe('Carson Beck (QB) is questionable for MIA');
    expect(beck.team_id).toBe(8);
    expect(beck.tone).not.toBe('bad');
    expect(rows.some((r) => /Made Up/.test(r.headline))).toBe(false);
  });

  it('matches names through punctuation and suffixes the wire spells differently', async () => {
    search.searchGrounded.mockResolvedValue(reply([
      { player: 'DJ Uiagalelei', team: 'Miami', status: 'doubtful', note: 'Uiagalelei (hand) did not practice Thursday.', source: 'Miami Herald' },
      { player: 'Mark Fletcher', team: 'Miami', status: 'questionable', note: 'Fletcher (knee) is a game-time decision.', source: 'ESPN' },
    ]));

    const rows = await computeNcaafAvailability(ctx);

    expect(rows.map((r) => r.player_id).sort()).toEqual([602, 603]);
  });

  it('caps a game at four rows, worst status first, and drops a status word it does not know', async () => {
    search.searchGrounded.mockResolvedValue(reply([
      { player: 'Collin Wright', team: 'Stanford', status: 'questionable', note: 'Wright (hamstring) limited.', source: 'x' },
      { player: 'David Bailey', team: 'Stanford', status: 'probable', note: 'Bailey (illness) expected to play.', source: 'x' },
      { player: 'Tobin Phillips', team: 'Stanford', status: 'suspended', note: 'Phillips suspended one game.', source: 'x' },
      { player: 'Emmett Mosley V', team: 'Stanford', status: 'doubtful', note: 'Mosley (foot) unlikely.', source: 'x' },
      { player: 'Ben Gulbranson', team: 'Stanford', status: 'out for season', note: 'Gulbranson (ACL) done for the year.', source: 'x' },
      { player: 'Micah Ford', team: 'Stanford', status: 'vibes', note: 'unclear', source: 'x' },
    ]));

    const rows = await computeNcaafAvailability(ctx);

    expect(rows.length).toBe(4);
    expect(rows.map((r) => r.value)).toEqual(['OUT FOR SEASON', 'SUSPENDED', 'DOUBTFUL', 'QUESTIONABLE']);
    expect(rows[0].headline).toBe('Ben Gulbranson (QB) is out for the season for STAN');
    expect(rows.some((r) => r.player_id === 503)).toBe(false);
  });

  it('treats a failed search or unparseable text as no report, never an empty one', async () => {
    search.searchGrounded.mockResolvedValueOnce({ success: false, data: null, error: 'timeout' });
    expect(await computeNcaafAvailability(ctx)).toEqual([]);
    search.searchGrounded.mockResolvedValueOnce({ success: true, data: 'No structured answer today.' });
    expect(await computeNcaafAvailability(ctx)).toEqual([]);
  });

  it('skips a game whose rosters it cannot load rather than trusting the model alone', async () => {
    bdl.getNcaafTeamPlayers.mockRejectedValue(new Error('503'));
    expect(await computeNcaafAvailability(ctx)).toEqual([]);
    expect(search.searchGrounded).not.toHaveBeenCalled();
  });
});
