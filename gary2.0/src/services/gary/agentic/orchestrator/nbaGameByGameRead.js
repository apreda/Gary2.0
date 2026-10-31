/**
 * THE NBA GAME-BY-GAME READ (Oct 27 2026, founder GO; the second system, run beside the live read and never
 * published). Built from the stored game records (gameRecordStore.js), in three parts:
 *   - TONIGHT: everything known before tip: the spread he bets, the league's injury report, the projected starters,
 *     what is different tonight from the games shown (a regular out tonight who played the last game, one back who
 *     did not), each team's rest and trip and its next game;
 *   - THIS SEASON'S MEETINGS between the two teams, in full;
 *   - each team's last NBA_WINDOW games in full, the same detail for every one, then one line for each older game.
 * No season averages, ranks or totals; a record is the count of the games shown. The news is the live read's news
 * without its recaps of past games, which the records hold. Facts only.
 */
import { matchupHeader, spreadInWords } from './footballDeskText.js';
import { newsWithoutRecaps } from './newsWithoutRecaps.js';
import { nbaLineOf, injuriesAsReported, projectedStarters, reportOfDesk, reportDay, tipOf, availableListed, injuryHeading } from './nbaRead.js';
import { latestOfficialReport, gameListing, playerKey, samePlayerIn } from '../../../providers/nbaOfficialInjuryReport.js';
import { ballDontLieService } from '../../../providers/ballDontLieService.js';
import { findTeam } from '../scoutReport/shared/utilities.js';
import { nbaSeason } from '../../../../utils/dateUtils.js';
import { cupWords } from '../../../sports/nba/nbaBettorData.js';
import { saveGameRecord, storedGameIds, teamRecords, seasonSummaries, recordsById } from '../../../gamebygame/gameRecordStore.js';
import { buildNbaGameRecord, NBA_RECORD_VERSION, settingOf } from '../../../sports/nba/nbaGameRecord.js';
import { fullGameText, shortGameText, summariesByTeam, sideOf, resultLine, wonLost, reasonsOnce } from '../../../sports/nba/nbaGameRecordText.js';

