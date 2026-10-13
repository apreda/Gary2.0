/** Gary's take on the starting pitchers (MLB) and quarterbacks (NFL) (split from tomorrowService.js, Oct 13 2026). */
import { WRITING_RULES, readerCopyIsClean } from '../copy/writingRules.js';
import axios from 'axios';
import { createHash } from 'node:crypto';
import { ballDontLieService as bdl } from '../ballDontLieService.js';
import { DESK_FALLBACK_MODELS, PROPS_DESK_MODEL } from '../agentic/orchestrator/orchestratorConfig.js';
import { createModelSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
import { awaitWithSignal } from '../agentic/orchestrator/requestCancellation.js';
import { supabaseUrl, gameTimeBucket, rowMatchup, rowMatchupKey, repeatedMatchupKeys, rowGameIdentity } from './basics.js';

/* ───────────────────────────── main assembler ───────────────────────────── */

// ═══════════════════════════════════════════════════════════════════════════
// THE ARMS, IN GARY'S VOICE (founder GO, Aug 4 2026): the scouting card opens
// straight with the arms, and the arms SPEAK — two sentences from Gary on the
// game's two starters, replacing the stat ladder. ONE batched call for the
// whole slate on the props-lane model (bridge, $0 marginal). Missing commentary
// is explicit; it cannot prevent refreshed factual board data from publishing.
// If only one probable is official, the page still gets an honest one-arm
// read plus an explicit unannounced-starter sentence instead of losing the
// entire section until a club makes its decision.
// The facts below are the take's ONLY world — same prevent-fabrication
// posture as the desks (data in, nothing invented).
// ═══════════════════════════════════════════════════════════════════════════

/** One starter's facts as a compact line. Omits what the data lacks. */
function armsFactLine(st) {
  if (!st) return null;
  const name = st.full_name || st.name;
  if (!name) return null;
  const bits = [];
  if (st.era != null) bits.push(`${st.era} ERA`);
  if (st.last_outing) {
    const lo = st.last_outing;
    bits.push(`last outing${lo.date ? ` ${lo.date}` : ''}${lo.opp ? ` ${lo.at || 'vs'} ${lo.opp}` : ''}: ${lo.ip} IP ${lo.er} ER ${lo.k} K`);
  }
  if (st.l3) bits.push(`last ${st.l3.gs}: ${st.l3.ip} IP ${st.l3.er} ER ${st.l3.k} K`);
  if (st.qs_form?.window >= 2) bits.push(`${st.qs_form.qs} QS in last ${st.qs_form.window}${st.qs_form.streak >= 2 ? ` (${st.qs_form.streak} straight)` : ''}`);
  if (st.vs_opp?.gs) bits.push(`vs tonight's opponent this season: ${st.vs_opp.gs} GS, ${st.vs_opp.ip} IP, ${st.vs_opp.er} ER`);
  if (st.rest?.days != null) bits.push(`${st.rest.days} days' rest`);
  return `${name} (${st.team}): ${bits.join('; ') || 'no season data'}`;
}

/** Honest two-sentence Arms copy while exactly one probable is still TBA. */
function partialArmsTake(st, missingTeam) {
  const name = st.full_name || st.name || 'The announced starter';
  let first;
  if (st.l3?.gs && st.l3?.ip != null && st.l3?.er != null) {
    first = `${name} has allowed ${st.l3.er} earned runs across ${st.l3.ip} innings `
      + `in his last ${st.l3.gs} starts${st.l3.k != null ? `, with ${st.l3.k} strikeouts` : ''}`;
    if (st.era != null) {
      first += `, while carrying a ${st.era.toFixed(2)} ERA`;
    }
  } else if (st.last_outing?.ip != null) {
    const lo = st.last_outing;
    first = `${name} worked ${lo.ip} innings with ${lo.er ?? 0} earned runs`
      + `${lo.k != null ? ` and ${lo.k} strikeouts` : ''} in his last start`;
  } else if (st.era != null) {
    first = `${name} brings a ${st.era.toFixed(2)} ERA`;
  } else {
    first = `${name} is the only confirmed arm in this matchup so far`;
  }
  return `${first}. The ${missingTeam} have not announced their starter, so that half of the matchup remains unsettled.`;
}

const ARMS_VOICE_CONTRACT = `You are Gary — the bettor whose picks publish in this app. You write as yourself, never as an AI or a system.

Your training data is old; the pitcher data provided is current — say nothing it can't back.

For each game: TWO short paragraphs, one per starting pitcher — the away arm first, then the home arm — separated by a blank line. Each is a sentence or two: whatever you'd actually say about that arm tonight. No emojis.`;

// THE QUARTERBACKS (founder, Sep 21 2026): the NFL card runs MLB's Arms
// system with the sport's nouns swapped — the same batched voice call, the
// same facts-only world, the same cache and retry — never a stat template.
const QUARTERBACKS_VOICE_CONTRACT = `You are Gary — the bettor whose picks publish in this app. You write as yourself, never as an AI or a system.

Your training data is old; the quarterback data provided is current — say nothing it can't back.

For each game: TWO short paragraphs, one per starting quarterback — the away quarterback first, then the home quarterback — separated by a blank line. Each is a sentence or two: whatever you'd actually say about that quarterback this week. No emojis.`;

function armsVoiceContract(league) {
  return `${league === 'NFL' ? QUARTERBACKS_VOICE_CONTRACT : ARMS_VOICE_CONTRACT}\n\n${WRITING_RULES}`;
}

/** One quarterback's facts as a compact line, off the day's quarterback row. Omits what the row lacks. */
function quarterbackFactLine(qb) {
  const meta = qb?.meta || {};
  const name = meta.qb;
  if (!name) return null;
  const bits = [];
  const p = meta.passing;
  if (p) {
    const label = p.prior ? `${p.season} (prior season)` : `${p.season} so far`;
    const parts = [];
    if (p.yards != null) parts.push(`${p.yards} passing yards`);
    if (p.pct != null) parts.push(`${p.pct}% completions`);
    if (p.ypa != null) parts.push(`${p.ypa} yards per attempt`);
    if (p.td != null && p.ints != null) parts.push(`${p.td}-${p.ints} TD-INT`);
    if (parts.length) bits.push(`${label}: ${parts.join(', ')}${p.games ? ` over ${p.games} game${p.games === 1 ? '' : 's'}` : ''}`);
  } else {
    bits.push('no verified passing line on file this season or last');
  }
  if (meta.qb_status && meta.qb_status !== 'confirmed') bits.push(`${meta.qb_status} starter`);
  if (meta.injury_status) bits.push(`listed ${String(meta.injury_status).toLowerCase()} on the injury report`);
  return `${name} (${meta.abbr || 'TEAM'}): ${bits.join('; ')}`;
}

/** Honest two-sentence Quarterbacks copy while exactly one starter is named. */
function partialQuarterbacksTake(qb, missingTeam) {
  const meta = qb?.meta || {};
  const name = meta.qb || 'The named starter';
  const p = meta.passing;
  let first;
  if (p && p.yards != null && p.pct != null) {
    first = `${name} has ${p.yards} passing yards on ${p.pct}% completions${p.ypa != null ? ` at ${p.ypa} yards per attempt` : ''}`
      + `${p.td != null && p.ints != null ? `, ${p.td} touchdowns against ${p.ints} interception${p.ints === 1 ? '' : 's'}` : ''}`
      + `${p.prior ? ` in his ${p.season} season` : p.games ? ` through ${p.games} game${p.games === 1 ? '' : 's'}` : ''}`;
  } else {
    first = `${name} is the only named starter in this matchup so far, with no verified passing line on file`;
  }
  return `${first}. The ${missingTeam} have not named their starter, so that half of the matchup remains unsettled.`;
}

/** The day's NFL quarterback rows (footballQbWatch), keyed by BDL game id and side. */
export async function readNflQuarterbacks(etDateStr, { supabaseUrl: url, adminKey }) {
  const { data } = await axios.get(`${url}/rest/v1/insight_connections`, {
    // Newest rows first: the day's latest quarterback run wins when the lane
    // ran more than once (find() below takes the first match per side).
    params: { date: `eq.${etDateStr}`, league: 'eq.NFL', category: 'eq.quarterback', select: 'game_id,meta', order: 'id.desc' },
    headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
    timeout: 15000,
  });
  if (!Array.isArray(data)) throw new Error('quarterback rows read returned a non-array response');
  return data.filter((row) => row?.meta?.qb && row?.meta?.side && row?.game_id != null);
}

// Two short paragraphs (one per starter, Sep 21 2026) run to ~700 chars;
// the old 420 cap was written for the two-sentence shape and rejected
// every paired take on the first two-paragraph board.
function validArmsTake(take) {
  return typeof take === 'string' && take.trim().length >= 40 && take.trim().length <= 760
    && !take.includes('…') && !take.includes('...')
    && readerCopyIsClean(take); // writing.md: a dash or another AI tell is a defect
}

function armsProviderScope(modelName) {
  if (modelName.startsWith('codex-')) return 'codex';
  if (modelName.startsWith('anthropic-')) return 'anthropic-api';
  return modelName;
}

function exhaustedArmsProvider(error) {
  return /hit your usage limit|credit balance.{0,40}too low|insufficient[_ ]quota|insufficient credits|quota.{0,30}exhausted/i
    .test(String(error?.message || ''));
}

/**
 * Attach `arms_take` to MLB board rows — one batched voice call, JSON out,
 * then focused retries for missing games within one optional time budget.
 * Cached voice requires the same exact game and complete input fingerprint.
 */
export async function attachArmsTakes(board, starters, {
  existingBoard = [],
  quarterbacks = [],
  timeoutMs = Number(process.env.GARY_BOARD_ARMS_TIMEOUT_MS) || 3 * 60 * 1000,
} = {}) {
  const repeatedMatchups = repeatedMatchupKeys(board);
  const starterFor = (row, team) => {
    const matchup = rowMatchup(row);
    const candidates = starters.filter((st) => st.league === 'MLB'
      && String(st.team || '').toUpperCase() === String(team || '').toUpperCase()
      && (!st.game || st.game === matchup));
    if (!candidates.length) return null;
    // Team + matchup is ambiguous on a twin bill even when only one probable
    // has been announced. Require this row's time bucket before accepting any
    // candidate so game 2 can never populate game 1 (or vice versa).
    if (repeatedMatchups.has(rowMatchupKey(row))) {
      const rowBucket = gameTimeBucket(row.commence_time);
      if (rowBucket == null) return null;
      return candidates.find((st) => gameTimeBucket(st.game_time) === rowBucket) || null;
    }
    if (candidates.length <= 1) return candidates[0] || null;
    const rowTime = Date.parse(row.commence_time);
    if (!Number.isFinite(rowTime)) return candidates[0];
    return [...candidates].sort((a, b) => {
      const aDelta = Math.abs((Date.parse(a.game_time) || rowTime) - rowTime);
      const bDelta = Math.abs((Date.parse(b.game_time) || rowTime) - rowTime);
      return aDelta - bDelta;
    })[0];
  };
  const jobs = [];
  let partialCount = 0;
  let cachedCount = 0;
  for (const r of board) {
    if (r.league !== 'MLB' && r.league !== 'NFL') continue;
    r.arms_take = null;
    r.arms_take_status = 'unavailable';
    delete r.arms_input_sha;
    // NFL: the same two-starter shape, off the day's quarterback rows by
    // exact BDL game id (one game per matchup per week; no twin bills).
    const nfl = r.league === 'NFL';
    const qbFor = (side) => nfl && r.bdl_game_id != null
      ? quarterbacks.find((qb) => String(qb.game_id) === String(r.bdl_game_id) && qb.meta.side === side) || null
      : null;
    const awayStarter = nfl ? qbFor('away') : starterFor(r, r.away_abbr);
    const homeStarter = nfl ? qbFor('home') : starterFor(r, r.home_abbr);
    const a = nfl ? quarterbackFactLine(awayStarter) : armsFactLine(awayStarter);
    const h = nfl ? quarterbackFactLine(homeStarter) : armsFactLine(homeStarter);
    // With neither arm posted there is still no grounded pitcher story. With
    // exactly one, publish the known arm and state the other club's status
    // plainly; this is not the retired quality-starts fallback.
    if (!a && !h) continue;
    if (!a || !h) {
      const known = awayStarter || homeStarter;
      const missingTeam = a ? (r.home_team || r.home_abbr) : (r.away_team || r.away_abbr);
      r.arms_take = nfl ? partialQuarterbacksTake(known, missingTeam) : partialArmsTake(known, missingTeam);
      r.arms_take_status = 'partial';
      partialCount++;
      continue;
    }
    const matchup = rowMatchup(r);
    const job = {
      row: r,
      league: r.league,
      matchup,
      gameKey: rowGameIdentity(r),
      facts: [a, h].filter(Boolean).join('\n'),
    };
    const identityOf = (st) => nfl ? (st.meta?.qb ?? null) : (st.person_id ?? null);
    job.inputSha = createHash('sha256').update(JSON.stringify([
      armsVoiceContract(r.league), job.gameKey, r.commence_time,
      identityOf(awayStarter), identityOf(homeStarter), job.facts,
    ])).digest('hex');
    r.arms_input_sha = job.inputSha;
    const prior = existingBoard.find((row) => rowGameIdentity(row) === job.gameKey
      && row.arms_input_sha === job.inputSha && validArmsTake(row.arms_take));
    if (prior) {
      r.arms_take = prior.arms_take;
      r.arms_take_status = 'available';
      cachedCount++;
    }
    jobs.push(job);
  }
  const summary = () => ({
    status: jobs.some((job) => !job.row.arms_take) ? 'degraded' : 'complete',
    eligible: jobs.length,
    available: jobs.filter((job) => Boolean(job.row.arms_take)).length,
    cached: cachedCount,
    partial: partialCount,
    missing_game_keys: jobs.filter((job) => !job.row.arms_take).map((job) => job.gameKey),
  });
  if (jobs.every((job) => job.row.arms_take)) {
    if (partialCount) console.log(`[TomorrowBoard] arms takes attached: 0 paired + ${partialCount} partial`);
    return summary();
  }

  const models = [...new Set([PROPS_DESK_MODEL, ...DESK_FALLBACK_MODELS])];
  const exhaustedScopes = new Set();
  const availableModels = () => models.filter((model) => !exhaustedScopes.has(armsProviderScope(model)));
  const controller = new AbortController();
  const { signal } = controller;
  const budgetMs = Math.min(5 * 60 * 1000, Math.max(1, Number(timeoutMs) || 3 * 60 * 1000));
  const budgetTimer = setTimeout(() => controller.abort(new Error('optional arms commentary time budget exhausted')), budgetMs);

  const requestTakes = async (pending, league = pending[0]?.league || 'MLB') => {
    const contract = armsVoiceContract(league);
    const userMessage = `${pending.map((j) => `## GAME KEY: ${j.gameKey}\nMATCHUP: ${j.matchup}\n${j.facts}`).join('\n\n')}

Output JSON only:

\`\`\`json
[{ "game_key": "[copy that game's exact GAME KEY]", "matchup": "AWY @ HOM", "take": "[the two paragraphs, separated by a blank line]" }]
\`\`\`

One entry per game listed above. Copy each GAME KEY exactly into game_key.`;

    // Arms used to retry only PROPS_DESK_MODEL. When that points at one
    // subscription and its tank is empty, every retry hits the same wall and
    // the entire day stays blank. Use the same independent provider chain as
    // Gary's desks: codex GPT Pro bridge -> metered Anthropic API rungs.
    signal.throwIfAborted();
    const failures = [];
    for (const modelName of availableModels()) {
      // A prior rung can establish that this shared account has no capacity.
      if (exhaustedScopes.has(armsProviderScope(modelName))) continue;
      try {
        const session = await createModelSession({
          modelName,
          systemPrompt: contract,
          tools: [],
          thinkingLevel: 'low',
          signal,
        });
        const res = await awaitWithSignal(() => sendToSessionWithRetry(session, userMessage, { signal }), signal);
        const m = String(res.content || '').match(/```json\s*([\s\S]*?)```/i)
          || String(res.content || '').match(/(\[[\s\S]*\])/);
        if (!m) throw new Error('no JSON in response');
        const entries = JSON.parse(m[1]);
        if (!Array.isArray(entries)) throw new Error('JSON was not an array');
        if (modelName !== PROPS_DESK_MODEL) {
          console.warn(`[TomorrowBoard] arms provider recovered on ${modelName}`);
        }
        return entries;
      } catch (e) {
        signal.throwIfAborted();
        if (exhaustedArmsProvider(e)) exhaustedScopes.add(armsProviderScope(modelName));
        failures.push(`${modelName}: ${e.message}`);
        console.warn(`[TomorrowBoard] arms provider ${modelName} failed: ${e.message}`);
      }
    }
    throw new Error(`arms takes: all providers failed (${failures.join(' | ')})`);
  };

  const matchupKeyOf = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const attachEntries = (pending, entries) => {
    const takeByGameKey = new Map();
    const takeByMatchup = new Map();
    const duplicateGameKeys = new Set();
    const duplicateMatchups = new Set();
    const inOrder = [];
    for (const e of entries) {
      if (typeof e?.take === 'string') {
        const responseKey = e.game_key != null
          ? String(e.game_key)
          : (e.game_id != null ? `bdl:${e.game_id}` : null);
        if (responseKey) {
          if (takeByGameKey.has(responseKey)) duplicateGameKeys.add(responseKey);
          else takeByGameKey.set(responseKey, e.take.trim());
        }
        if (!responseKey && e.matchup) {
          const responseMatchup = matchupKeyOf(e.matchup);
          if (takeByMatchup.has(responseMatchup)) duplicateMatchups.add(responseMatchup);
          else takeByMatchup.set(responseMatchup, e.take.trim());
        }
        if (!responseKey && !e.matchup) inOrder.push(e.take.trim());
      }
    }
    const matchupCounts = new Map();
    for (const j of pending) {
      const key = matchupKeyOf(j.matchup);
      matchupCounts.set(key, (matchupCounts.get(key) || 0) + 1);
    }
    for (const [i, j] of pending.entries()) {
      const matchupKey = matchupKeyOf(j.matchup);
      const take = (duplicateGameKeys.has(j.gameKey) ? undefined : takeByGameKey.get(j.gameKey))
        // Backward-compatible only when matchup identity is unambiguous.
        ?? (matchupCounts.get(matchupKey) === 1 && !duplicateMatchups.has(matchupKey)
          ? takeByMatchup.get(matchupKey)
          : undefined)
        // Accept a legacy identity-free singleton only on an isolated retry.
        // An explicit different game key or matchup must never attach here.
        ?? (pending.length === 1 && inOrder.length === 1 ? inOrder[i] : undefined);
      if (validArmsTake(take)) {
        j.row.arms_take = take.trim();
        j.row.arms_take_status = 'available';
      }
    }
  };

  try {
    // One batched call per league: the contract names the sport's starters.
    for (const league of [...new Set(jobs.map((job) => job.league))]) {
      try {
        const pending = jobs.filter((job) => job.league === league && !job.row.arms_take);
        if (!pending.length) continue;
        attachEntries(pending, await requestTakes(pending, league));
      } catch (e) {
        console.warn(`[TomorrowBoard] batched ${league} arms write failed: ${e.message}`);
      }
    }

    // Retry malformed/missing entries, but never re-request an exhausted
    // account for every game or extend the single optional time budget.
    for (const job of jobs.filter((j) => !j.row.arms_take)) {
      for (let attempt = 1; attempt <= 2 && !job.row.arms_take && !signal.aborted && availableModels().length; attempt++) {
        try {
          attachEntries([job], await requestTakes([job], job.league));
        } catch (e) {
          console.warn(`[TomorrowBoard] arms retry ${attempt}/2 failed for ${job.matchup}: ${e.message}`);
        }
      }
    }
  } finally {
    clearTimeout(budgetTimer);
  }

  // Both starters known, no take yet: the app polls this row on the short
  // clock until the next refresh carries the copy (Sep 21 2026, every league).
  for (const job of jobs) if (!job.row.arms_take) job.row.arms_take_status = 'pending';
  const result = summary();
  if (result.missing_game_keys.length) {
    console.warn(`[TomorrowBoard] Optional arms commentary unavailable for ${result.missing_game_keys.length} game(s); factual board will publish with null takes`);
  }
  console.log(`[TomorrowBoard] arms takes attached: ${result.available}/${jobs.length} paired (${cachedCount} exact-input cached) + ${partialCount} partial`);
  return result;
}
