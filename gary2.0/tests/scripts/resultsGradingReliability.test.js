import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFootballSettlementCoverage,
  buildFootballSettlementOutcome,
  buildNflResultWritePayload,
  canonicalNFLPropType,
  footballSettlementCoverageFailures,
  gradeGameSpread,
  gradePropResult,
  isFinalGameStatus,
  nflActualFromStatRow,
  nflResultConfidence,
  nflSeasonTypeForGame,
  normalizeStoredPropType,
  pickGameId,
  propGameId,
  propResultIdentity,
  requiredPropSourceSports,
  statsForGame,
} from '../../scripts/lib/resultsGradingReliability.js';

describe('NFL result persistence mapping', () => {
  const weeklyRow = {
    id: 'weekly-row-uuid',
    week_start: '2026-08-11',
    week_number: 2,
    season: 2026,
  };
  const preseasonPick = {
    bdl_game_id: 1393562,
    season: 2025,
    week: 1,
    season_type: 1,
    league: 'NFL',
    homeTeam: 'Baltimore Ravens',
    awayTeam: 'Philadelphia Eagles',
    pick: 'Baltimore Ravens +4 -110',
    confidence: 0.62,
  };

  it('maps a 2026 preseason result from the canonical weekly row and exact final', () => {
    expect(buildNflResultWritePayload({
      mode: 'insert',
      weeklyRow,
      pick: preseasonPick,
      nflPickId: weeklyRow.id,
      gameDate: '2026-08-15',
      gameId: 1393562,
      result: 'won',
      homeScore: '24',
      awayScore: 7,
      isWinnersPick: true,
    })).toEqual({
      nfl_pick_id: 'weekly-row-uuid',
      game_date: '2026-08-15',
      pick_text: 'Baltimore Ravens +4 -110',
      matchup: 'Philadelphia Eagles @ Baltimore Ravens',
      result: 'won',
      final_score: '7-24',
      season: 2026,
      week_number: 2,
      confidence: 62,
      home_team: 'Baltimore Ravens',
      away_team: 'Philadelphia Eagles',
      home_score: 24,
      away_score: 7,
      is_winners_pick: true,
      game_id: '1393562',
    });
  });

  // Founder law, Aug 21 2026: preseason never counts toward a Gary record.
  // The grade-time stamp is what every record surface filters on, so it must
  // ride both write paths and only ever hold BDL's 1/2/3 numbering.
  it('stamps the season type on both write paths so preseason can be excluded downstream', () => {
    const insert = buildNflResultWritePayload({
      mode: 'insert', weeklyRow, pick: preseasonPick, nflPickId: weeklyRow.id,
      gameDate: '2026-08-15', result: 'won', homeScore: 24, awayScore: 7, seasonType: 1,
    });
    expect(insert.season_type).toBe(1);

    const update = buildNflResultWritePayload({
      mode: 'update', weeklyRow, pick: preseasonPick,
      result: 'won', homeScore: 24, awayScore: 7, seasonType: 2,
    });
    expect(update.season_type).toBe(2);

    // An unknown/garbage season type is omitted rather than written as a
    // number that would silently read as preseason.
    for (const bad of [null, undefined, 0, 4, 'preseason', NaN]) {
      expect(buildNflResultWritePayload({
        mode: 'insert', weeklyRow, pick: preseasonPick, gameDate: '2026-08-15',
        result: 'won', homeScore: 24, awayScore: 7, seasonType: bad,
      })).not.toHaveProperty('season_type');
    }
  });

  it('repairs the same metadata on the idempotent update path without changing the grade', () => {
    const payload = buildNflResultWritePayload({
      mode: 'update',
      weeklyRow,
      pick: preseasonPick,
      gameId: '1393562',
      result: 'won',
      homeScore: 24,
      awayScore: 7,
      isWinnersPick: true,
      updatedAt: '2026-08-16T21:00:00.000Z',
    });

    expect(payload).toEqual({
      result: 'won',
      final_score: '7-24',
      season: 2026,
      week_number: 2,
      confidence: 62,
      home_team: 'Baltimore Ravens',
      away_team: 'Philadelphia Eagles',
      home_score: 24,
      away_score: 7,
      is_winners_pick: true,
      game_id: '1393562',
      updated_at: '2026-08-16T21:00:00.000Z',
    });
    expect(payload).not.toHaveProperty('nfl_pick_id');
    expect(payload).not.toHaveProperty('game_date');
  });

  it('writes the deployed integer percentage without double-scaling old percent values', () => {
    expect(nflResultConfidence(0)).toBe(0);
    expect(nflResultConfidence(0.624)).toBe(62);
    expect(nflResultConfidence(1)).toBe(100);
    expect(nflResultConfidence(72)).toBe(72);
    expect(nflResultConfidence('83')).toBe(83);
    expect(nflResultConfidence(-1)).toBeNull();
    expect(nflResultConfidence(101)).toBeNull();
  });
});

