/**
 * What a season's worth of data is actually worth yet (Aug 25 2026).
 *
 * THE OPENING-WEEKEND PROBLEM. The play ledger is built from games that have
 * been played. On Sep 9 2026 — NFL Week 1 — no 2026 game exists, so every
 * situational split would be empty. By Week 3 they exist but rest on three
 * games, and a goal-line rate over nine snaps is not a tendency; it is noise
 * wearing a tendency's clothes. Presenting it as one is the same failure as
 * the fabricated zeros this audit started with: a confident number with
 * nothing behind it.
 *
 * THE POLICY, agreed with the founder Aug 25:
 *
 *   0 games      Use the PRIOR season, labelled as the prior season, and say
 *                plainly that nothing has been played yet. A labelled fact
 *                about last year beats a blank, and beats a fabricated rate.
 *   1-3 games    Current season is REPORTED BUT NOT TREATED AS A TENDENCY.
 *                The prior season rides alongside it so the two can be
 *                compared, and every split carries its play count.
 *   4-7 games    Current season leads, marked as still developing.
 *   8+ games     Current season stands on its own.
 *
 * Nothing here silently substitutes one season for another. The basis is
 * always stated in the payload, because a number from last season presented
 * as this season's is a lie regardless of how well it is computed.
 *
 * SAMPLE FLOORS. Separately from the phase, an individual split can be thin
 * even late in a season — goal-to-go snaps accumulate slowly. Every split is
 * therefore graded against a floor and carries the grade.
 */

/** Below this many plays a split is described, never characterised. */
export const SPLIT_FLOOR = 25;
/** Below this it is barely worth printing at all. */
export const SPLIT_NOISE = 10;

export const PHASES = {
  NOT_STARTED: 'not_started',
  EARLY: 'early',
  DEVELOPING: 'developing',
  ESTABLISHED: 'established'
};

export function phaseForGames(gamesPlayed) {
  const n = Number(gamesPlayed);
  if (!Number.isFinite(n) || n <= 0) return PHASES.NOT_STARTED;
  if (n <= 3) return PHASES.EARLY;
  if (n <= 7) return PHASES.DEVELOPING;
  return PHASES.ESTABLISHED;
}

/**
 * How a split should be spoken about, given how many plays it rests on.
 * Returned as a sentence rather than a flag so it survives into the prompt
 * without a formatting layer having to interpret an enum.
 */
export function reliabilityNote(plays) {
  const n = Number(plays) || 0;
  if (n === 0) return 'No snaps in this situation yet.';
  if (n < SPLIT_NOISE) return `Only ${n} snaps — far too few to describe a tendency; treat as an anecdote.`;
  if (n < SPLIT_FLOOR) return `${n} snaps — a thin sample; the rate is real but it is not yet a tendency.`;
  return null;
}

/** Attach the grade to every split in a side, in place-safe fashion. */
export function gradeSplits(side) {
  if (!side || !side.splits) return side;
  const splits = {};
  for (const [key, value] of Object.entries(side.splits)) {
    const note = reliabilityNote(value?.plays);
    splits[key] = note ? { ...value, reliability: note } : value;
  }
  return { ...side, splits };
}

/** Games a team appears in, from the ledger's game list. */
export function gamesPlayedFor(ledger, code) {
  if (!ledger || ledger.unavailable || !code) return 0;
  return (ledger.games || []).filter((g) => g.starters && Object.prototype.hasOwnProperty.call(g.starters, code)).length;
}

/**
 * Resolve which season's ledger should speak, and say so.
 *
 * @param {number} season the season being handicapped
 * @param {Function} load  (season) => Promise<ledger>
 * @param {string[]} codes team codes in the matchup
 * @returns {Promise<{basis:string, phase:string, season:number, ledger:Object|null,
 *                    priorLedger:Object|null, priorSeason:number, gamesPlayed:Object, note:string}>}
 */
export async function resolveSeasonContext(season, load, codes = []) {
  const current = await load(season);
  const gamesPlayed = {};
  let minGames = Infinity;

  if (current && !current.unavailable) {
    for (const code of codes) {
      const n = gamesPlayedFor(current, code);
      gamesPlayed[code] = n;
      if (n < minGames) minGames = n;
    }
    if (!codes.length) minGames = 0;
  }
  if (!Number.isFinite(minGames)) minGames = 0;

  const available = Boolean(current && !current.unavailable);
  const phase = available ? phaseForGames(minGames) : PHASES.NOT_STARTED;
  const priorSeason = season - 1;

  // The prior season is loaded whenever the current one cannot stand alone.
  const needsPrior = phase === PHASES.NOT_STARTED || phase === PHASES.EARLY;
  const prior = needsPrior ? await load(priorSeason) : null;
  const priorOk = Boolean(prior && !prior.unavailable);

  if (phase === PHASES.NOT_STARTED) {
    return {
      basis: priorOk ? 'prior_season' : 'none',
      phase,
      season,
      ledger: priorOk ? prior : null,
      priorLedger: priorOk ? prior : null,
      priorSeason,
      gamesPlayed,
      note: priorOk
        ? `No ${season} games have been played. Every split below is from the ${priorSeason} season and describes last year's team, not this one — rosters, coordinators and personnel change over an offseason.`
        : `No ${season} games have been played and the ${priorSeason} ledger is unavailable${current?.reason ? ` (${current.reason})` : ''}. No situational data exists for this matchup.`
    };
  }

  if (phase === PHASES.EARLY) {
    return {
      basis: 'current_thin',
      phase,
      season,
      ledger: current,
      priorLedger: priorOk ? prior : null,
      priorSeason,
      gamesPlayed,
      note: `Only ${minGames} game${minGames === 1 ? '' : 's'} of ${season} have been played. These splits are real but rest on a handful of snaps each and are NOT tendencies yet.`
        + (priorOk ? ` The ${priorSeason} season is included alongside for comparison; where the two disagree, the reason is more likely roster change than a small sample.` : '')
    };
  }

  return {
    basis: 'current',
    phase,
    season,
    ledger: current,
    priorLedger: null,
    priorSeason,
    gamesPlayed,
    note: phase === PHASES.DEVELOPING
      ? `${minGames} games into ${season}. Enough to describe how this team is playing, not yet a full-season profile.`
      : `${minGames} games into ${season}.`
  };
}
