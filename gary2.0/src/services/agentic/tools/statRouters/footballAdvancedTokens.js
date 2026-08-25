import { advancedPair, basisLine, continuityFor } from './footballAdvanced.js';
import { getPassRushAndCoverage, getQbPressureProfile } from '../../../nflverseService.js';
import { ballDontLieService } from '../../../ballDontLieService.js';
import { fmtNum, fmtPct } from './statRouterCommon.js';
import { loadTeamResults } from './footballTeamGames.js';
import { loadLeagueContext, opponentQualityLine } from './footballLeagueContext.js';
import { buildGameLedger, ledgerLines, recencyStrip, recordSlice, isNightGame } from './footballRecordLedger.js';

/**
 * The tokens that run on the season play ledger (Aug 25 2026).
 *
 * These replace, in one pass:
 *   - six lanes that declined outright (GOAL_LINE, EARLY_DOWN_SUCCESS,
 *     TWO_MINUTE_DRILL, TIME_TO_THROW, OL_RANKINGS, DL_RANKINGS)
 *   - two lanes named EPA that returned yards and points
 *   - two lanes named success rate that returned third-down conversion
 *   - a lane called RED_ZONE_DEFENSE that contained no red-zone data
 *   - an explosive-play lane that reported the single LONGEST play as a proxy
 *     for a rate
 *
 * They live in their own module rather than inline in nflFetchers.js so the
 * diff is readable and so the ledger's shape has exactly one consumer.
 *
 * EVERY payload carries `basis` — which season the numbers come from and how
 * much football is behind them. On opening weekend that line is the entire
 * difference between honest evidence and a fabricated tendency.
 */

const named = (team) => team?.full_name || team?.name || null;

/** Both teams' season rows, unwrapped. Cached by the BDL service. */
async function bdlPair(bdlSport, home, away, season) {
  const [h, a] = await Promise.all([
    ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
    ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
  ]);
  return {
    homeStats: Array.isArray(h) ? h[0] : h,
    awayStats: Array.isArray(a) ? a[0] : a
  };
}




/**
 * Per-game EPA lines for one team, keyed by week, so the game ledger can
 * carry how the team actually PLAYED in each game rather than only the score.
 */
function playLinesFor(pair, which) {
  const code = which === 'home' ? pair?.homeCode : pair?.awayCode;
  if (!code || !pair?.ledger?.games) return null;
  const byWeek = new Map();
  for (const g of pair.ledger.games) {
    const line = g.lines?.[code];
    if (!line || g.week == null) continue;
    byWeek.set(Number(g.week), { ...line, quarterback: g.starters?.[code]?.name || null });
  }
  return byWeek.size ? byWeek : null;
}

/**
 * The one ledger a matchup's records all cite. Built per team, joined to the
 * play ledger where one exists.
 */
async function ledgerFor(bdlSport, team, season, pair, which) {
  const [results, league] = await Promise.all([
    loadTeamResults(bdlSport, team.id, season),
    loadLeagueContext(bdlSport, season).catch(() => null)
  ]);
  return buildGameLedger(results, {
    leagueContext: league,
    opponentQuality: opponentQualityLine,
    playLines: pair ? playLinesFor(pair, which) : null
  });
}

/**
 * The shape every ledger-backed token returns when the ledger cannot speak.
 * Never an empty object: a blank reads as "no tendency", which is a lie.
 */
function unavailable(category, home, away, reason) {
  return {
    category,
    source: 'NOT AVAILABLE',
    reason,
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable.',
    home: { team: named(home) },
    away: { team: named(away) }
  };
}

/**
 * Build a two-sided split token. `sides` names which ledger sides to read and
 * what to call them, so goal-line can show offence AND defence together —
 * the founder's point that a team's own short-yardage rate is only half the
 * matchup.
 */
