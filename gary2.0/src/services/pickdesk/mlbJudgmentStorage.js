import { randomUUID } from 'node:crypto';
import { MLB_JUDGMENT_POLICY } from '../agentic/orchestrator/mlbJudgment.js';
import { awaitWithSignal } from '../agentic/orchestrator/requestCancellation.js';

/** Bound both provider IO and a client implementation that ignores cancellation. */
export async function mlbJudgmentDatabaseCall(operation, { signal: parentSignal, timeoutMs = 10_000 } = {}) {
  const controller = new AbortController();
  const signal = parentSignal ? AbortSignal.any([parentSignal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new Error('MLB judgment database deadline reached')), timeoutMs);
  try {
    return await awaitWithSignal(() => {
      const request = operation();
      return typeof request?.abortSignal === 'function' ? request.abortSignal(signal) : request;
    }, signal);
  } finally { clearTimeout(timer); }
}

/** One writer per whole-brain attempt. A lost response retries the same payload. */
export function createMlbJudgmentJournal({ db, game, model, promptSha, runId = randomUUID(), clock = Date.now, signal }) {
  const gameId = String(game.bdl_game_id ?? game.id ?? '');
  const gameDate = new Date(game.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  let previous = null;
  let source = null;
  const recorded = new Map();
  async function call(name, args) {
    let last;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await mlbJudgmentDatabaseCall(() => db.rpc(name, args), { signal });
        if (result.error) throw result.error;
        const receipt = result.data;
        if (receipt?.ok !== true || receipt.run_id !== runId || !receipt.payload_sha256 || !receipt.recorded_at) throw new Error('Missing durable MLB judgment receipt');
        return receipt;
      } catch (error) { signal?.throwIfAborted(); last = error; }
    }
    throw last;
  }
  return {
    runId,
    async record(phase, payload, snapshot) {
      if (recorded.has(phase)) {
        if (JSON.stringify(recorded.get(phase).payload) !== JSON.stringify(payload)) throw new Error('Cannot overwrite an MLB judgment phase');
        return recorded.get(phase).receipt;
      }
      let receipt;
      if (phase === 'initial_commit') {
        source ??= structuredClone(snapshot);
        receipt = await call('start_mlb_judgment', {
          p_run_id: runId, p_game_date: gameDate, p_game_id: gameId, p_commence_time: game.commence_time,
          p_model: model, p_prompt_sha: promptSha, p_source_snapshot: source, p_initial_judgment: payload,
        });
      } else {
        if (!previous) throw new Error('MLB judgment has no durable initial commitment');
        receipt = await call('append_mlb_judgment_phase', {
          p_run_id: runId, p_phase: phase, p_payload: payload, p_expected_previous_hash: previous.payload_sha256,
        });
      }
      if (receipt.phase !== phase) throw new Error('MLB judgment receipt phase mismatch');
      previous = receipt;
      recorded.set(phase, { payload: structuredClone(payload), receipt });
      return receipt;
    },
    envelope(data) {
      return { schema_version: 1, policy_version: MLB_JUDGMENT_POLICY, odds_visibility: 'odds_visible', odds_visible: true,
        game_id: gameId, game_date: gameDate, recorded_at: new Date(clock()).toISOString(), data };
    },
    async publish(pick) { return this.record('published', this.envelope({ final_pick_snapshot: pick })); },
    async fail(reason) {
      if (!previous || recorded.has('published') || recorded.has('failed')) return;
      return this.record('failed', this.envelope({ error: String(reason) }));
    },
  };
}

/** Repair only the gap between a confirmed publication and its ledger receipt. */
export async function recoverMlbJudgmentPublication(db, pick, { gameDate, now = Date.now() } = {}) {
  if (pick?.decision_policy !== MLB_JUDGMENT_POLICY || !pick.judgment_run_id || Date.parse(pick.commence_time) <= Number(now)) return null;
  const runId = pick.judgment_run_id;
  const [header, eventRows] = await Promise.all([
    mlbJudgmentDatabaseCall(() => db.from('mlb_judgment_runs').select('*').eq('run_id', runId).maybeSingle()),
    mlbJudgmentDatabaseCall(() => db.from('mlb_judgment_events').select('*').eq('run_id', runId).order('recorded_at', { ascending: true })),
  ]);
  if (header.error || eventRows.error) throw header.error || eventRows.error;
  const run = header.data;
  if (!run || run.game_date !== gameDate || String(run.game_id) !== String(pick.game_id ?? pick.bdl_game_id)
    || run.model !== pick.model || run.prompt_sha !== pick.prompt_sha || Date.parse(run.commence_time) !== Date.parse(pick.commence_time)) return null;
  const events = new Map((eventRows.data || []).map(event => [event.phase, event]));
  if (events.has('failed') || ['initial_commit','factual_research','stress_test','price_assessment'].some(phase => !events.has(phase))) return null;
  let published = events.get('published');
  if (!published) {
    const payload = { schema_version: 1, policy_version: MLB_JUDGMENT_POLICY, odds_visibility: 'odds_visible', odds_visible: true,
      game_id: run.game_id, game_date: run.game_date, recorded_at: new Date(Number(now)).toISOString(), data: { final_pick_snapshot: pick } };
    const response = await mlbJudgmentDatabaseCall(() => db.rpc('append_mlb_judgment_phase', { p_run_id: runId, p_phase: 'published', p_payload: payload,
      p_expected_previous_hash: events.get('price_assessment').payload_sha256 }));
    if (response.error) throw response.error;
    if (!response.data?.ok || response.data.run_id !== runId || response.data.phase !== 'published') throw new Error('Publication recovery has no durable receipt');
    published = { ...response.data, payload };
    events.set('published', published);
  }
  // Compare JSON structurally: PostgreSQL jsonb key order is not JS insertion order.
  const canonical = value => JSON.stringify(value, function (_key, item) {
    return item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item;
  });
  if (canonical(published.payload?.data?.final_pick_snapshot) !== canonical(pick)) return null;
  const data = phase => events.get(phase).payload.data;
  const price = data('price_assessment');
  return { schema_version: 1, policy_version: MLB_JUDGMENT_POLICY, odds_visibility: 'odds_visible', odds_visible: true,
    run_id: runId, game_id: run.game_id, game_date: run.game_date, home_team: pick.homeTeam, away_team: pick.awayTeam,
    gameKind: run.source_snapshot.gameKind, allowedTickets: run.source_snapshot.allowedTickets,
    initial: data('initial_commit'), research: data('factual_research'), stress: data('stress_test'), price,
    final_ticket: run.source_snapshot.allowedTickets.find(ticket => ticket.id === price.ticket_id), winners_eligible: price.decision === 'endorse',
    receipts: Object.fromEntries([...events].map(([phase, event]) => [phase, { ok: true, run_id: runId, phase,
      ...(event.event_id != null ? { event_id: event.event_id } : {}), recorded_at: event.recorded_at, payload_sha256: event.payload_sha256 }])),
  };
}