export const NBA_WINDOW = 10;
const SHORT_LINES = 15;
const etDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const etDay = (ymd) => new Date(`${String(ymd).slice(0, 10)}T16:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
const ord = (n) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;

/** Builds any of the season's finished games missing from the store (the morning job keeps it current; this catches up). */
export async function ensureNbaRecords(season = nbaSeason()) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const games = ((await ballDontLieService.getGames('basketball_nba', { seasons: [season], end_date: today, per_page: 100, paginateAll: true })) || []).filter((g) => /final/i.test(String(g.status)));
  const stored = await storedGameIds('NBA', season);
  // A game of the last two days is built again while a part that posts after the final is missing (the advanced box,
  // ESPN's official box and venue, the report at tip, the box by quarter: Oct 28 2026, games built an hour after the
  // final read "0 by quarter" for every player).
  const recent = new Date(Date.now() - 2 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const LATE = ['the advanced box is on file', 'the official team box is on file', 'the venue is on file', 'the injury report at tip is on file',
    "each player's quarters add up to his minutes and points"];
  // The league corrects a box days after the final (Oct 28 2026: Clingan's 10 rebounds at Sacramento on Oct 23 became
  // 11 and Camara's 3 became 2 after the record was built on Oct 27): a game is built again the morning after (8 AM ET;
  // Oct 29 2026 hunt: ESPN moved Washington's fast-break points at Cleveland from 10 to 12 overnight), two days and seven
  // days after its date, once each.
  // Again at 2 PM ET the day after: ESPN's box can still be settling in the morning (Oct 29 2026 hunt: Jalen Johnson's
  // blocks went 1 to 2 at 10:55 AM and back to 1 by noon, and the record kept the 2).
  const at = (ymd, days, hourUtc = 12) => Date.parse(`${String(ymd).slice(0, 10)}T00:00:00Z`) + days * 86_400_000 + hourUtc * 3_600_000;
  const beforeCorrections = (s) => Boolean(s.builtAt) && [[1, 12], [1, 18], [2, 12], [7, 12]].some(([d, h]) => Date.parse(s.builtAt) < at(s.date, d, h) && Date.now() >= at(s.date, d, h));
  const missing = games.filter((g) => { const s = stored.get(String(g.id)); return !s || s.version !== NBA_RECORD_VERSION || beforeCorrections(s) || (String(s.date) >= recent && s.failed.some((c) => LATE.includes(c))); });
  const failed = [];
  // A correction rebuild that lost a part the stored record had (an ESPN call that failed this pass) keeps the stored
  // record and tries again next pass (Oct 29 2026 hunt, round 7).
  for (const g of missing) {
    try {
      const { row } = await buildNbaGameRecord(g.id);
      const s = stored.get(String(g.id));
      const lost = s && s.version === NBA_RECORD_VERSION ? row.checks.filter((c) => !c.ok && LATE.includes(c.check) && !s.failed.includes(c.check)).map((c) => c.check) : [];
      if (lost.length) { failed.push(`${g.id}: kept the stored record (the rebuild lost: ${lost.join(', ')})`); continue; }
      await saveGameRecord(row);
    } catch (e) { failed.push(`${g.id}: ${e.message}`); }
  }
  return { built: missing.length - failed.length, failed };
}

// Tonight's rest and trip for one team, and its next game.
async function tonightSetting(tonight, team, games) {
  const s = await settingOf(tonight, team, games);
  const short = team.name;
  const rest = s.daysOff == null ? 'first game of the season' : s.daysOff === 0 ? 'second night of a back-to-back' : `${s.daysOff} day${s.daysOff === 1 ? '' : 's'} off`;
  const four = s.gamesInFourNights >= 3 ? `, ${ord(s.gamesInFourNights)} game in four nights` : '';
  const trip = !s.prev ? '' : `; last game ${s.prev.home ? 'vs' : '@'} ${s.prev.opponent} (${etDay(s.prev.date)}, ${s.prev.city || 'city not on file'}), ${s.miles == null ? 'miles not on file' : s.miles === 0 ? 'same arena' : `about ${s.miles.toLocaleString('en-US')} miles${s.tzShift ? `, ${Math.abs(s.tzShift)} time zone${Math.abs(s.tzShift) === 1 ? '' : 's'} ${s.tzShift > 0 ? 'east' : 'west'}` : ''}`}`;
  const where = s.venue ? ` at ${s.venue.name}, ${s.venue.city}${s.altitudeFt ? ` (${s.altitudeFt.toLocaleString('en-US')} ft)` : ''}${s.venue.neutral ? ', a neutral site' : ''}` : '';
  const tip = Date.parse(tonight.datetime);
  const next = games.filter((x) => Date.parse(x.datetime || x.date) > tip).sort((a, b) => Date.parse(a.datetime || a.date) - Date.parse(b.datetime || b.date))[0];
  const nextText = next ? `; next game ${next.home_team.id === team.id ? 'vs' : '@'} ${(next.home_team.id === team.id ? next.visitor_team : next.home_team).full_name} (${etDay(next.date)})` : '';
  return `• ${tonight.home_team.id === team.id ? `${short}, at home` : `${short}, on the road`}${where}: ${rest}${four}${trip}${nextText}`;
}

// What is different tonight from the games shown: each regular (started one of them, or played 15+ minutes in two)
// listed tonight, or back tonight after missing the last game. It points to the games; it concludes nothing. (Oct 29 2026
// hunt: a regular Out tonight who also missed the last game was left out, and the line read "no regular ... is listed
// tonight" over Keegan Murray, Out; a team that had not filed read the same.)
function whatsDifferent(team, records, listing) {
  const shown = records.slice(0, NBA_WINDOW).map((r) => r.record);
  if (!shown.length) return `${team.name}: no games yet`;
  const regulars = new Map();
  for (const rec of shown) for (const p of rec.players.filter((x) => x.side === sideOf(rec, team.id))) {
    const e = regulars.get(p.name) || { name: p.name, starts: 0, big: 0, played: [], missed: [] };
    if (p.starter) e.starts += 1; if (p.min >= 15) e.big += 1;
    regulars.set(p.name, e);
  }
  for (const e of regulars.values()) for (const rec of shown) {
    const p = rec.players.find((x) => x.side === sideOf(rec, team.id) && x.name === e.name);
    (p && p.min > 0 ? e.played : e.missed).push(etDay(rec.date).replace(/^\w+, /, ''));
  }
  const last = shown[0];
  const lines = [];
  for (const e of [...regulars.values()].filter((x) => x.starts > 0 || x.big >= 2)) {
    // The report's name for him, which can differ from the feed's ("Ace Bailey", "Airious Bailey").
    const listed = listing === 'unfiled' || !listing ? null : samePlayerIn(e.name, [...listing.values()].map((r) => r.name), [...regulars.keys()]);
    const tonight = listed ? listing.get(playerKey(listed)) : null;
    const status = tonight?.status && tonight.status !== 'Available' ? tonight.status : null;
    const available = tonight?.status === 'Available';
    const playedLast = last.players.some((p) => p.side === sideOf(last, team.id) && p.name === e.name && p.min > 0);
    const games = `played ${e.played.length} of the ${shown.length} games below${e.missed.length ? `, not in ${e.missed.join(', ')}` : ''}`;
    if (status) lines.push(`  ${e.name}: ${status} tonight; ${games}`);
    else if (!playedLast && available) lines.push(`  ${e.name}: listed Available tonight${tonight.reason ? ` (${String(tonight.reason).replace(/^Injury\/Illness - /, '')})` : ''}; did not play the last game; ${games}`);
    else if (!playedLast && listing && listing !== 'unfiled') lines.push(`  ${e.name}: not on tonight's injury report; did not play the last game; ${games}`);
  }
  const none = listing === 'unfiled' ? " tonight's injury report not filed yet" : !listing ? " tonight's injury report not on file"
    : ' no regular of the games below is listed tonight or back tonight';
  return `${team.name}:${lines.length ? `\n${lines.join('\n')}` : none}`;
}