describe('stored prop provider source scope', () => {
  it('normalizes MLB HR into MLB and does not open unrelated providers', () => {
    expect([...requiredPropSourceSports([
      { sport: 'MLB', game_id: '1' },
      { sport: 'MLB HR', game_id: '2' },
    ])]).toEqual(['MLB']);
  });

  it('intersects stored sports with an explicit football settlement filter', () => {
    const allowed = new Set(['NFL', 'NCAAF']);
    expect([...requiredPropSourceSports([
      { sport: 'MLB', game_id: '1' },
      { sport: 'NFL', game_id: '2' },
      { sport: 'NBA', game_id: '3' },
    ], allowed)]).toEqual(['NFL']);
    expect(requiredPropSourceSports([{ sport: 'MLB' }], allowed).size).toBe(0);
  });
});

describe('stored prop market normalization', () => {
  it.each([
    ['passing_yards 252.5', 'passing_yards'],
    ['Passing Yards 252.5', 'passing_yards'],
    ['player anytime td', 'player_anytime_td'],
  ])('normalizes %s without dropping the market suffix', (input, expected) => {
    expect(normalizeStoredPropType(input)).toBe(expected);
  });
});

describe('NFL deterministic prop extraction', () => {
  const qb = {
    player: { first_name: 'Josh', last_name: 'Allen' },
    team: { id: 1, abbreviation: 'BUF' },
    passing_yards: 278,
    passing_touchdowns: 3,
    passing_completions: 24,
    passing_attempts: 35,
    rushing_attempts: 8,
    passing_interceptions: 1,
    rushing_yards: 42,
    rushing_touchdowns: 1,
    long_rushing: 18,
  };
  const receiver = {
    player: { first_name: 'Keon', last_name: 'Coleman' },
    team: { id: 1, abbreviation: 'BUF' },
    receptions: 6,
    receiving_yards: 91,
    receiving_touchdowns: 1,
    long_reception: 37,
  };

  it.each([
    ['player_pass_yds', 'passing_yards'],
    ['pass_tds', 'passing_touchdowns'],
    ['passing_tds', 'passing_touchdowns'],
    ['player_pass_attempts', 'pass_attempts'],
    ['rushing_attempts', 'rushing_attempts'],
    ['passing_completions', 'completions'],
    ['player_pass_interceptions', 'interceptions'],
    ['player_reception_yds', 'receiving_yards'],
    ['rush_rec_yds', 'rushing_receiving_yards'],
    ['pass_rush_yds', 'passing_rushing_yards'],
    ['longest_pass', 'longest_completion'],
    ['yards', 'total_yards'],
  ])('maps %s to %s', (input, expected) => {
    expect(canonicalNFLPropType(input)).toBe(expected);
  });

  it('keeps passing, rushing, and anytime touchdown markets distinct', () => {
    expect(nflActualFromStatRow(qb, 'passing_touchdowns', [qb, receiver])).toBe(3);
    expect(nflActualFromStatRow(qb, 'rushing_touchdowns', [qb, receiver])).toBe(1);
    expect(nflActualFromStatRow(qb, 'anytime_td', [qb, receiver])).toBe(1);
  });

  it('grades authorized combo, total, attempts, and longest markets from the exact game', () => {
    expect(nflActualFromStatRow(qb, 'passing_rushing_yards', [qb, receiver])).toBe(320);
    expect(nflActualFromStatRow(qb, 'total_yards', [qb, receiver])).toBe(320);
    expect(nflActualFromStatRow(qb, 'pass_attempts', [qb, receiver])).toBe(35);
    expect(nflActualFromStatRow(qb, 'rushing_attempts', [qb, receiver])).toBe(8);
    expect(nflActualFromStatRow(qb, 'longest_rush', [qb, receiver])).toBe(18);
    expect(nflActualFromStatRow(qb, 'longest_pass', [qb, receiver])).toBe(37);
    expect(nflActualFromStatRow(receiver, 'longest_reception', [qb, receiver])).toBe(37);
  });

  it('fails closed for an unauthorized NFL market', () => {
    expect(nflActualFromStatRow(qb, 'first_touchdown', [qb, receiver])).toBeNull();
  });
});

