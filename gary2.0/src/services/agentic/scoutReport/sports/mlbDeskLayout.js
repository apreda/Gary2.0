/**
 * THE THREE-BUCKET DESK (founder GO, Sep 1 2026): the same facts the flat
 * desk carries, regrouped the way a bettor reads a game —
 *
 *   THE TEAMS      who they are: one whole dossier per club, home first
 *   THE MATCHUP    tonight's game: series, the park and its weather, schedule
 *                  and rest, the day's news — nothing restated from the
 *                  team blocks. (A separate SITUATION bucket lived for one
 *                  build — founder, same day: the two were splitting one
 *                  subject; rest said "game 1 of series" beside series state.)
 *   THE MARKET     the price — last, by the Sep 1 ruling (BETTING CONTEXT
 *                  rides the desk end so Gary reads the game before the odds)
 *
 * This module only ARRANGES pieces the builder in mlb.js already made; it
 * writes no facts of its own. Every required piece that arrives empty prints
 * an honest-absence line in the manifest's dialect ("treat as missing") so a
 * broken lane is loud, never a quiet gap. Optional pieces simply do not print.
 *
 * Layout selection: `options.deskLayout`, then GARY_MLB_DESK_LAYOUT, default
 * BUCKETS — production since Sep 2 2026 (founder: "make sure picks tonight
 * will be the updated MLB system"). GARY_MLB_DESK_LAYOUT=legacy is the
 * opt-out back to the flat desk.
 */

export const DESK_LAYOUTS = ['legacy', 'buckets'];

export function resolveDeskLayout(options = {}) {
  const pick = (v) => (DESK_LAYOUTS.includes(String(v || '').trim()) ? String(v).trim() : null);
  return pick(options.deskLayout) || pick(process.env.GARY_MLB_DESK_LAYOUT) || 'buckets';
}

// Team-block subsections in reading order. The manifest expects each once
// per club; the test suite pins the order.
// (Founder, Sep 1: no separate Catcher or Defense subsections — the
// starting catcher's running-game line rides his lineup row, and the
// fielding numbers ride Season stats.)
// RECENCY FIRST (founder, Sep 1 2026 — "a real human looking at a game
// tonight is going to think more about what's been happening lately"):
// each club opens with what is happening right now — the streak, the last
// games as games, the last turn through the rotation — and the season
// follows as the backdrop. Inside every subsection the same order holds:
// the newest fact leads, the season line closes.
export const TEAM_SUBSECTIONS = [
  'Right now',
  'Where they stand',
  'Season stats',
  "Tonight's lineup",
  "Tonight's starter",
  'The pen',
  'Injuries',
  'Roster moves',
];

export const MATCHUP_SUBSECTIONS = ['Series state', 'The park', 'Schedule and rest', "Today's news"];
export const MARKET_SUBSECTIONS = ['Betting context'];

const BAR = '━'.repeat(66);
const bucket = (title, tagline) => `${BAR}\n${title} — ${tagline}\n${BAR}`;
const teamHead = (name) => `═══ ${String(name || '').toUpperCase()} ═══`;
const sub = (label, body) => `── ${label} ──\n${body}`;
const has = (s) => typeof s === 'string' && s.trim().length > 0;
const absent = (what) => `${what} unavailable this run — treat as missing data, not as a quiet lane.`;
const joinBlocks = (parts) => parts.filter(has).join('\n\n');

/**
 * One club's whole dossier. `t` carries the per-team halves the builder
 * collected; every field is a string or null.
 */
