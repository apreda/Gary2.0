/**
 * THE MLB DEEP READ — the football Aug-25 press build, brought to baseball
 * (founder GO, Aug 26: "do this for MLB please").
 *
 * The gap it closes: the scout report attaches editorial recaps to the
 * TEAM's last four games, but the PITCHERS — who carry most rationales —
 * never had a written account anywhere. That is how a 4.43-ERA starter got
 * presented as an ace through his park-flattered home split (Mariners ML,
 * Aug 26). The founder's direction is CONTEXT IN WRITTEN FORM over more
 * stats; the specific lane shapes here are the football design mirrored,
 * not a founder spec — retune lanes/wording freely as the direction firms.
 *
 * Four lanes per game, each a separate metered search with its own budget,
 * each handed the facts we already hold (KNOWN-OLD, the run-wire-items
 * pattern) so it spends searches on what the numbers cannot say:
 *   1. each team's last two games, as written;
 *   2. the AWAY probable's recent starts, as covered by writers;
 *   3. the HOME probable's recent starts, as covered by writers;
 *   4. this series/matchup right now, as written (says so when there is none).
 *
 * COST IS REAL AND LOGGED: up to ~20 searches per game against the metered
 * Anthropic API, ~15 MLB games a day. Lane count and budgets are parameters.
 * Every lane that returns nothing SAYS WHY — "no coverage found" and "rate
 * limited" are different facts (the throttled-slate lesson, a6ee9e28).
 */
import {
  GROUNDED_COVERAGE_RULES,
  groundedEtDate,
  groundedKnownBlock,
  runGroundedCoverageSearch,
} from './anthropicFootballGrounding.js';

const DEFAULT_TIMEOUT_MS = 100_000;

/** Lane budgets are env-tunable without a code change. */
const laneMaxUses = () => {
  const raw = Number(process.env.GARY_MLB_DEEP_MAX_USES);
  return Number.isInteger(raw) && raw > 0 ? raw : 5;
};

export const MLB_DEEP_LANES = [
  {
    key: 'last_games',
    label: 'THE LAST GAMES, AS WRITTEN',
    build: ({ homeTeam, awayTeam, known }) => `Use live web search to find what was WRITTEN about the last two completed games for each of ${homeTeam} and ${awayTeam}. Search each team separately.
${known}
For each game, report what the coverage said happened that a box score cannot carry:
- how the game was actually won or lost in the writer's account;
- the at-bats and innings that decided it, and whether they were earned or fortunate — a bloop that fell, a misplay behind a pitcher, a rally that died on a lineout;
- what the final score misrepresents, if anything: a starter whose line flattered him, a team outhit that still won, a blowout that was close into the seventh;
- what managers or players said afterwards, attributed.
${GROUNDED_COVERAGE_RULES}
Write one clearly labelled section per team.`,
    mustMention: ({ homeTeam, awayTeam }) => [homeTeam, awayTeam],
  },
  {
    key: 'away_probable',
    label: 'THE AWAY STARTER, AS COVERED',
    build: ({ awayTeam, awayProbable, known }) => `Use live web search to find what has been WRITTEN about ${awayProbable} of the ${awayTeam} — his recent starts and how he is actually throwing right now.
${known}
Report what the coverage says that his stat line cannot:
- how each of his last few starts actually went in the writers' accounts — dominant, laboring, lucky, or better than the line shows;
- what beat writers say about his stuff right now: velocity, command, a pitch that is or is not working;
- how his season has actually unfolded — stretches, adjustments, role or mechanics notes as reported;
- what he, his manager, or his catcher said about his recent outings, attributed.
${GROUNDED_COVERAGE_RULES}`,
    mustMention: ({ awayProbable }) => (awayProbable ? [String(awayProbable).trim().split(/\s+/).pop()] : []),
    requires: ({ awayProbable }) => Boolean(awayProbable),
  },
  {
    key: 'home_probable',
    label: 'THE HOME STARTER, AS COVERED',
    build: ({ homeTeam, homeProbable, known }) => `Use live web search to find what has been WRITTEN about ${homeProbable} of the ${homeTeam} — his recent starts and how he is actually throwing right now.
${known}
Report what the coverage says that his stat line cannot:
- how each of his last few starts actually went in the writers' accounts — dominant, laboring, lucky, or better than the line shows;
- what beat writers say about his stuff right now: velocity, command, a pitch that is or is not working;
- how his season has actually unfolded — stretches, adjustments, role or mechanics notes as reported;
- what he, his manager, or his catcher said about his recent outings, attributed.
${GROUNDED_COVERAGE_RULES}`,
    mustMention: ({ homeProbable }) => (homeProbable ? [String(homeProbable).trim().split(/\s+/).pop()] : []),
    requires: ({ homeProbable }) => Boolean(homeProbable),
  },
  {
    key: 'series_now',
    label: 'THIS SERIES, AS WRITTEN',
    build: ({ homeTeam, awayTeam, known }) => `Use live web search to find what has been WRITTEN about the current series or most recent meetings between ${awayTeam} and ${homeTeam}.
${known}
Report only what the coverage actually says:
- how the games between these clubs have actually gone — who has controlled them and how, in the writers' accounts;
- storylines the coverage attaches to this matchup right now, attributed;
- if there is no current series between them and no recent-meeting coverage, say exactly that.
${GROUNDED_COVERAGE_RULES}`,
    mustMention: ({ homeTeam, awayTeam }) => [homeTeam, awayTeam],
  },
];