function splitToken(category, splitKeys, { includeDefense = true } = {}) {
  return async (bdlSport, home, away, season) => {
    const pair = await advancedPair(bdlSport, home, away, season);
    if (!pair) {
      return unavailable(category, home, away,
        'The season play ledger covers the NFL only (nflverse does not publish college play-by-play).');
    }
    if (!pair.home && !pair.away) {
      return unavailable(category, home, away, pair.note);
    }

    const sideFor = (team, which) => {
      if (!team) return { note: 'No ledger entry for this team.' };
      const out = {};
      for (const key of splitKeys) {
        const off = team.offense?.splits?.[key];
        if (off) out[`offense_${key}`] = off;
        if (includeDefense) {
          const def = team.defense?.splits?.[key];
          if (def) out[`defense_${key}`] = def;
        }
      }
      return out;
    };

    return {
      category,
      data_scope: 'Per-play splits from every snap of scrimmage in the season',
      basis: basisLine(pair),
      home: { team: named(home), ...sideFor(pair.home, 'home') },
      away: { team: named(away), ...sideFor(pair.away, 'away') },
      reading_note: 'EPA per play is points of expected value added per snap; success rate is the share of snaps that gained enough to stay on schedule. Both are computed, not estimated. Where a split carries a reliability line, the sample is too thin to call a tendency.'
    };
  };
}

