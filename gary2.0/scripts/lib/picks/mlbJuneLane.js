/** Adapts the frozen June engine to current publication metadata; never starts a run on import. */
import { prepareMlbScoutInput as defaultScoutInput } from '../mlbScoutInput.js';
import { assertMlbScoutReadiness as defaultScoutReadiness, MlbRequiredDataError } from '../../../src/services/mlbDataReadiness.js';
import { recordMlbDataFailure as defaultRecordFailure, openMlbDataFailure as defaultOpenFailure } from '../mlbDataFailure.js';
import { mlbMoneylinePastLimit, MLB_ML_CAP, MLB_HOUSE_LIMIT_CODE } from '../../../src/services/agentic/mlbHouseLimit.js';
import { readMlbExpectationMemory as defaultMemory } from '../../../src/services/diary/mlbExpectations.js';
import { createMlbJudgmentJournal as defaultJournal } from '../../../src/services/pickdesk/mlbJudgmentStorage.js';
import { mlbCaseHeadings as defaultCaseHeadings, MLB_DECISION_POLICY } from '../../../src/services/agentic/orchestrator/mlbCaseMenu.js';

export function extractJuneBilateralPaths(rawAnalysis, homeTeam, awayTeam) {
  const text = String(rawAnalysis || '');
  if (!text) return { path_home: null, path_away: null };
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // PRIMARY: the exact-heading contract (Aug 18 — "CASE FOR BACKING X TONIGHT:").
  // LEGACY: the older loose "Case for (backing) X" phrasing, kept tolerant.
  const headerRx = (team) => new RegExp(`CASE FOR (?:BACKING\\s+)?(?:THE\\s+)?${esc(team)}(?:\\s+TONIGHT)?:?[^\\n]*`, 'i');
  const headerFor = (team) => {
    let m = text.match(headerRx(team));
    if (!m) {
      const mascot = String(team).trim().split(/\s+/).pop();
      if (mascot && mascot !== team) m = text.match(headerRx(mascot));
    }
    return m;
  };
  const findBlock = (team, otherTeam) => {
    const m = headerFor(team);
    if (!m) return null;
    const start = m.index + m[0].length;
    const rest = text.slice(start);
    const otherM = headerFor(otherTeam) ? rest.match(headerRx(otherTeam)) || rest.match(headerRx(String(otherTeam).trim().split(/\s+/).pop())) : null;
    const endByOther = otherM ? otherM.index : Infinity;
    const doneIdx = rest.search(/INVESTIGATION COMPLETE/i);
    const endByDone = doneIdx === -1 ? Infinity : doneIdx;
    const end = Math.min(endByOther, endByDone, rest.length);
    const block = rest.slice(0, end).trim();
    return block.length >= 80 ? block : null;
  };
  const byHeader = {
    path_home: findBlock(homeTeam, awayTeam),
    path_away: findBlock(awayTeam, homeTeam),
  };
  if (byHeader.path_home && byHeader.path_away) return byHeader;

  // EMERGENCY ONLY (founder law, Aug 18: fallbacks are for emergencies, not
  // a second main path): the Pass 1 ask now contracts EXACT headings, so
  // landing here means the format contract failed — log it loudly so the
  // contract gets fixed, then salvage by validator-style attribution.
  console.warn(`[JuneEngine] ⚠️ bilateral heading contract MISSED (home=${!!byHeader.path_home}, away=${!!byHeader.path_away}) — salvaging paths by paragraph attribution. If this repeats, the Pass 1 heading contract needs attention.`);
  const nick = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean).pop() || '';
  const hN = nick(homeTeam), aN = nick(awayTeam);
  if (!hN || !aN || hN === aN) return byHeader;
  const hRe = new RegExp(`\\b${esc(hN)}\\b`, 'i'), aRe = new RegExp(`\\b${esc(aN)}\\b`, 'i');
  const homeParas = [], awayParas = [];
  for (const para of text.split(/\n\s*\n/)) {
    const t = para.trim();
    if (t.length < 80 || /INVESTIGATION COMPLETE/i.test(t)) continue;
    const h = hRe.test(t), a = aRe.test(t);
    if (h && !a) homeParas.push(t);
    else if (a && !h) awayParas.push(t);
  }
  const join = (arr) => arr.length ? arr.join('\n\n').slice(0, 1600) : null;
  return {
    path_home: byHeader.path_home || join(homeParas),
    path_away: byHeader.path_away || join(awayParas),
  };
}