/**
 * Run the MLB deep read. Same result contract as football's: every selected
 * lane appears in `lanes` — with text, or with an honest note saying WHY it
 * is empty. Returns null only when search is unavailable outright.
 *
 * @returns {Promise<{lanes: Array<{key,label,text,searches,note?}>, searches: number}|null>}
 */
export async function fetchMlbDeepCoverage({
  homeTeam,
  awayTeam,
  homeProbable = null,
  awayProbable = null,
  now = new Date(),
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  lanes = null,
  knownAccounts = null,
} = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || typeof fetchImpl !== 'function') {
    console.warn('[MLB Deep Read] Anthropic web search unavailable (missing API key or fetch)');
    return null;
  }

  const today = groundedEtDate(now, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const known = groundedKnownBlock(knownAccounts);
  const ctx = { homeTeam, awayTeam, homeProbable, awayProbable, known };
  const selected = (lanes ? MLB_DEEP_LANES.filter((l) => lanes.includes(l.key)) : MLB_DEEP_LANES)
    .filter((l) => (l.requires ? l.requires(ctx) : true));

  const sinks = selected.map(() => []);
  const settled = await Promise.allSettled(selected.map((lane, i) => runGroundedCoverageSearch({
    apiKey,
    fetchImpl,
    timeoutMs,
    label: `MLB Deep Read ${lane.key}`,
    prompt: `<date_anchor>Current ET date: ${today}.</date_anchor>\n\n${lane.build(ctx)}`,
    maxUses: laneMaxUses(),
    mustMention: lane.mustMention(ctx),
    minChars: 300,
    failures: sinks[i],
  })));

  const done = [];
  for (let i = 0; i < selected.length; i += 1) {
    const lane = selected[i];
    const outcome = settled[i];
    const value = outcome.status === 'fulfilled' ? outcome.value : null;
    if (value && value.data) {
      done.push({ key: lane.key, label: lane.label, text: value.data, searches: value.searchCount ?? null });
    } else {
      const why = outcome.status === 'rejected'
        ? `This lane failed: ${outcome.reason?.message || 'unknown error'}`
        : (sinks[i][0] ? `This lane returned nothing because ${sinks[i][0]}.` : 'No coverage was found for this lane.');
      done.push({ key: lane.key, label: lane.label, text: null, searches: 0, note: why });
    }
  }

  const withText = done.filter((l) => l.text);
  const searches = done.reduce((sum, l) => sum + (Number(l.searches) || 0), 0);
  const body = done.map((lane) => (
    lane.text ? `${lane.label}\n${lane.text}` : `${lane.label}\n(${lane.note})`
  )).join('\n\n');
  console.log(`[MLB Deep Read] ${withText.length}/${done.length} lanes returned coverage (${searches} searches)`);

  if (withText.length === 0) {
    // Every lane empty is itself a finding (the throttled-slate lesson):
    // a technical failure is REPORTED, never disguised as a quiet news week.
    const technical = done.some((l) => /rate limited|HTTP|request failed|continuation cap|failed/i.test(l.note || ''));
    if (!technical) return null;
    return {
      text: `No press coverage could be retrieved for this game. This is a retrieval failure, NOT a finding that the games were unremarkable — do not treat the absence as information.\n\n${body}`,
      lanes: done,
      searches,
      allFailed: true,
    };
  }
  return { text: body, lanes: done, searches };
}

export default fetchMlbDeepCoverage;