export const footballAdvancedTokens = {
  // ── The six lanes that used to decline ────────────────────────────────────

  GOAL_LINE: splitToken('Goal Line and Short Yardage', ['goal_to_go', 'short_yardage', 'inside_ten']),

  EARLY_DOWN_SUCCESS: splitToken('Early Down Efficiency', ['early_down', 'third_and_long', 'third_and_short']),

  TWO_MINUTE_DRILL: splitToken('Two-Minute and Situational', ['two_minute', 'trailing', 'leading']),

  /**
   * Pocket time is a real charted figure, not a tracking estimate — PFR times
   * it. The lane declined because we were looking for Next Gen Stats.
   */
  TIME_TO_THROW: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'americanfootball_nfl') {
      return unavailable('Time to Throw', home, away, 'PFR charting covers the NFL only.');
    }
    const [h, a] = await Promise.all([
      getQbPressureProfile(named(home), season),
      getQbPressureProfile(named(away), season)
    ]);
    if (h.unavailable && a.unavailable) {
      return unavailable('Time to Throw', home, away, h.reason);
    }
    const side = (team, res) => {
      if (res.unavailable) return { team: named(team), note: res.reason };
      const qbs = res.quarterbacks.filter((q) => (q.pass_attempts || 0) >= 20);
      return {
        team: named(team),
        quarterbacks: (qbs.length ? qbs : res.quarterbacks).map((q) => ({
          player: q.player,
          attempts: q.pass_attempts,
          pocket_time_seconds: q.pocket_time_seconds,
          pressured_pct: q.pressure_pct,
          times_blitzed: q.times_blitzed,
          bad_throw_pct: q.bad_throw_pct,
          intended_air_yards_per_attempt: q.intended_air_yards_per_attempt
        }))
      };
    };
    return {
      category: 'Time to Throw and Pocket Behaviour',
      data_scope: 'Pro Football Reference charting via nflverse — timed, not estimated',
      home: side(home, h),
      away: side(away, a),
      reading_note: 'Pocket time is seconds from snap to throw, sack or scramble. A short pocket time with a high pressure rate is a line problem; a short pocket time with a low pressure rate is a quick-game scheme.'
    };
  },

  /**
   * Pass protection. Sacks allowed were all we had; pressure faced, pocket
   * time and blitz rate are the rest of the picture.
   */
  OL_RANKINGS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'americanfootball_nfl') {
      return unavailable('Offensive Line', home, away, 'Advanced line data covers the NFL and FBS only.');
    }
    const pair = await advancedPair(bdlSport, home, away, season);
    const [h, a] = await Promise.all([
      getQbPressureProfile(named(home), season),
      getQbPressureProfile(named(away), season)
    ]);
    const side = (team, res, led) => {
      const out = { team: named(team) };
      if (led) {
        out.sacks_allowed = led.offense?.sacks ?? null;
        out.sack_rate_allowed = led.offense?.sack_rate ?? null;
        out.qb_hit_rate_allowed = led.offense?.qb_hit_rate ?? null;
        out.dropbacks = led.offense?.dropbacks ?? null;
      }
      if (res.unavailable) out.charting_note = res.reason;
      else {
        const lead = res.quarterbacks[0];
        out.primary_qb = lead?.player || null;
        out.pressure_pct_faced = lead?.pressure_pct ?? null;
        out.times_hit = lead?.times_hit ?? null;
        out.times_hurried = lead?.times_hurried ?? null;
        out.times_blitzed = lead?.times_blitzed ?? null;
        out.pocket_time_seconds = lead?.pocket_time_seconds ?? null;
      }
      return out;
    };
    return {
      category: 'Pass Protection',
      data_scope: 'Sack and QB-hit rate from play-by-play; pressure, hurries and pocket time from PFR charting',
      basis: basisLine(pair),
      home: side(home, h, pair?.home),
      away: side(away, a, pair?.away),
      reading_note: 'Sacks are the outcome; pressures are the process. A line can allow few sacks while its quarterback is hit constantly, and that gap usually closes against a better rush.'
    };
  },

  /**
   * Pass rush. The DL lane declined because pressure was assumed to be a paid
   * charting product — PFR publishes it free through nflverse.
   */
  DL_RANKINGS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'americanfootball_nfl') {
      return unavailable('Defensive Line', home, away, 'Advanced line data covers the NFL and FBS only.');
    }
    const pair = await advancedPair(bdlSport, home, away, season);
    const [h, a] = await Promise.all([
      getPassRushAndCoverage(named(home), season),
      getPassRushAndCoverage(named(away), season)
    ]);
    const side = (team, res, led) => {
      const out = { team: named(team) };
      if (led) {
        out.qb_hit_rate = led.defense?.qb_hit_rate ?? null;
        out.sack_rate = led.defense?.sack_rate ?? null;
        out.dropbacks_faced = led.defense?.dropbacks ?? null;
      }
      if (res.unavailable) out.charting_note = res.reason;
      else out.pass_rushers = res.pass_rush.slice(0, 5);
      return out;
    };
    return {
      category: 'Pass Rush',
      data_scope: 'Team pressure rate from play-by-play; per-defender pressures, hurries, QB hits and blitz counts from PFR charting',
      basis: basisLine(pair),
      home: side(home, h, pair?.home),
      away: side(away, a, pair?.away),
      reading_note: 'Pressures with few sacks means a rush that is winning without finishing. Blitz count separates a rusher who wins alone from one the scheme has to send.'
    };
  },

  // ── The lanes that were named one thing and returned another ──────────────

  OFFENSIVE_EPA: async (bdlSport, home, away, season) => {
    const pair = await advancedPair(bdlSport, home, away, season);
    const { homeStats, awayStats } = await bdlPair(bdlSport, home, away, season);
    const side = (team, stats, led) => ({
      team: named(team),
      points_per_game: fmtNum(stats?.total_points_per_game),
      yards_per_game: fmtNum(stats?.total_offensive_yards_per_game),
      ...(led?.offense?.overall ? {
        epa_per_play: led.offense.overall.epa_per_play,
        success_rate: led.offense.overall.success_rate,
        yards_per_play: led.offense.overall.yards_per_play,
        explosive_play_rate: led.offense.overall.explosive_rate,
        plays: led.offense.overall.plays,
        pass_rate_over_expected: led.offense.pass_rate_over_expected,
        shotgun_rate: led.offense.shotgun_rate,
        no_huddle_rate: led.offense.no_huddle_rate
      } : { epa_note: 'No play ledger for this team.' })
    });
    return {
      category: 'Offensive Efficiency',
      data_scope: pair?.ledger
        ? 'Real expected points added per play, computed from every snap'
        : 'Season points and yards (expected points added unavailable)',
      basis: pair ? basisLine(pair) : null,
      home: side(home, homeStats, pair?.home),
      away: side(away, awayStats, pair?.away),
      reading_note: 'Pass rate over expected is how much more or less a team throws than the down, distance and score call for — a scheme signature, not a quality measure.'
    };
  },

  /**
   * Defence, rebuilt.
   *
   * This lane returned two numbers — opponent points and opponent yards per
   * game — while 72 defensive fields sat unread in the same BDL row. The ones
   * added here are the ones a bettor actually asks for: what quarterbacks
   * post against this defence, where it gives up first downs, and whether it
   * is beaten through the air or on the ground.
   */
  DEFENSIVE_EPA: async (bdlSport, home, away, season) => {
    const pair = await advancedPair(bdlSport, home, away, season);
    const { homeStats, awayStats } = await bdlPair(bdlSport, home, away, season);

    const side = (team, s, led) => ({
      team: named(team),
      points_allowed_per_game: fmtNum(s?.opp_total_points_per_game),
      yards_allowed_per_game: fmtNum(s?.opp_total_offensive_yards_per_game),
      // The fields that were sitting unread.
      opp_passer_rating: fmtNum(s?.opp_passing_qb_rating, 1),
      opp_completion_pct: fmtPct((s?.opp_passing_completion_pct ?? null) === null ? null : s.opp_passing_completion_pct / 100),
      opp_yards_per_pass_attempt: fmtNum(s?.opp_yards_per_pass_attempt, 2),
      opp_net_yards_per_pass_attempt: fmtNum(s?.opp_net_yards_per_pass_attempt, 2),
      opp_passing_touchdowns: fmtNum(s?.opp_passing_touchdowns, 0),
      opp_rushing_touchdowns: fmtNum(s?.opp_rushing_touchdowns, 0),
      opp_passing_yards_per_game: fmtNum(s?.opp_passing_yards_per_game),
      opp_rushing_yards_per_game: fmtNum(s?.opp_rushing_yards_per_game),
      first_downs_allowed_passing: fmtNum(s?.opp_misc_first_downs_passing, 0),
      first_downs_allowed_rushing: fmtNum(s?.opp_misc_first_downs_rushing, 0),
      ...(led?.defense?.overall ? {
        epa_per_play_allowed: led.defense.overall.epa_per_play,
        success_rate_allowed: led.defense.overall.success_rate,
        yards_per_play_allowed: led.defense.overall.yards_per_play,
        explosive_rate_allowed: led.defense.overall.explosive_rate,
        plays_faced: led.defense.overall.plays
      } : {})
    });

    return {
      category: 'Defensive Efficiency',
      data_scope: pair?.ledger
        ? 'Real expected points added allowed per play, plus the full opponent season profile'
        : 'Opponent season profile (expected points added unavailable)',
      basis: pair ? basisLine(pair) : null,
      home: side(home, homeStats, pair?.home),
      away: side(away, awayStats, pair?.away),
      reading_note: 'The gap between yards per pass attempt and NET yards per pass attempt is sack impact. First downs allowed passing versus rushing says where a defence actually bleeds, which points allowed per game cannot.'
    };
  },

  SUCCESS_RATE_OFFENSE: async (bdlSport, home, away, season) => {
    const pair = await advancedPair(bdlSport, home, away, season);
    const { homeStats, awayStats } = await bdlPair(bdlSport, home, away, season);
    const side = (team, s, led) => ({
      team: named(team),
      third_down_pct: fmtPct((s?.misc_third_down_conv_pct ?? null) === null ? null : s.misc_third_down_conv_pct / 100),
      third_down_att: fmtNum(s?.misc_third_down_attempts, 0),
      third_down_made: fmtNum(s?.misc_third_down_convs, 0),
      ...(led?.offense ? {
        per_play_success_rate: led.offense.overall?.success_rate,
        early_down_success: led.offense.splits?.early_down?.success_rate ?? null,
        third_and_long_success: led.offense.splits?.third_and_long?.success_rate ?? null,
        third_and_short_success: led.offense.splits?.third_and_short?.success_rate ?? null
      } : {})
    });
    return {
      category: 'Offensive Success Rate',
      data_scope: pair?.ledger
        ? 'Per-play success rate from the play ledger, with down conversion alongside'
        : 'Third and fourth down conversion only (per-play success rate unavailable)',
      basis: pair ? basisLine(pair) : null,
      home: side(home, homeStats, pair?.home),
      away: side(away, awayStats, pair?.away),
      reading_note: 'Per-play success rate and third-down conversion measure different things. A team can convert third downs well because it rarely faces them.'
    };
  },

  SUCCESS_RATE_DEFENSE: async (bdlSport, home, away, season) => {
    const pair = await advancedPair(bdlSport, home, away, season);
    const { homeStats, awayStats } = await bdlPair(bdlSport, home, away, season);
    const side = (team, s, led) => ({
      team: named(team),
      opp_third_down_pct: fmtPct((s?.opp_misc_third_down_conv_pct ?? null) === null ? null : s.opp_misc_third_down_conv_pct / 100),
      opp_fourth_down_pct: fmtPct((s?.opp_misc_fourth_down_conv_pct ?? null) === null ? null : s.opp_misc_fourth_down_conv_pct / 100),
      opp_third_down_att: fmtNum(s?.opp_misc_third_down_attempts, 0),
      opp_third_down_made: fmtNum(s?.opp_misc_third_down_convs, 0),
      ...(led?.defense ? {
        per_play_success_rate_allowed: led.defense.overall?.success_rate,
        early_down_success_allowed: led.defense.splits?.early_down?.success_rate ?? null,
        third_and_long_success_allowed: led.defense.splits?.third_and_long?.success_rate ?? null,
        third_and_short_success_allowed: led.defense.splits?.third_and_short?.success_rate ?? null
      } : {})
    });
    return {
      category: 'Defensive Success Rate',
      data_scope: pair?.ledger
        ? 'Per-play success rate allowed, with opponent down conversion alongside'
        : 'Opponent third and fourth down conversion only',
      basis: pair ? basisLine(pair) : null,
      home: side(home, homeStats, pair?.home),
      away: side(away, awayStats, pair?.away),
      reading_note: 'Success rate allowed on early downs is what forces third and long. A defence that is good on third down but poor on early downs is surviving, not dominating.'
    };
  },

  /** A red-zone lane that finally contains red-zone data. */
  RED_ZONE_DEFENSE: async (bdlSport, home, away, season) => {
    const pair = await advancedPair(bdlSport, home, away, season);
    const { homeStats, awayStats } = await bdlPair(bdlSport, home, away, season);
    const side = (team, s, led) => ({
      team: named(team),
      points_allowed_per_game: fmtNum(s?.opp_total_points_per_game),
      takeaways: fmtNum(s?.misc_total_takeaways, 0),
      sacks: fmtNum(s?.opp_passing_sacks, 0),
      opp_rushing_touchdowns: fmtNum(s?.opp_rushing_touchdowns, 0),
      opp_passing_touchdowns: fmtNum(s?.opp_passing_touchdowns, 0),
      ...(led?.defense?.splits ? {
        red_zone_allowed: led.defense.splits.red_zone,
        inside_ten_allowed: led.defense.splits.inside_ten,
        goal_to_go_allowed: led.defense.splits.goal_to_go
      } : { red_zone_note: 'No play ledger for this team.' })
    });
    return {
      category: 'Red Zone Defence',
      data_scope: pair?.ledger
        ? 'Snaps inside the 20, inside the 10, and goal-to-go, from the play ledger'
        : 'Season opponent scoring only — red-zone splits unavailable',
      basis: pair ? basisLine(pair) : null,
      home: side(home, homeStats, pair?.home),
      away: side(away, awayStats, pair?.away)
    };
  },

  /** Takeaways, plus the coverage line that names who is being beaten. */
  DEFENSIVE_PLAYMAKERS: async (bdlSport, home, away, season) => {
    const { homeStats, awayStats } = await bdlPair(bdlSport, home, away, season);
    const isNfl = bdlSport === 'americanfootball_nfl';
    const [h, a] = isNfl
      ? await Promise.all([getPassRushAndCoverage(named(home), season), getPassRushAndCoverage(named(away), season)])
      : [{ unavailable: true, reason: 'PFR charting covers the NFL only.' }, { unavailable: true, reason: 'PFR charting covers the NFL only.' }];

    const side = (team, s, res) => {
      const out = {
        team: named(team),
        interceptions: fmtNum(s?.defensive_interceptions, 0),
        fumble_recoveries: fmtNum(s?.fumbles_recovered, 0),
        sacks: fmtNum(s?.opp_passing_sacks, 0),
        total_takeaways: fmtNum(s?.misc_total_takeaways, 0),
        turnover_differential: fmtNum(s?.misc_turnover_differential, 0)
      };
      if (res.unavailable) out.coverage_note = res.reason;
      else {
        out.pass_rushers = res.pass_rush.slice(0, 4);
        out.coverage = res.coverage.map((c) => ({
          player: c.player,
          position: c.position,
          targets: c.targets,
          completion_pct_allowed: c.completion_pct_allowed,
          yards_per_target: c.yards_per_target,
          touchdowns_allowed: c.touchdowns_allowed,
          interceptions: c.interceptions,
          passer_rating_allowed: c.passer_rating_allowed,
          average_depth_of_target: c.average_depth_of_target
        }));
      }
      return out;
    };

    return {
      category: 'Defensive Playmaking and Coverage',
      data_scope: 'Season takeaways from BDL; per-defender pass rush and coverage from PFR charting',
      home: side(home, homeStats, h),
      away: side(away, awayStats, a),
      reading_note: 'Passer rating allowed is what quarterbacks post when throwing at that defender. A high rating on high targets is a matchup being attacked on purpose; a low rating on high targets is a defender being tested and winning.'
    };
  },

  EXPLOSIVE_PLAYS: async (bdlSport, home, away, season) => {
    const pair = await advancedPair(bdlSport, home, away, season);
    const { homeStats, awayStats } = await bdlPair(bdlSport, home, away, season);
    const side = (team, s, led) => ({
      team: named(team),
      longest_pass: fmtNum(s?.passing_long, 0),
      longest_rush: fmtNum(s?.rushing_long, 0),
      yards_per_catch: fmtNum(s?.receiving_yards_per_reception, 1),
      yards_per_carry: fmtNum(s?.rushing_yards_per_rush_attempt, 1),
      ...(led?.offense?.overall ? {
        explosive_play_rate: led.offense.overall.explosive_rate,
        plays: led.offense.overall.plays
      } : {})
    });
    return {
      category: 'Explosive Plays',
      data_scope: pair?.ledger
        ? 'Explosive rate is the share of snaps gaining 20 or more through the air, 10 or more on the ground'
        : 'Longest plays and per-attempt averages only',
      basis: pair ? basisLine(pair) : null,
      home: side(home, homeStats, pair?.home),
      away: side(away, awayStats, pair?.away),
      reading_note: 'The longest play of a season is one snap. The rate is the tendency.'
    };
  },

  EXPLOSIVE_ALLOWED: async (bdlSport, home, away, season) => {
    const pair = await advancedPair(bdlSport, home, away, season);
    const { homeStats, awayStats } = await bdlPair(bdlSport, home, away, season);
    const side = (team, s, led) => ({
      team: named(team),
      opp_longest_reception: fmtNum(s?.opp_receiving_long, 0),
      opp_yards_per_pass_attempt: fmtNum(s?.opp_yards_per_pass_attempt, 2),
      ...(led?.defense?.overall ? {
        explosive_rate_allowed: led.defense.overall.explosive_rate,
        plays_faced: led.defense.overall.plays,
        yards_per_play_allowed: led.defense.overall.yards_per_play
      } : {})
    });
    return {
      category: 'Explosive Plays Allowed',
      data_scope: pair?.ledger ? 'Share of opponent snaps that went for an explosive gain' : 'Opponent per-attempt averages only',
      basis: pair ? basisLine(pair) : null,
      home: side(home, homeStats, pair?.home),
      away: side(away, awayStats, pair?.away)
    };
  },

  /** Sacks were the whole lane. Pressure is the rest of it. */
  PRESSURE_RATE: async (bdlSport, home, away, season) => {
    const pair = await advancedPair(bdlSport, home, away, season);
    const { homeStats, awayStats } = await bdlPair(bdlSport, home, away, season);
    const isNfl = bdlSport === 'americanfootball_nfl';
    const [hRush, aRush, hQb, aQb] = isNfl
      ? await Promise.all([
        getPassRushAndCoverage(named(home), season),
        getPassRushAndCoverage(named(away), season),
        getQbPressureProfile(named(home), season),
        getQbPressureProfile(named(away), season)
      ])
      : [{ unavailable: true }, { unavailable: true }, { unavailable: true }, { unavailable: true }];

    const side = (team, s, led, rush, qb) => {
      const out = {
        team: named(team),
        sacks_made: fmtNum(s?.opp_passing_sacks, 0),
        sacks_allowed: fmtNum(s?.passing_sacks, 0),
        sack_yards_forced: fmtNum(s?.opp_passing_sack_yards_lost, 0),
        sack_yards_allowed: fmtNum(s?.passing_sack_yards_lost, 0)
      };
      if (led) {
        out.qb_hit_rate_generated = led.defense?.qb_hit_rate ?? null;
        out.qb_hit_rate_allowed = led.offense?.qb_hit_rate ?? null;
        out.sack_rate_generated = led.defense?.sack_rate ?? null;
        out.sack_rate_allowed = led.offense?.sack_rate ?? null;
      }
      if (!rush?.unavailable) out.top_pass_rushers = rush.pass_rush.slice(0, 3);
      if (!qb?.unavailable) {
        const lead = qb.quarterbacks[0];
        out.qb_pressure_faced_pct = lead?.pressure_pct ?? null;
        out.qb_pocket_time_seconds = lead?.pocket_time_seconds ?? null;
      }
      return out;
    };

    return {
      category: 'Pressure and Sacks',
      data_scope: 'Sacks from BDL, QB hit rate from play-by-play, pressures and hurries from PFR charting',
      basis: pair ? basisLine(pair) : null,
      home: side(home, homeStats, pair?.home, hRush, hQb),
      away: side(away, awayStats, pair?.away, aRush, aQb),
      reading_note: 'QB hit rate is hits per dropback, so it is comparable between teams that face different pass volumes. Sack totals are not.'
    };
  },

  /** Which quarterback the season numbers actually describe. */
  ROSTER_CONTINUITY: async (bdlSport, home, away, season) => {
    const pair = await advancedPair(bdlSport, home, away, season);
    if (!pair || !pair.ledger) {
      return unavailable('Roster Continuity', home, away,
        pair?.note || 'The play ledger covers the NFL only.');
    }
    return {
      category: 'Roster Continuity',
      data_scope: 'Which quarterback started which game, from the play ledger',
      basis: basisLine(pair),
      home: { team: named(home), ...(continuityFor(pair, 'home') || { note: 'No starter timeline available.' }) },
      away: { team: named(away), ...(continuityFor(pair, 'away') || { note: 'No starter timeline available.' }) },
      reading_note: 'A season average built across a quarterback change describes a team that no longer exists. Where more than one starter appears, the season rate is a blend and should be read as one.'
    };
  },

  // ── The game ledger, and the records that cite it ─────────────────────────

  /**
   * THE canonical list of what happened, once.
   *
   * Every record token points into this by reference rather than re-printing
   * its own copy of the season. That is the founder's constraint held in both
   * directions: no record without its games, and no game repeated five times.
   */
  NFL_GAME_LEDGER: async (bdlSport, home, away, season) => {
    const pair = await advancedPair(bdlSport, home, away, season);
    const [homeLedger, awayLedger] = await Promise.all([
      ledgerFor(bdlSport, home, season, pair, 'home'),
      ledgerFor(bdlSport, away, season, pair, 'away')
    ]);
    const side = (team, led) => (led ? {
      team: named(team),
      games_on_file: led.games.length,
      ledger: ledgerLines(led)
    } : { team: named(team), note: 'No completed games on file this season.' });
    return {
      category: 'Game Ledger',
      data_scope: 'Every completed game this season, newest first, each with a reference tag. Records elsewhere cite these tags instead of repeating the games.',
      basis: pair ? basisLine(pair) : null,
      home: side(home, homeLedger),
      away: side(away, awayLedger),
      reading_note: 'A tag like G3 means the third-most-recent game. When a record cites tags, look them up here rather than treating the record as a fact on its own.'
    };
  },

  /**
   * Recency, football-shaped: the last three games INDIVIDUALLY, with the
   * rolling one, three and five game windows beside them.
   */
  NFL_RECENT_FORM: async (bdlSport, home, away, season) => {
    const pair = await advancedPair(bdlSport, home, away, season);
    const [homeLedger, awayLedger] = await Promise.all([
      ledgerFor(bdlSport, home, season, pair, 'home'),
      ledgerFor(bdlSport, away, season, pair, 'away')
    ]);
    const side = (team, led) => {
      const strip = recencyStrip(led, { games: 3, windows: [1, 3, 5] });
      return strip
        ? { team: named(team), ...strip }
        : { team: named(team), note: 'No completed games found.' };
    };
    return {
      category: 'Recent Form',
      data_scope: 'The last three games one at a time, plus rolling one, three and five game windows',
      basis: pair ? basisLine(pair) : null,
      home: side(home, homeLedger),
      away: side(away, awayLedger)
    };
  },

  /**
   * Primetime, as a record AND as the games behind it.
   *
   * This is the lane the founder used to make the general point: a primetime
   * record is worth showing, but only once Gary can see WHICH games it is
   * made of and how they went.
   */
  PRIMETIME_RECORD: async (bdlSport, home, away, season) => {
    const pair = await advancedPair(bdlSport, home, away, season);
    const [homeLedger, awayLedger] = await Promise.all([
      ledgerFor(bdlSport, home, season, pair, 'home'),
      ledgerFor(bdlSport, away, season, pair, 'away')
    ]);
    const side = (team, led) => {
      if (!led) return { team: named(team), note: 'No completed games on file.' };
      const slice = recordSlice(led, (raw) => isNightGame(raw.date), 'Primetime');
      const cited = slice.games.map((ref) => led.byRef.get(ref)).filter(Boolean);
      return {
        team: named(team),
        ...slice,
        // The cited games are rendered HERE because primetime is the one
        // record whose sample is small enough that the games are the point.
        cited_games: cited.map((g) => `[${g.ref}] ${g.week} — ${g.account}`)
      };
    };
    return {
      category: 'Primetime Record',
      data_scope: 'Games kicking off at or after 8pm Eastern, with the games themselves',
      home: side(home, homeLedger),
      away: side(away, awayLedger),
      reading_note: 'Night games are a handful of games a season. The record on its own is close to meaningless at that sample size; what the games say about how the team played is not.'
    };
  }
};
