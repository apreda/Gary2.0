/**
 * DFS Advisor — Competing Lineup Theses
 *
 * Spawned mid-loop inside Gary's DFS agent loop.
 * An independent Flash session reviews ALL Flash research findings and
 * builds 2-3 competing lineup THESES.
 *
 * NOT full lineups — strategic archetypes with named players, stacks,
 * and reasoning. Gary evaluates these alongside his own analysis.
 *
 * Modeled after game picks bilateral analysis — text only,
 * no tools, single API call, HIGH thinking.
 *
 * FOLLOWS CLAUDE.md: Flash proposes, Gary decides. No conclusions.
 */

import { GEMINI_FLASH_MODEL, getGeminiClient } from '../modelConfig.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ADVISOR SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

function getAdvisorSystemPrompt(sport) {
  return `<role>
You are an independent DFS analyst reviewing investigation data for a ${sport} slate.
Your job is to build 2-3 COMPETING lineup theses — different strategic approaches to this slate.
These are NOT full lineups. They are strategic ARCHETYPES with specific players, stacks, and reasoning.
</role>

<training_data_warning>
Your training data is from 2024 and is 18+ months out of date. Players may have been traded, retired, or changed teams since then.
USE ONLY the investigation data provided below. If your memory conflicts with the data, USE THE DATA.
Do NOT cite coaching tendencies, player reputations, or team identities from training knowledge — ONLY cite facts from the investigation data.
</training_data_warning>

<instructions>
For each thesis, provide:
1. **THESIS NAME** — A short label (e.g., "Chalky Stars Build", "Contrarian Value Stack", "Game Stack Blowup")
2. **PRIMARY GAME STACK** — Which game to concentrate in and WHY (cite O/U, spread, pace, injury data)
3. **ANCHOR PLAYERS** — 2-3 specific players by name with salary and the data supporting them
4. **CEILING SCENARIO** — What specifically needs to happen for this approach to hit the winning target
5. **RISK PROFILE** — What goes wrong, what's the floor
6. **DIFFERENTIATION** — Why this approach is DIFFERENT from the others (not a slight variation)

Each thesis should represent a genuinely different strategic direction:
- One might concentrate on a specific game environment where the data supports correlation
- Another might spread exposure across multiple games for diversification
- Another might lean into a contrarian spot (underdog game, overlooked value)

Use ONLY players and data from the investigation summaries. Do NOT invent players or stats.
</instructions>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD ADVISOR INPUT
// ═══════════════════════════════════════════════════════════════════════════════

function buildAdvisorInput(flashResearch, context) {
  const { winningTargets, games, injuries } = context;

  // Game environments from context
  const gameLines = (games || [])
    .sort((a, b) => (b.overUnder || b.total || 0) - (a.overUnder || a.total || 0))
    .map(g => {
      const home = g.homeTeam || g.home_team || '';
      const away = g.awayTeam || g.visitor_team || g.away_team || '';
      return `${away} @ ${home}: O/U ${g.overUnder || g.total || '?'} | Spread ${g.spread || '?'}`;
    })
    .join('\n');

  // Injury highlights from context.injuries
  const injuryLines = Object.entries(injuries || {})
    .filter(([_, teamInj]) => teamInj && teamInj.length > 0)
    .map(([team, teamInj]) => {
      const outs = teamInj
        .filter(i => {
          const st = (i.status || '').toUpperCase();
          return st.includes('OUT') || st === 'OFS' || st.includes('DOUBTFUL');
        })
        .map(i => {
          const name = i.player?.first_name ? `${i.player.first_name} ${i.player.last_name}` : i.player;
          return `${name} (${i.duration || i.status})`;
        });
      return outs.length > 0 ? `${team}: ${outs.join(', ')}` : null;
    })
    .filter(Boolean)
    .join('\n');

  // Per-game Flash research briefings
  const perGameSummaries = (flashResearch || [])
    .map(r => `### ${r.game}\n${(r.briefing || '').slice(0, 2000)}`)
    .join('\n\n');

  return `## WINNING TARGETS
- To WIN: ${winningTargets.toWin} pts
- Top 1%: ${winningTargets.top1Percent} pts

## GAME ENVIRONMENTS (sorted by O/U)
${gameLines || 'No game environment data'}

## INJURY LANDSCAPE
${injuryLines || 'No significant injuries'}

## PER-GAME FLASH RESEARCH
${perGameSummaries || 'No per-game research'}

## YOUR TASK
Build 2-3 competing lineup theses. Each must be a genuinely different strategic approach to this slate. Name specific players, cite specific data, and explain the ceiling scenario for each.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build competing lineup theses via an independent Flash session.
 * Text only, no tools, single API call. Non-fatal — returns null on failure.
 *
 * @param {GoogleGenerativeAI} genAI - Gemini client
 * @param {Array} flashResearch - Per-game Flash research findings
 * @param {Object} context - DFS context (games, injuries, winningTargets)
 * @param {Object} [options] - Model options
 * @returns {{ theses: string, generationTime: string } | null}
 */
export async function buildDFSAdvisorTheses(genAI, flashResearch, context, options = {}) {
  const { modelName = GEMINI_FLASH_MODEL, _costTracker } = options;
  const sport = (context.sport || 'NBA').toUpperCase();
  const startTime = Date.now();

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: getAdvisorSystemPrompt(sport),
      generationConfig: {
        temperature: 1.0,
        maxOutputTokens: 32768
      },
      thinkingConfig: {
        thinkingBudget: 8192 // Capped — advisor theses don't need unlimited reasoning
      }
    });

    const advisorInput = buildAdvisorInput(flashResearch, context);
    console.log(`[DFS Advisor] Sending ${advisorInput.length} chars to Flash (text only, no tools)`);

    const result = await model.generateContent(advisorInput);
    if (_costTracker) {
      const meta = result.response?.usageMetadata;
      if (meta) _costTracker.addUsage(modelName, { prompt_tokens: meta.promptTokenCount || 0, completion_tokens: meta.candidatesTokenCount || 0 });
    }
    const theses = result.response.text() || '';

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!theses || theses.trim().length < 100) {
      console.warn(`[DFS Advisor] Response too short (${theses.length} chars) after ${elapsed}s`);
      return null;
    }

    console.log(`[DFS Advisor] ✓ Produced theses in ${elapsed}s (${theses.length} chars)`);
    return { theses, generationTime: `${elapsed}s` };

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.warn(`[DFS Advisor] ⚠️ Failed after ${elapsed}s: ${error.message} — proceeding without theses`);
    return null;
  }
}
