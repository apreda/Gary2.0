import { completedPlayerCardGameIds } from './playerCardStorage.js';

const HOUR = 3_600_000;
const leagueOf = row => String(row?.league || ({ baseball_mlb: 'MLB', americanfootball_nfl: 'NFL', americanfootball_ncaaf: 'NCAAF', basketball_nba: 'NBA' })[row?.sport] || '').toUpperCase();
const idOf = row => row?.bdl_game_id ?? row?.game_id;
const keyOf = row => `${leagueOf(row)}|${idOf(row)}`;
const rowsOf = value => Array.isArray(value) ? value : [];
const timestamp = row => Date.parse(row?.updated_at || row?.created_at || '');
const hasGrade = row => ['WON', 'LOST', 'WIN', 'LOSS', 'PUSH', 'PUSHED', 'W', 'L', 'P', 'VOID', 'CANCELLED'].includes(String(row?.result || '').toUpperCase());
const hasPick = row => row?.pick && !['PASS', 'PENDING', 'NO PICK'].includes(String(row.pick).trim().toUpperCase());
const recapKey = row => `${leagueOf(row)}|${row.game_date}|${row.matchup}|${row.pick_text}`;

export function etDate(value = new Date()) {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
export function dateBefore(date, days = 1) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

/** Read-only, paginated snapshots. Each failed table remains an explicit error;
 * a permission failure or a truncated read must never become an empty day.
 */
export async function loadMorningHealth({ url, key, date, fetchImpl = fetch, signal = AbortSignal.timeout(75_000) }) {
  const yesterday = dateBefore(date);
  const since = `gte.${yesterday}`;
  const specs = {
    slate: ['daily_slate', { select: 'date,league,bdl_game_id,commence_time,created_at,game_status,kickoff_status', date: `eq.${date}` }],
    board: ['tomorrow_board', { select: 'date,game_count,board,updated_at', date: `eq.${date}` }, 'date'],
    insights: ['insight_connections', { select: 'date,league,game_id,player_id,category,created_at,updated_at', date: `eq.${date}` }],
    cards: ['player_insight_cards', { select: 'date,league,game_id,player_id,payload,created_at', date: `eq.${date}` }],
    wire: ['wire_items', { select: 'date,league,created_at', date: `eq.${date}` }],
    pulse: ['league_pulse', { select: 'date,league,tab,updated_at,created_at', date: `eq.${date}` }],
    picks: ['daily_picks', { select: 'date,picks', date: since }],
    weekly: ['weekly_nfl_picks', { select: 'week_start,picks', week_start: `gte.${dateBefore(date, 7)}` }],
    results: ['game_results', { select: 'game_date,league,game_id,result,matchup,pick_text,created_at,updated_at', game_date: `eq.${yesterday}` }],
    nflResults: ['nfl_results', { select: 'game_date,game_id,result,matchup,pick_text,created_at,updated_at', game_date: `eq.${yesterday}` }],
    recaps: ['game_recaps', { select: 'game_date,league,matchup,pick_text,created_at', game_date: `eq.${yesterday}` }],
  };
  const data = {};
  const errors = {};
  await Promise.all(Object.entries(specs).map(async ([name, [table, params, order = 'id']]) => {
    try {
      const collected = [];
      for (let offset = 0; offset < 50_000; offset += 500) {
        signal.throwIfAborted();
        const endpoint = new URL(`${url.replace(/\/$/, '')}/rest/v1/${table}`);
        endpoint.search = new URLSearchParams({ ...params, order: `${order}.asc`, limit: '500', offset: String(offset) });
        const response = await fetchImpl(endpoint, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        });
        if (!response.ok) throw new Error(`${table} HTTP ${response.status}`);
        const page = await response.json();
        signal.throwIfAborted();
        if (!Array.isArray(page)) throw new Error(`${table} returned a non-array response`);
        collected.push(...page);
        if (page.length < 500) { data[name] = collected; return; }
      }
      throw new Error(`${table} pagination limit reached; coverage unverified`);
    } catch (error) { errors[name] = error.message; }
  }));
  return { data, errors };
}

/** Output health, not betting quality. Frozen valid results remain valid even
 * when graded before 2AM; absence is assessed against the actual saved picks.
 */