describe('NFL stats season-type routing', () => {
  it('routes August games to preseason so exact-game stats do not query the empty regular-season default', () => {
    expect(nflSeasonTypeForGame({ date: '2026-08-15T23:00:00Z', postseason: false })).toBe(1);
  });

  it('honors explicit and postseason metadata before date inference', () => {
    expect(nflSeasonTypeForGame({ season_type: 2, date: '2026-08-15T23:00:00Z' })).toBe(2);
    expect(nflSeasonTypeForGame({ postseason: true, date: '2027-01-17T18:00:00Z' })).toBe(3);
    expect(nflSeasonTypeForGame({ postseason: false, date: '2026-09-13T17:00:00Z' })).toBe(2);
  });
});

describe('prop result grading', () => {
  it('records exact numeric ties as pushes on either side', () => {
    expect(gradePropResult(24, 24, 'over')).toBe('push');
    expect(gradePropResult(24, 24, 'under')).toBe('push');
  });

  it('keeps yes/no touchdown markets binary', () => {
    expect(gradePropResult(1, 0.5, 'yes')).toBe('won');
    expect(gradePropResult(0, 0.5, 'no')).toBe('won');
  });
});

describe('football settlement coverage', () => {
  const completeLane = {
    candidates: 2,
    finalEligible: 1,
    persisted: 1,
    readBack: 1,
    pendingNonFinal: 1,
    w: 1,
  };

  it('allows a zero-write poll when every candidate is still non-final', () => {
    const outcome = buildFootballSettlementOutcome('2026-09-13', {
      nfl: { candidates: 2, pendingNonFinal: 2 },
    });
    expect(footballSettlementCoverageFailures(outcome)).toEqual([]);
    expect(assertFootballSettlementCoverage(outcome)).toBe(outcome);
  });

  it('fails when final work was not persisted and read back', () => {
    const outcome = buildFootballSettlementOutcome('2026-09-13', {
      nfl: { ...completeLane, persisted: 0, readBack: 0, unresolvedFinal: 1 },
    });
    expect(() => assertFootballSettlementCoverage(outcome)).toThrow(/persisted 0\/1/);
    expect(outcome.status).toBe('failed');
  });

  it('fails on malformed identity, unmatched rows, write errors, or missing readback', () => {
    const outcome = buildFootballSettlementOutcome('2026-09-13', {
      props: {
        ...completeLane,
        readBack: 0,
        invalidIdentity: 1,
        unmatched: 1,
        errors: ['insert denied'],
      },
    });
    const failures = footballSettlementCoverageFailures(outcome).join(' | ');
    expect(failures).toContain('invalid exact-game identity');
    expect(failures).toContain('unmatched to provider game');
    expect(failures).toContain('insert denied');
    expect(failures).toContain('read back 0/1');
  });
});

describe('football result finality', () => {
  it.each(['Final', 'final', 'Final/OT', 'STATUS_FINAL', 'completed', 'closed'])(
    'accepts the provider final status %s',
    (status) => expect(isFinalGameStatus(status)).toBe(true),
  );

  it.each(['', null, 'Scheduled', 'In Progress', 'Halftime', 'Postponed', 'Suspended'])(
    'keeps the non-final status %s pending',
    (status) => expect(isFinalGameStatus(status)).toBe(false),
  );
});