function createJunePromptReader() {
  let _junePromptShaFn = null;
  async function junePromptSha() {
    if (!_junePromptShaFn) {
      ({ junePromptSha: _junePromptShaFn } = await import('../../../src/services/agentic/orchestrator/junePromptSha.js'));
    }
    return _junePromptShaFn();
  }
  return junePromptSha;
}
const defaultPaths = extractJuneBilateralPaths;

export function createMlbJuneLane({ analyzeGameJune, runGameBrainCascade,
  MLB_JUNE_BRAIN_MODEL, GAME_FALLBACK_MODELS, winnersAdmin, shouldStore, useTestTable,
  args, isProductionWinnersRun, prepareMlbScoutInput = defaultScoutInput,
  assertMlbScoutReadiness = defaultScoutReadiness, recordMlbDataFailure = defaultRecordFailure,
  openMlbDataFailure = defaultOpenFailure,
  readMlbExpectationMemory = defaultMemory, createMlbJudgmentJournal = defaultJournal,
  mlbCaseHeadings = defaultCaseHeadings, extractJuneBilateralPaths = defaultPaths,
  junePromptSha = createJunePromptReader(), console = globalThis.console }) {
  async function runMlbJuneEngine(game, runnerOptions, preflight = null) {
    // A game that failed the MLB house limit stays failed (founder, Sep 24
    // 2026: no retry; he is alerted and the cause is investigated).
    const houseLimit = openMlbDataFailure(game, [MLB_HOUSE_LIMIT_CODE]);
    if (houseLimit) {
      console.error(`[JuneEngine] 🚫 ${game.away_team} @ ${game.home_team} already failed the MLB house limit (${houseLimit.error}) — no retry.`);
      return { error: houseLimit.error, code: MLB_HOUSE_LIMIT_CODE, retryModel: false };
    }
    try {
      game = await prepareMlbScoutInput(game, { signal: runnerOptions.signal });
    } catch (error) {
      runnerOptions.signal?.throwIfAborted();
      recordMlbDataFailure(game, error);
      throw new MlbRequiredDataError(error.message);
    }
    console.log(`[MLB Scout Input] MLB team IDs: ${game.home_team}=${game.home_team_data.id}, ${game.away_team}=${game.away_team_data.id}; both named rosters verified`);
    // ONE PICK SYSTEM (founder, Aug 27: "no need for a full fallback other
    // pick system... fallback to another one like opus is fine"): a failure
    // re-runs the SAME engine — same desk, same prompts — on the next model
    // in the cascade. The separate pickdesk brain is retired.
    runnerOptions.signal?.throwIfAborted();
    // THE FOUR JUDGMENT STAGES ARE OFF (founder, Sep 9 2026: "just remove that stress
    // test thing… the odds should be shown up front just like the rest of the
    // info, that is how NFL works"). An MLB pick ends at the card, as football
    // does. GARY_MLB_JUDGMENT=on revives the Sep 8 stages and their ledger.
    const production = isProductionWinnersRun({ shouldStore, useTestTable, dryRun: args.includes('--dry-run') }) && runnerOptions.mlbJudgment !== false;
    const cutoff = new Date().toISOString();
    const date = new Date(game.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    // A read failure is recorded explicitly; unavailable memory cannot masquerade
    // as reviewed evidence. No historical notebook is substituted.
    const memory = production ? await readMlbExpectationMemory({ db: winnersAdmin, date, before: cutoff, signal: runnerOptions.signal })
      .catch(error => {
        runnerOptions.signal?.throwIfAborted();
        return { rows: [], text: '', unavailable: error.message, cutoff };
      }) : null;
    if (memory?.unavailable) console.warn(`[MLB Memory] ${memory.unavailable}`);
    const attempt = async (model, brainOptions) => {
      runnerOptions.signal?.throwIfAborted();
      const promptSha = production ? await junePromptSha() : null;
      runnerOptions.signal?.throwIfAborted();
      const journal = production ? createMlbJudgmentJournal({ db: winnersAdmin, game, model, promptSha, signal: runnerOptions.signal }) : null;
      let decision;
      try {
        decision = await analyzeGameJune(game, 'baseball_mlb', { ...runnerOptions, ...brainOptions, modelOverride: model,
          mlbJudgmentJournal: journal, mlbExpectationMemory: memory });
        runnerOptions.signal?.throwIfAborted();
        // THE MLB HOUSE LIMIT (founder, Sep 24 2026): the desk names the
        // game's tickets up front; a moneyline past -200 is never swapped onto
        // the run line and never retried. The game fails and he is alerted.
        if (mlbMoneylinePastLimit(decision)) {
          decision = { error: `Gary returned ${decision.pick}, a moneyline past the ${MLB_ML_CAP} MLB limit. No pick was published and the game is not retried.`,
            code: MLB_HOUSE_LIMIT_CODE, retryModel: false };
        }
        if (decision?.pick && !decision.error) {
          // Revalidate the actual report attached by the orchestrator, never a
          // model's claim that its own data was complete.
          decision._inputReadiness = assertMlbScoutReadiness(decision._context?.scoutReport, game);
        }
        if (production && decision?.pick && !decision.error && !decision._mlbJudgment?.receipts?.price_assessment) {
          decision = { error: 'Production MLB decision did not complete its durable judgment stages' };
        }
      } catch (error) {
        // Cancellation abandons the game; it is not a model failure that should
        // launch the same research again on another brain.
        runnerOptions.signal?.throwIfAborted();
        decision = { error: error.message, code: error.code, retryModel: error.retryModel };
      }
      if (decision?.error || !decision?.pick) {
        await journal?.fail(decision?.error || 'No final MLB card').catch(error => console.warn(`[MLB Journal] Failure receipt unavailable: ${error.message}`));
      } else if (journal) decision._mlbJudgmentJournal = journal;
      return decision;
    };
    const result = await runGameBrainCascade([MLB_JUNE_BRAIN_MODEL, ...GAME_FALLBACK_MODELS], attempt,
      { signal: runnerOptions.signal, preflight, retryPrimary: true });
    if (result?.error || !result?.pick) {
      if (result?.code === MLB_HOUSE_LIMIT_CODE) {
        recordMlbDataFailure(game, result);
        console.error(`[JuneEngine] 🚫 ${game.away_team} @ ${game.home_team}: ${result.error}`);
        return result;
      }
      if (result?.code === 'required_data_unavailable') {
        recordMlbDataFailure(game, result);
        console.error(`[JuneEngine] Required MLB data failed for ${game.away_team} @ ${game.home_team}; no pick and no model retry: ${result.error}`);
        throw new MlbRequiredDataError(result.error);
      }
      console.error(`[JuneEngine] 🚫 every model in the cascade failed for ${game.away_team} @ ${game.home_team} (${result?.error || 'no pick'}) — no pick for this game. There is no second system.`);
      return result?.error ? result : { error: 'june engine exhausted: no model produced a pick' };
    }
    // Storage-contract fields (paths, model, era stamp). Bilateral cases live
    // in the PASS 1 message — rawAnalysis holds only the LAST assistant
    // message (Pass 2), so extract from the full narrative (Aug 18 finding).
    const raw = result._fullAssistantNarrative || result._context?.fullAssistantNarrative
      || result.rawAnalysis || result._context?.rawAnalysis || '';
    const paths = extractJuneBilateralPaths(raw, game.home_team, game.away_team);
    result.path_home = result.path_home ?? paths.path_home;
    result.path_away = result.path_away ?? paths.path_away;
    // THE CASE ORDER (Sep 2 2026): which club's case was written last —
    // the ledger's measurement of "last case wins".
    result.case_last = result.case_last ?? mlbCaseHeadings(game.home_team, game.away_team, game).lastSide;
    result._modelUsed = result._modelUsed ?? MLB_JUNE_BRAIN_MODEL;
    result._promptSha = result._promptSha ?? await junePromptSha();
    // This marker was loaded with this process's MLB prompts, before analysis.
    // It belongs to the new decision, never an existing or recovered publication.
    result.decision_policy ??= MLB_DECISION_POLICY;
    runnerOptions.signal?.throwIfAborted();
    return result;
  }
  return runMlbJuneEngine;
}