/** The game as the game-by-game system shows it. `news` is the live read's news for the same desk. */
export async function buildNbaGameByGameStory(desk, { homeTeam, awayTeam, asOf = new Date(), news = '' } = {}) {
  const season = nbaSeason(asOf);
  const teams = await ballDontLieService.getTeams('basketball_nba');
  const home = findTeam(teams, homeTeam), away = findTeam(teams, awayTeam);
  if (!home || !away) throw new Error(`game-by-game read: team not found (${awayTeam} @ ${homeTeam})`);
  const tip = tipOf(desk, asOf) || new Date(asOf).toISOString();
  const today = etDate(tip);
  const [homeGames, awayGames, summaries, homeRecs, awayRecs] = await Promise.all([
    ballDontLieService.getGames('basketball_nba', { team_ids: [home.id], seasons: [season], per_page: 100, paginateAll: true }),
    ballDontLieService.getGames('basketball_nba', { team_ids: [away.id], seasons: [season], per_page: 100, paginateAll: true }),
    seasonSummaries('NBA', season, today),
    teamRecords('NBA', season, home.id, today, NBA_WINDOW),
    teamRecords('NBA', season, away.id, today, NBA_WINDOW),
  ]);
  const byTeam = summariesByTeam(summaries);
  const tonight = (homeGames || []).find((g) => g.visitor_team.id === away.id && etDate(g.datetime || `${g.date}T23:00:00Z`) === today);

  // Tonight's listing, from the report the desk's injury list came from.
  const anchor = await reportOfDesk(desk, { homeTeam, awayTeam, gameDate: reportDay(tip), asOf }).catch(() => null);
  let listing = null;
  if (anchor) {
    try { listing = gameListing(await latestOfficialReport({ now: new Date(anchor.postedAt), lookbackHours: 0.25 }), reportDay(tip), homeTeam, awayTeam); } catch { listing = null; }
  }

  // Tonight's NBA Cup stage (Oct 29 2026 hunt, round 7: all ten Oct 30 games were group play and neither read said so).
  const cup = cupWords(tonight?.ist_stage);
  const header = [matchupHeader(desk), cup ? `${cup}.` : null, spreadInWords(nbaLineOf(desk))].filter(Boolean).join('\n');
  const injuries = injuriesAsReported(desk, { homeTeam, awayTeam });
  const available = await availableListed(desk, { homeTeam, awayTeam, tip, asOf });
  const tonightPart = ['TONIGHT',
    [projectedStarters(desk), injuries ? `${await injuryHeading(desk, { homeTeam, awayTeam, tip, asOf })}\n${injuries}` : 'Official NBA injury report: not on file.', available].filter(Boolean).join('\n\n'),
    '',
    `What is different tonight from the games shown below${listing ? '' : " (tonight's report not on file)"}:`,
    whatsDifferent(away, awayRecs, listing?.[awayTeam]),
    whatsDifferent(home, homeRecs, listing?.[homeTeam]),
    '',
    'Rest and travel:',
    tonight ? (await Promise.all([tonightSetting(tonight, away, awayGames || []), tonightSetting(tonight, home, homeGames || [])])).join('\n') : 'not on file (tonight\'s game is not in the schedule feed)'].join('\n');

  // Every meeting this season, from the season's summaries (however far back), each in full.
  const meetingIds = (byTeam.get(String(away.id)) || []).filter((r) => [String(r.summary.home.id), String(r.summary.away.id)].includes(String(home.id))).map((r) => r.game_id);
  const meetings = (await recordsById('NBA', meetingIds)).reverse();
  const meetingSet = new Set(meetings.map((r) => String(r.game_id)));
  const meetingPart = meetings.length
    ? `THIS SEASON'S MEETINGS (${meetings.length}), shown from the ${away.name}' side\n${meetings.map((r) => fullGameText(r.record, away.id, byTeam)).join('\n\n')}`
    : "THIS SEASON'S MEETINGS: none before tonight";

  const teamPart = (team, recs) => {
    if (!recs.length) return `${team.full_name.toUpperCase()}: no games yet this season`;
    const all = byTeam.get(String(team.id)) || [];
    const full = recs.slice(0, NBA_WINDOW).map((r) => {
      const row = all.find((x) => String(x.game_id) === String(r.game_id));
      return meetingSet.has(String(r.game_id)) && row ? `${resultLine(row, team.id)}: in this season's meetings above` : fullGameText(r.record, team.id, byTeam);
    });
    const olderAll = all.filter((r) => !recs.slice(0, NBA_WINDOW).some((x) => String(x.game_id) === String(r.game_id))).reverse();
    const older = olderAll.slice(0, SHORT_LINES);
    const cutOff = olderAll.length - older.length;
    return [`${team.full_name.toUpperCase()}: ${wonLost(all, team.id)} this season${all.length > NBA_WINDOW ? `; the last ${NBA_WINDOW} in full, newest first, then ${cutOff ? `the ${older.length} before them in one line each (the ${cutOff} earliest not shown)` : 'one line for each older game'}` : ', every game below, newest first'}`,
      full.join('\n\n'),
      older.length ? `Older games, one line each:\n${older.map((r) => shortGameText(r, team.id)).join('\n')}` : null].filter(Boolean).join('\n\n');
  };

  // Every team's record before tonight, by conference, alphabetical: what any team named anywhere in the read has done
  // (a count of its games; no averages, and no standings order: round 9, sorted best first it was a conference place).
  const conf = (c) => teams.filter((t) => t.conference === c && byTeam.has(String(t.id)))
    .map((t) => { const rows = byTeam.get(String(t.id)); const [w, l] = wonLost(rows, t.id).split('-').map(Number); return { t, w, l }; })
    .sort((a, b) => String(a.t.abbreviation).localeCompare(String(b.t.abbreviation)))
    .map(({ t, w, l }) => `${t.abbreviation} ${t.name} ${w}-${l}`).join(' · ');
  const standings = `LEAGUE RECORDS BEFORE TONIGHT\nEast: ${conf('East')}\nWest: ${conf('West')}`;

  const finals = new Set(summaries.map((r) => `${r.summary.home.score}-${r.summary.away.score}`));
  // Each absentee's reason at tip said the first time, by name after (round 16: the same reasons on every game).
  const story = reasonsOnce([header, tonightPart, standings, meetingPart, teamPart(away, awayRecs), teamPart(home, homeRecs)].join('\n\n').split('\n'), (l) => /^\s*injury report at tip:/.test(l)).join('\n');
  return { line: nbaLineOf(desk), story, news: newsWithoutRecaps(news, finals) };
}