describe('football game-spread grading', () => {
  it.each([
    ['Chiefs +0.5 -110', 'home', 20, 20, 'won'],
    ['Rams -0.5 -110', 'away', 20, 20, 'lost'],
    ['Chiefs +0 -105', 'home', 20, 20, 'push'],
    ['Rams -0 +100', 'away', 20, 20, 'push'],
    ['Chiefs PK -110', 'home', 20, 20, 'push'],
    ["Rams pick'em -110", 'away', 21, 20, 'lost'],
  ])('grades %s without falling through to moneyline', (pick, side, home, away, expected) => {
    expect(gradeGameSpread(pick, side, home, away)).toBe(expected);
  });

  it('returns null when the selection is not a spread', () => {
    expect(gradeGameSpread('Chiefs ML -125', 'home', 20, 17)).toBeNull();
  });
});

describe('football prop game attribution', () => {
  it('accepts either stored provider-id field', () => {
    expect(propGameId({ game_id: 101 })).toBe('101');
    expect(propGameId({ bdl_game_id: '202' })).toBe('202');
    expect(propGameId({})).toBeNull();
  });

  it('returns only stats stamped for the prop game', () => {
    const stats = [
      { _game_id: '101', player: { first_name: 'Alex' } },
      { _game_id: '202', player: { first_name: 'Alex' } },
    ];
    expect(statsForGame(stats, 202)).toEqual([stats[1]]);
    expect(statsForGame(stats, null)).toEqual([]);
  });
});

describe('football game-pick attribution', () => {
  it('normalizes either stored provider-id field and rejects a blank id', () => {
    expect(pickGameId({ game_id: 101 })).toBe('101');
    expect(pickGameId({ bdl_game_id: '202' })).toBe('202');
    expect(pickGameId({ game_id: '  ' })).toBeNull();
  });

  it('prefers the explicit BDL namespace over an unrelated generic game id', () => {
    expect(pickGameId({ game_id: 'odds-api-event', bdl_game_id: 202 })).toBe('202');
    expect(pickGameId({ game_id: 401234567, bdl_game_id: ' 202 ' })).toBe('202');
  });

  it('falls back to the historical generic BDL id when the explicit field is blank', () => {
    expect(pickGameId({ bdl_game_id: ' ', game_id: ' 101 ' })).toBe('101');
    expect(pickGameId({ game_id: '', bdl_game_id: 202 })).toBe('202');
  });
});

describe('prop result identity', () => {
  const base = {
    gameId: '101',
    sport: 'NFL',
    playerName: 'Alex Smith',
    propType: 'passing_yards',
    bet: 'over',
    line: 250.5,
    gameDate: '2026-09-13',
  };

  it('is stable across harmless casing and numeric representation differences', () => {
    expect(propResultIdentity(base)).toBe(propResultIdentity({
      ...base, sport: 'nfl', bet: 'OVER', line: '250.5', playerName: ' Alex  Smith ',
    }));
  });

  it.each([
    ['game id', { gameId: '102' }],
    ['sport', { sport: 'NCAAF' }],
    ['bet side', { bet: 'under' }],
    ['line', { line: 251.5 }],
  ])('does not collide across %s', (_label, change) => {
    expect(propResultIdentity({ ...base, ...change })).not.toBe(propResultIdentity(base));
  });
});