function renderTeam(t) {
  const name = t.name;
  const blocks = [teamHead(name)];

  blocks.push(sub('Right now', joinBlocks([
    has(t.spot) ? t.spot : null,
    has(t.recentForm) ? t.recentForm : `${name}: ${absent('recent games')}`,
    has(t.runShape) ? t.runShape : null,
    has(t.recentResults) ? t.recentResults : null,
    has(t.lastNight) ? `As written:\n${t.lastNight}` : null,
    has(t.boxScores) ? t.boxScores : null,
  ])));

  blocks.push(sub('Where they stand', has(t.stand) ? t.stand : `${name}: ${absent('standings context')}`));

  blocks.push(sub('Season stats', joinBlocks([
    has(t.seasonStats) ? t.seasonStats : `${name}: ${absent('team season stats')}`,
    has(t.defense) ? `Defense:\n${t.defense}` : null,
  ])));

  blocks.push(sub("Tonight's lineup", joinBlocks([
    has(t.lineup) ? t.lineup : `${name}: lineup not yet posted — treat as missing data, not as a quiet lane.`,
    has(t.bench) ? `Bench: ${t.bench}` : null,
  ])));

  blocks.push(sub("Tonight's starter", joinBlocks([
    has(t.starter) ? t.starter : `${name}: probable starter not yet announced — treat as missing data, not as a quiet lane.`,
    has(t.starterFlags) ? `Sample context: ${t.starterFlags}` : null,
    has(t.pitchTypes) ? `Pitch types (usage / whiff / xwOBA per pitch):\n${t.pitchTypes}` : `${name}: ${absent('starter pitch types')}`,
  ])));

  // THE PEN (founder GO, Sep 2 2026): the last games as games, then every
  // arm newest work first, then what the beat wrote. No season-first pen.
  blocks.push(sub('The pen', joinBlocks([
    has(t.penWorkload) ? `The last games, newest first, appearance by appearance:\n${t.penWorkload}` : `${name}: ${absent('bullpen workload')}`,
    has(t.pen) ? `Each arm, newest work first:\n${t.pen}` : `${name}: ${absent('pen arms')}`,
    has(t.penPress) ? `As reported:\n${t.penPress}` : null,
  ])));

  blocks.push(sub('Injuries', joinBlocks([
    has(t.injuries) ? t.injuries : `${name}: ${absent('structured injury data')}`,
    has(t.flags) ? t.flags : null,
  ])));

  blocks.push(sub('Roster moves', has(t.rosterMoves) ? t.rosterMoves : `${name}: ${absent('transaction data')}`));

  return blocks.join('\n\n');
}

function renderMatchup(m) {
  const series = joinBlocks([
    has(m.seriesState) ? m.seriesState : absent('Series state'),
    has(m.seasonSeries) ? m.seasonSeries : null,
    has(m.divisionGame) ? m.divisionGame : null,
    has(m.seriesStories) ? `This series, as written:\n${m.seriesStories}` : null,
    has(m.sharedLastNight) ? `Last night, these two, as written:\n${m.sharedLastNight}` : null,
    has(m.sharedBoxScores) ? m.sharedBoxScores : null,
  ]);
  return [
    bucket('THE MATCHUP', "tonight's game"),
    sub('Series state', series),
    // Weather rides the park — same physical place. It posts to the game
    // feed only near first pitch, so a pending line is not a broken lane.
    sub('The park', joinBlocks([
      has(m.park) ? m.park : absent('park profile'),
      has(m.weather) ? m.weather : 'Weather: not yet posted in the game feed for this build.',
    ])),
    sub('Schedule and rest', joinBlocks([
      has(m.scheduleShape) ? m.scheduleShape : absent('Schedule shape'),
      has(m.lookahead) ? `Looking ahead:\n${m.lookahead}` : null,
      has(m.rest) ? m.rest : absent('Rest data'),
    ])),
    sub("Today's news", joinBlocks([
      has(m.news) ? m.news : 'No same-day breaking news.',
      has(m.storylines) ? `— THE STORYLINES —\n${m.storylines}` : null,
    ])),
  ].join('\n\n');
}

function renderMarket(mk) {
  return [
    bucket('THE MARKET', 'the price'),
    sub('Betting context', has(mk.odds) ? mk.odds : absent('Odds')),
  ].join('\n\n');
}

/**
 * @param {object} p
 * @param {string} p.header    the matchup/venue/start lines (no series, no weather — those have buckets)
 * @param {object} p.home      per-team pieces, see renderTeam
 * @param {object} p.away
 * @param {object} p.matchup   { seriesState, seasonSeries, divisionGame, seriesStories, sharedLastNight,
 *                               sharedBoxScores, park, weather, scheduleShape, lookahead, rest, news, storylines }
 * @param {object} p.market    { odds }
 */
export function renderBucketsDesk(p) {
  const top = `${'═'.repeat(66)}\n${String(p.header || '').trim()}\n${'═'.repeat(66)}`;
  return [
    top,
    bucket('THE TEAMS', 'who they are'),
    renderTeam(p.home),
    renderTeam(p.away),
    renderMatchup(p.matchup || {}),
    renderMarket(p.market || {}),
  ].join('\n\n').trim();
}
