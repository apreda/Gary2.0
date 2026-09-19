import { cachedResearch } from './sharedResearchCache.js';
import { searchGrounded } from './insights/ncaafSearch.js';
import { nameKey, playerName } from './insights/ncaafNames.js';
import { createModelSession, sendToSessionWithRetry } from './agentic/orchestrator/sessionManager.js';

const fullName = team => team.full_name || [team.college, team.name].filter(Boolean).join(' ');
const STATUS = new Set(['out', 'out for season', 'out for the season', 'doubtful', 'questionable', 'probable', 'limited', 'suspended', 'opted out', 'game-time decision']);
const dateMs = day => Date.parse(`${day}T12:00:00Z`);

function retrievedSourceAges(record) {
  const ages = new Map();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'web_search_result' && value.url) ages.set(value.url, value.page_age);
    for (const child of Object.values(value)) if (typeof child === 'object') {
      if (Array.isArray(child)) child.forEach(visit); else visit(child);
    }
  };
  if (typeof record !== 'string') visit(record);
  return ages;
}

/** A model cannot freshen an old result by inventing a recent publication date. */
function agreesWithRetrievedAge(source, ages, now) {
  const age = String(ages.get(source.url) || '').toLowerCase();
  const match = age.match(/(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/);
  if (!match) return true; // No transport date: retain the attributed date, never assert independent verification.
  const days = Number(match[1]) * ({ minute: 1 / 1440, hour: 1 / 24, day: 1, week: 7, month: 30, year: 365 }[match[2]]);
  const claimedDays = (dateMs(new Date(now).toISOString().slice(0, 10)) - dateMs(source.reported)) / 86400000;
  return days <= 8 && Math.abs(claimedDays - days) <= 2;
}

export function parseCollegeContext(text) {
  const raw = String(text || '').trim();
  const candidates = [raw, ...[...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(m => m[1]), raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)];
  for (const candidate of candidates) { try { const parsed = JSON.parse(candidate); if (parsed?.home && parsed?.away) return parsed; } catch {} }
  return null;
}

export async function reformatCollegeContext(prompt, answer) {
  const session = await createModelSession({ modelName: 'anthropic-claude-haiku-4-5', tools: [], thinkingLevel: 'low',
    systemPrompt: 'You format supplied sports reporting into JSON. Use only supplied facts and actual source metadata. Never infer a starting quarterback from passing totals. Missing facts stay unknown. Output JSON only.' });
  const metadata = JSON.parse(JSON.stringify(answer.raw || [], (key, value) => key === 'encrypted_content' ? undefined : value));
  const response = await sendToSessionWithRetry(session, `${prompt}\n\nDo not search again. Reformat ONLY the following prior report and retrieved source metadata. Retain home and away even if both are unavailable. Do not claim a source supports a fact absent from this report.\nREPORT:\n${answer.data}\nRETRIEVED SOURCES:\n${JSON.stringify(metadata)}`, { signal: AbortSignal.timeout(45_000) });
  return parseCollegeContext(response.content);
}

/** Exclude generated assistant prose: a URL repeated in its own answer is not evidence. */
export function searchSourceTrace(record) {
  if (typeof record === 'string') {
    return record.split('\n').flatMap(line => {
      try { const event = JSON.parse(line); return /web_search|tool_result/.test(event.item?.type || event.type || '') ? [JSON.stringify(event)] : []; }
      catch { return []; }
    }).join('\n');
  }
  return JSON.stringify(record || []);
}

/** Accept identities from BDL and citations returned by the actual search transport. */
export function validateCollegeContext(raw, { game, date, rosters, sourceRecord = '', now = new Date() }) {
  const out = { version: 1, game_id: game.id ?? game.bdl_game_id, date, observed_at: new Date(now).toISOString(), sides: {} };
  const trace = searchSourceTrace(sourceRecord);
  const sourceAges = retrievedSourceAges(sourceRecord);
  const problems = [];
  const warnings = [];
  for (const side of ['away', 'home']) {
    const team = side === 'away' ? game.away_team ?? game.visitor_team : game.home_team;
    const input = raw?.[side];
    const roster = rosters[side] || [];
    const sources = (input?.sources || []).filter(source => {
      try {
        const url = new URL(source.url);
        const age = dateMs(date) - dateMs(source.reported);
        return ['http:', 'https:'].includes(url.protocol) && trace.includes(source.url)
          && agreesWithRetrievedAge(source, sourceAges, now)
          && dateMs(source.reported) <= dateMs(new Date(now).toISOString().slice(0, 10))
          && Number.isFinite(age) && age >= 0 && age <= 8 * 86_400_000;
      } catch { return false; }
    });
    const currentCitations = ids => Array.isArray(ids) ? ids.filter(id => sources.some(s => s.id === id)) : [];
    // A current depth chart may be cited alongside the older starter announcement.
    // Keep the current corroboration; do not make the older supplemental citation a blocker.
    const cited = ids => currentCitations(ids).length > 0;
    const match = name => {
      const hits = roster.filter(p => nameKey(playerName(p)) === nameKey(name));
      return hits.length === 1 ? hits[0] : null;
    };
    const qbPlayer = match(input?.quarterback?.name);
    const quarterback = String(input?.team_id) === String(team.id) && qbPlayer && String(qbPlayer.position_abbreviation || qbPlayer.position).toUpperCase() === 'QB'
      && ['confirmed', 'projected'].includes(input?.quarterback?.status) && cited(input.quarterback.sources)
      ? { ...input.quarterback, sources: currentCitations(input.quarterback.sources), player_id: qbPlayer.id, name: playerName(qbPlayer) } : null;
    const injuries = [];
    let invalid = 0;
    for (const row of Array.isArray(input?.injuries) ? input.injuries : []) {
      const player = match(row.name);
      const status = String(row.status || '').toLowerCase();
      if (!player || !STATUS.has(status) || !cited(row.sources)) { invalid++; continue; }
      injuries.push({ player, name: playerName(player), status, injury_status: status, description: row.note || '', sources: currentCitations(row.sources) });
    }
    const availabilityOk = String(input?.team_id) === String(team.id) && input?.availability === 'checked'
      && Array.isArray(input?.injuries) && sources.length > 0 && invalid === 0;
    // A completed search can explicitly report an unresolved competition or no
    // public availability report. Those are uncertainties for Gary, not a feed
    // outage and never a claim that the team is healthy.
    const availabilityReviewed = availabilityOk || (String(input?.team_id) === String(team.id)
      && input?.availability === 'unavailable' && Array.isArray(input.injuries) && invalid === 0 && sources.length > 0);
    const sourcedUncertainty = input?.quarterback?.status === 'unresolved' && cited(input.quarterback.sources);
    const qbReviewed = String(input?.team_id) === String(team.id) && sources.length > 0
      && (Boolean(quarterback) || input?.quarterback?.status === 'unresolved'
        || (qbPlayer && String(qbPlayer.position_abbreviation || qbPlayer.position).toUpperCase() === 'QB'));
    const qbUncertainty = sourcedUncertainty ? input.quarterback.note || 'Unresolved in current reporting'
      : 'A starting quarterback could not be verified from the available current reporting.';
    if (!availabilityReviewed) problems.push(`${fullName(team)}: availability collection lacks current roster-verified sources`);
    else if (!availabilityOk) warnings.push(`${fullName(team)}: checked current reporting, but no complete public availability report was established; availability remains unknown`);
    if (!qbReviewed) problems.push(`${fullName(team)}: quarterback collection lacks current roster-verified reporting`);
    else if (!quarterback) warnings.push(`${fullName(team)}: ${qbUncertainty}`);
    out.sides[side] = { team_id: team.id, team: fullName(team), sources, quarterback, injuries,
      quarterback_uncertainty: !quarterback && qbReviewed ? qbUncertainty : null,
      availability: availabilityOk ? 'checked' : 'unavailable',
      diagnostics: { supplied_sources: input?.sources?.length || 0, current_sources: sources.length, invalid_injuries: invalid, reported_qb: input?.quarterback?.name || null, roster_match: Boolean(qbPlayer), rejected_sources: (input?.sources || []).filter(s => !sources.includes(s)).map(s => ({url:s.url,reported:s.reported,found:trace.includes(s.url)})) },
      coaches: (input?.coaches || []).filter(row => row.name && row.role && cited(row.sources)).map(row => ({...row, sources: currentCitations(row.sources)})),
      context: (input?.context || []).filter(row => row.fact && cited(row.sources)).map(row => ({...row, sources: currentCitations(row.sources)})),
    };
  }
  out.unavailable = problems.length > 0;
  out.reason = problems.join('; ');
  out.warnings = warnings;
  return out;
}

export async function getNcaafGameContext({ game, date, bdl, search = searchGrounded, cache = {}, rosters: suppliedRosters, repair = reformatCollegeContext }) {
  const home = game.home_team, away = game.away_team ?? game.visitor_team;
  if (!home?.id || !away?.id || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { unavailable: true, reason: 'Exact college teams/date unavailable' };
  return cachedResearch(`ncaaf-context-v5:${date}:${away.id}:${home.id}`, async () => {
    const rosters = suppliedRosters || { home: await bdl.getNcaafTeamPlayers(home.id, 60), away: await bdl.getNcaafTeamPlayers(away.id, 60) };
    if (!rosters.home?.length || !rosters.away?.length) return { unavailable: true, reason: 'College active roster unavailable' };
    const teamInput = side => {
      const team = side === 'home' ? home : away;
      return { side, team_id: team.id, name: fullName(team), quarterbacks: rosters[side].filter(p => String(p.position_abbreviation || p.position).toUpperCase() === 'QB').map(playerName) };
    };
    const prompt = `Find current factual COLLEGE FOOTBALL availability, starting quarterbacks and coaching for ${fullName(away)} at ${fullName(home)} on ${date}. Today is ${new Date().toISOString().slice(0, 10)}. Teams: ${JSON.stringify([teamInput('away'), teamInput('home')])}.
Use live search of this week's official school/conference availability reports, depth charts, coach statements and attributed reporting for BOTH teams. BDL has no college injury feed. Do not infer starters from passing totals. Cite the actual source URL and publication date for every claim. Distinguish a confirmed starter from a projected starter and an unresolved competition. Search current head coach, coordinators/play caller, staff changes, offensive/defensive scheme, and relevant personnel changes. Facts only, no betting advice, odds or predictions.
Return one STRICT JSON object with home and away objects, each shaped:
{"team_id":123,"availability":"checked|unavailable","quarterback":{"name":"roster QB name","status":"confirmed|projected|unresolved","note":"what the report establishes","sources":["s1"]},"injuries":[{"name":"full player name","status":"out|out for season|doubtful|questionable|probable|limited|suspended|opted out|game-time decision","note":"reported condition and role","sources":["s1"]}],"coaches":[{"name":"full name","role":"head coach|offensive coordinator|defensive coordinator|play caller","sources":["s1"]}],"context":[{"fact":"dated scheme, continuity or personnel fact","sources":["s1"]}],"sources":[{"id":"s1","url":"actual searched source URL","reported":"YYYY-MM-DD","title":"source title"}]}.
Always return BOTH team objects even when reporting is incomplete. Missing information does not prevent JSON output: use availability unavailable with injuries [], and quarterback name null/status unresolved/sources [] when the starter is not established. These empty fields mean unknown, never healthy. Do not fabricate a report, date, URL or player. Checked with no reported injuries is only what the checked sources report, never a claim that every player is healthy. Current sources must be dated within eight days of the target game. Include every reported relevant absence, not only four players.`;
    const answer = await cachedResearch(`ncaaf-search-v1:${date}:${away.id}:${home.id}`,
      () => search(prompt, { timeoutMs: 180_000, maxTokens: 9000 }),
      { ttlMs: 30 * 60_000, valid: value => value?.success === true, ...cache });
    if (!answer?.success) return { unavailable: true, reason: answer?.error || 'College context search unavailable' };
    let parsed = parseCollegeContext(answer.data);
    if (!parsed) {
      // Some successful searches refuse JSON merely because no public injury
      // report exists. Reformat the already retrieved evidence once, without
      // buying another search or inventing a complete report.
      const repaired = await cachedResearch(`ncaaf-structured-v1:${date}:${away.id}:${home.id}`, async () => {
        return repair(prompt, answer);
      }, { ttlMs: 30 * 60_000, valid: value => Boolean(value), ...cache });
      // A prose-only answer is not a structured starter confirmation. The
      // formatter may preserve other reporting, but cannot promote passing
      // totals or an ambiguous narrative into a new starting-QB assertion.
      parsed = repaired ? structuredClone(repaired) : null;
      if (parsed) for (const side of ['home', 'away']) parsed[side].quarterback = {
        name: null, status: 'unresolved', sources: [], note: 'Starting quarterback not verified in the original structured report.',
      };
    }
    if (!parsed) return { unavailable: true, reason: 'College search did not return a complete structured report for both teams' };
    return validateCollegeContext(parsed, { game, date, rosters, sourceRecord: answer.raw || '' });
  }, { ttlMs: value => value.unavailable ? 120_000 : 2 * 60 * 60_000, valid: value => Boolean(value), ...cache });
}

export function formatNcaafGameContext(context) {
  if (!context?.sides) return `College availability/context unavailable: ${context?.reason || 'no report'}`;
  return ['COLLEGE STARTING QUARTERBACKS, AVAILABILITY AND STAFF', `Observed ${context.observed_at}; game ${context.date}.`,
    ...(context.warnings || []).map(warning => `UNCERTAINTY: ${warning}`),
    ...['away', 'home'].flatMap(side => {
      const row = context.sides[side], qb = row.quarterback;
      return [row.team, qb ? `Quarterback: ${qb.name} — ${qb.status}. ${qb.note || ''}` : `Quarterback: unresolved. ${row.quarterback_uncertainty || ''}`,
        `Availability source: ${row.availability}. Empty list means no absences reported by these sources, not confirmed healthy.`,
        ...row.injuries.map(p => `${p.name}: ${p.status}. ${p.description}`),
        ...row.coaches.map(p => `${p.role}: ${p.name}`), ...row.context.map(p => p.fact),
        ...row.sources.map(s => `[${s.id}] ${s.title || ''} (${s.reported}) ${s.url}`)];
    })].join('\n');
}