describe('run-all-results wiring', () => {
  const runner = readFileSync(new URL('../../scripts/run-all-results.js', import.meta.url), 'utf8');
  const migration = readFileSync(
    new URL('../../supabase/migrations/20260815152052_prop_results_game_sport_identity.sql', import.meta.url),
    'utf8',
  );
  const gameIdentityMigration = readFileSync(
    new URL('../../supabase/migrations/20260815170413_game_results_game_id_identity.sql', import.meta.url),
    'utf8',
  );

  it('opens only provider lanes represented by the stored prop sports', () => {
    expect(runner).toContain('const storedProps = rows.flatMap(propsForRow)');
    expect(runner).toContain('const sourceSports = requiredPropSourceSports(storedProps, allowedSports)');
    expect(runner).toContain("const wants = (sport) => sourceSports.has");
    expect(runner).toContain("const mlbStats = wants('MLB')");
    expect(runner).toContain("const nflStats = wants('NFL')");
    expect(runner).toContain("const ncaafStats = wants('NCAAF')");
  });

  it('requires a final NFL game and scopes stats to its exact id', () => {
    expect(runner).toContain("params.append('dates[]', date)");
    expect(runner).toContain("for (const seasonType of [1, 2, 3]) params.append('season_type[]'");
    expect(runner).toContain("const nflFinalIds = new Set(nflGames.filter(g => isFinalGameStatus(g.status))");
    expect(runner).toContain("dataSport === 'NFL' && gameId == null");
    expect(runner).toContain("dataSport === 'NFL' && !nflFinalIds.has(gameId)");
    // Football stat lookups share one exact-game branch with the DNP-void
    // (Aug 20 2026): populated final box + absent player = push; provider
    // holes stay pending; grounding never settles football in ANY pass.
    expect(runner).toContain("statsForGame(dataSport === 'NFL' ? nflStats : ncaafStats, gameId)");
    expect(runner).toContain("!lookupMeta.playerFound && gameRows.length >= 10");
    expect(runner).toContain('footballDnpVoid = true');
    expect(runner).toContain("footballDnpVoid ? 'push' : gradePropResult(actual, line, bet)");
    expect(runner).toContain('season_type=${seasonType}&per_page=100');
    expect(runner).toContain('normalizeStoredPropType(rawProp)');
    expect(runner).toContain("_game_id: String(gameId)");
    expect(runner).toContain("} else if (['NFL', 'NCAAF'].includes(dataSport)) {");
  });

  it('fails the cloud settlement lane on read/write/readback coverage gaps', () => {
    expect(runner).toContain('if (rowsError) throw new Error(`Could not read ${table}');
    expect(runner).toContain('readBackPersistedResults');
    expect(runner).toContain('assertFootballSettlementCoverage(outcome)');
    expect(runner).toContain('FOOTBALL_SETTLEMENT_OUTCOME=');
  });

  it('requires a final NCAAF game, exact-game BDL stats, and no grounding fallback', () => {
    expect(runner).toContain("const ncaafFinalIds = new Set(ncaafGames.filter(g => isFinalGameStatus(g.status))");
    expect(runner).toContain('for (const providerDate of [date, nextUtcDate])');
    expect(runner).toContain('`dates[]=${providerDate}&per_page=100${cursorParam}`');
    expect(runner).toContain('ncaafSlateDateForKickoff(game) === date');
    expect(runner).toContain("timeZone: 'America/New_York'");
    expect(runner).toContain("dataSport === 'NCAAF' && gameId == null");
    expect(runner).toContain("dataSport === 'NCAAF' && !ncaafFinalIds.has(gameId)");
    expect(runner).toContain("dataSport === 'NCAAF' ? p.player_id : null");
    expect(runner).toContain('findExactNcaafStatRow(data, playerId)');
    expect(runner).toContain("bdlFetch('ncaaf/v1/player_stats', `game_ids[]=${gameId}&per_page=100${cursorParam}`)");
    expect(runner).toContain("String(row?.game?.id ?? '') === String(gameId)");
    expect(runner).toContain('[BDL Miss] ${dataSport}:');
    expect(runner).toContain('leaving pending');
  });

  it('grades NCAAF game picks from the complete exact-id final game only', () => {
    expect(runner).toContain("league === 'NCAAF' ? await fetchNCAAFGames(date)");
    expect(runner).toContain("['NFL', 'NCAAF'].includes(league) && pickGameId == null");
    expect(runner).toContain("['NFL', 'NCAAF'].includes(league) && !finalStatus");
    expect(runner).toContain("league !== 'NCAAF'");
    expect(runner).toContain("? ncaafSlateDateForKickoff(matchedGame)");
  });

  it('persists exact NCAAF game-result identity when the migration is available', () => {
    expect(runner).toContain("supportsExactGameResultIdentity");
    expect(runner).toContain("game_id: resolvedGameId");
    expect(gameIdentityMigration).toMatch(/add column if not exists game_id text/i);
    expect(gameIdentityMigration).toMatch(/create unique index if not exists game_results_exact_game_pick_idx/i);
    expect(gameIdentityMigration).toContain('where game_id is not null');
  });

  it('persists an exact, non-visible game/sport identity when schema support exists', () => {
    expect(runner).toContain("{ game_id: gameId, sport }");
    expect(migration).toMatch(/add column if not exists game_id text/i);
    expect(migration).toMatch(/add column if not exists sport text/i);
    expect(migration).toMatch(/create unique index if not exists prop_results_exact_identity_idx/i);
    expect(migration).toContain("lower(coalesce(bet, ''))");
    expect(migration).toContain('line_value');
  });
});
