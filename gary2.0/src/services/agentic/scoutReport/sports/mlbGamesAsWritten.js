/**
 * THE LAST GAMES, AS WRITTEN (founder GO, Aug 27 — "yes pen as articles and
 * every section should have articles").
 *
 * The desk already carries complete official MLB.com recaps for the
 * probables' recent starts (the Aug-26 article backbone). What it did not
 * guarantee is the article for each TEAM's most recent games — the games the
 * bullpen actually worked: when the starter came out, who relieved him, what
 * happened after. Those recaps exist for every final (statsapi editorial),
 * arrive whole, and cache to ~$0.
 *
 * This module is selection + rendering only. Fetching stays in mlb.js's
 * cached fetchGameStory so there is ONE story cache; callers pass the pks
 * already printed elsewhere on the desk (probables' starts, wire stories) so
 * no article prints twice — the team lanes point instead of reprinting.
 *
 * Founder laws honored here: stories arrive UNTRIMMED (no caps, no
 * sentence-trims); the only bound is structural — last game plus the current
 * series' games, which a series' own length limits. Facts only: a game with
 * no published recap is omitted, never summarized from memory.
 */

import { toEtDate, clubMatches } from './mlbSeriesState.js';

/** Winner/loser-aware final-score label from a schedule row, team-first. */
function finalLabel(game, teamName) {
  const a = Number(game?.teams?.away?.score ?? NaN);
  const h = Number(game?.teams?.home?.score ?? NaN);
  if (!Number.isFinite(a) || !Number.isFinite(h)) return '';
  const isHome = clubMatches(game?.teams?.home?.team?.name, teamName);
  const us = isHome ? h : a;
  const them = isHome ? a : h;
  const wl = us > them ? 'W' : us < them ? 'L' : 'T';
  return `${wl} ${us}-${them}`;
}

/** Opponent label ("vs Cubs" / "@ Cubs") from a schedule row. */
function vsLabel(game, teamName) {
  const isHome = clubMatches(game?.teams?.home?.team?.name, teamName);
  const opp = isHome ? game?.teams?.away?.team?.name : game?.teams?.home?.team?.name;
  return `${isHome ? 'vs' : '@'} ${opp || 'opponent'}`;
}

/**
 * The games whose full recaps belong on this team's desk tonight: the most
 * recent completed game, plus every game of the CURRENT series against
 * tonight's opponent (the unbroken newest-first run — same walk as
 * computeMlbSeriesState). Deduped against `printedPks` (articles already on
 * the desk elsewhere) and against itself (the last game often IS a series
 * game). Newest first.
 *
 * @param {object} args
 * @param {string} args.teamName            full club name for side detection
 * @param {string} args.opponentName        tonight's opponent (series walk)
 * @param {Array}  args.recentGames         MLB schedule rows, oldest→newest
 * @param {Iterable<number|string>} [args.printedPks] gamePks already printed
 * @returns {Array<{ gamePk: number, date: string|null, label: string, final: string }>}
 */
export function selectStoryGames({ teamName, opponentName, recentGames, printedPks = [] }) {
  const games = Array.isArray(recentGames) ? recentGames.filter((g) => g?.gamePk) : [];
  if (games.length === 0) return [];
  const printed = new Set([...printedPks].map(String));

  const isPairGame = (g) => {
    const home = g?.teams?.home?.team?.name;
    const away = g?.teams?.away?.team?.name;
    const names = [home, away];
    return names.some((n) => clubMatches(n, teamName)) && names.some((n) => clubMatches(n, opponentName));
  };

  const chosen = [];
  const seen = new Set();
  const push = (g) => {
    const pk = String(g.gamePk);
    if (seen.has(pk) || printed.has(pk)) return;
    seen.add(pk);
    chosen.push({
      gamePk: g.gamePk,
      date: g.officialDate || (g.gameDate ? toEtDate(g.gameDate) : null),
      label: vsLabel(g, teamName),
      final: finalLabel(g, teamName),
    });
  };

  // Most recent completed game, always.
  push(games[games.length - 1]);

  // The current series vs tonight's opponent: unbroken run, newest-first.
  for (let i = games.length - 1; i >= 0; i--) {
    if (isPairGame(games[i])) push(games[i]);
    else break;
  }

  return chosen;
}

/**
 * Render the section. `entries` = selectStoryGames rows joined with their
 * fetched stories: { gamePk, date, label, final, story: { headline, body } }.
 * Entries with no story body are dropped (no recap published — say nothing,
 * never reconstruct). Bodies print WHOLE.
 */
export function renderGamesAsWritten(teamName, entries) {
  const withBody = (entries || []).filter((e) => e?.story?.body);
  if (withBody.length === 0) return '';
  const lines = [`═══ ${teamName.toUpperCase()} — THE LAST GAMES, AS WRITTEN ═══`];
  for (const e of withBody) {
    const head = [e.date, e.label, e.final].filter(Boolean).join(' ');
    const title = e.story.headline ? ` — ${e.story.headline}` : '';
    const body = String(e.story.body).replace(/\s*\n+\s*/g, ' ').trim();
    lines.push(`${head}${title}: ${body}`);
  }
  return lines.join('\n\n');
}

/**
 * THE PEN, AS REPORTED (option A — the press beat on the bullpen).
 * One grounded search query per team, riding the existing press machinery
 * and its freshness/budget bounds at the call site. Fan-parity voice:
 * everything a fan reading the beat would know about the pen, as reported,
 * attributed — awareness only, no conclusions asked for and none implied.
 */
export function buildPenPressQuery(teamName) {
  return (
    `MLB: what the press is reporting about the ${teamName} bullpen right now — ` +
    `how the pen has actually been used in the current series and the last few games as written by reporters ` +
    `(who has been entrusted with late innings, who worked multiple days, who was unavailable and why), ` +
    `any meltdowns or escapes as described in game coverage, the closer situation and any role changes as reported, ` +
    `fresh reliever injuries, activations, call-ups or option moves, and manager comments about bullpen decisions or availability. ` +
    `Attribute claims to the outlet. Report only what has been published — no predictions, no betting advice, no opinions of your own.`
  );
}