export function evaluateMorningHealth({ date, now = new Date(), data = {}, errors = {}, maxAgeHours = 8, cardsLeadHours = 2 }) {
  const nowMs = new Date(now).getTime();
  const yesterday = dateBefore(date);
  const checks = [];
  const add = (id, status, evidence, details = {}) => checks.push({ id, status, evidence, ...details });
  const fresh = row => Number.isFinite(timestamp(row)) && nowMs - timestamp(row) <= maxAgeHours * HOUR && timestamp(row) <= nowMs + 60_000;
  for (const [name, error] of Object.entries(errors)) add(`read:${name}`, 'fail', error);
  const slate = rowsOf(data.slate).filter(row => row.date === date && !['cancelled', 'canceled', 'postponed'].includes(String(row.game_status || '').toLowerCase()));
  const board = rowsOf(data.board).find(row => row.date === date);
  const boardGames = rowsOf(board?.board);
  const leagues = [...new Set([...slate, ...boardGames].map(leagueOf).filter(Boolean))].sort();
  if (!errors.slate && !slate.length) add('slate', board && board.game_count === 0 ? 'ok' : 'warn', 'No scheduled games in daily_slate; a matching empty board is needed to verify a quiet day.');
  if (!errors.board) {
    const missing = slate.filter(row => !boardGames.some(game => keyOf(game) === keyOf(row)));
    add('board', board && fresh(board) && !missing.length ? 'ok' : 'fail', `${boardGames.length}/${slate.length} slate games on today's board; updated ${board?.updated_at || 'never'}`, { missing_game_ids: missing.map(idOf) });
  }
  const daily = rowsOf(data.picks).flatMap(row => rowsOf(row.picks).map(pick => ({ ...pick, saved_date: row.date })));
  const weekly = rowsOf(data.weekly).flatMap(row => rowsOf(row.picks).map(pick => ({ ...pick, league: 'NFL' })));
  const allPicks = [...daily, ...weekly].filter(hasPick);
  for (const league of leagues) {
    const games = slate.filter(row => leagueOf(row) === league);
    const insights = rowsOf(data.insights).filter(row => leagueOf(row) === league);
    const cards = rowsOf(data.cards).filter(row => leagueOf(row) === league);
    const cardIds = new Set(cards.filter(row => row.game_id != null).map(row => String(row.game_id)));
    const covered = games.filter(row => cardIds.has(String(idOf(row))));
    const due = games.filter(row => Number.isFinite(Date.parse(row.commence_time)) && Date.parse(row.commence_time) <= nowMs + cardsLeadHours * HOUR);
    const missingDue = due.filter(row => !cardIds.has(String(idOf(row))));
    const marked = cards.filter(row => row.payload?.card_build?.version === 1);
    const complete = completedPlayerCardGameIds(cards);
    const incompleteDue = due.filter(row => marked.some(card => String(card.game_id) === String(idOf(row))) && !complete.has(String(idOf(row))));
    if (!errors.insights) add(`insights:${league}`, insights.some(fresh) ? 'ok' : games.length ? 'fail' : 'warn', `${insights.length} rows across ${new Set(insights.map(row => row.game_id).filter(Boolean)).size}/${games.length} games; signal categories are conditional, so every game need not produce a row.`);
    if (!errors.cards) add(`cards:${league}`, missingDue.length || incompleteDue.length ? 'fail' : covered.length < games.length || (cards.length && !cards.some(fresh)) ? 'warn' : 'ok', `${covered.length}/${games.length} games have cards; ${league === 'NCAAF' ? `${complete.size} games verified complete; ` : ''}${missingDue.length} due games missing and ${incompleteDue.length} due games partial (due = kickoff within ${cardsLeadHours}h).`, { missing_game_ids: games.filter(row => !cardIds.has(String(idOf(row)))).map(idOf) });
    if (!errors.pulse && ['NFL', 'NCAAF'].includes(league) && games.length) {
      const pulse = rowsOf(data.pulse).filter(row => leagueOf(row) === league);
      add(`pulse:${league}`, pulse.some(fresh) ? 'ok' : 'fail', `${pulse.length} current-date league tabs; newest ${pulse.map(row => row.updated_at || row.created_at).sort().at(-1) || 'never'}`);
    }
    if (!errors.wire && games.length) {
      const wire = rowsOf(data.wire).filter(row => leagueOf(row) === league);
      // No qualifying news is possible. The stage journal distinguishes that
      // legitimate outcome from a failed generation; never fabricate content.
      add(`wire:${league}`, wire.some(fresh) ? 'ok' : 'warn', `${wire.length} current-date items; ${wire.length ? 'check freshness' : 'empty feed: inspect Wire stage status before diagnosing provider failure'}`);
    }
    if (!errors.picks && (league !== 'NFL' || !errors.weekly)) {
      const picked = games.filter(game => allPicks.some(pick => keyOf(pick) === keyOf(game) && (pick.saved_date === date || (pick.commence_time && etDate(pick.commence_time) === date))));
      const missing = games.filter(game => !picked.includes(game));
      const started = missing.filter(game => Date.parse(game.commence_time) <= nowMs);
      add(`picks:${league}`, started.length ? 'fail' : missing.length ? 'pending' : 'ok', `${picked.length}/${games.length} published; ${started.length} started without a saved pick; ${missing.length - started.length} still pregame.`, { missing_started_game_ids: started.map(idOf) });
    }
  }
  const results = [...new Map([...rowsOf(data.results), ...rowsOf(data.nflResults).map(row => ({ ...row, league: 'NFL' }))]
    .filter(hasGrade).map(row => [`${row.game_date}|${keyOf(row)}|${row.pick_text}`, row])).values()];
  const ydayPicks = allPicks.filter(pick => pick.saved_date === yesterday || (pick.commence_time && etDate(pick.commence_time) === yesterday));
  if (!errors.results && !errors.nflResults && !errors.picks && !errors.weekly) {
    const missing = ydayPicks.filter(pick => !results.some(row => row.game_date === yesterday && idOf(row) != null && idOf(pick) != null && keyOf(row) === keyOf(pick) && row.pick_text === pick.pick));
    add('results', missing.length ? 'warn' : 'ok', `${results.length} settled rows for ${yesterday}; ${missing.length} saved tickets without an exact-game grade (pending/postponed status needs inspection).`, { missing_game_ids: [...new Set(missing.map(idOf))] });
  }
  if (!errors.recaps && !errors.results && !errors.nflResults) {
    const keys = new Set(rowsOf(data.recaps).map(recapKey));
    const missing = results.filter(row => !keys.has(recapKey(row)));
    add('recaps', missing.length ? 'warn' : 'ok', `${results.length - missing.length}/${results.length} settled game rows have matching recaps; optional narrative availability is separate from grading.`);
  }
  const status = checks.some(check => check.status === 'fail') ? 'fail' : checks.some(check => check.status === 'warn') ? 'warn' : 'ok';
  return { date, checked_at: new Date(nowMs).toISOString(), status, checks };
}
