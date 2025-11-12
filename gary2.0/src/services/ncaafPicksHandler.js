import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { makeGaryPick } from './garyEngine.js';
import { computeRecommendedSportsbook } from './recommendedSportsbook.js';
import { perplexityService } from './perplexityService.js';
import { processGameOnce } from './picksService.js';

const SPORT_KEY = 'americanfootball_ncaaf';

export async function generateNCAAFPicks(options = {}) {
  console.log('Processing NCAAF games');
  if (options.nocache) {
    console.log('NCAAF nocache mode: clearing Ball Don\'t Lie cache');
    ballDontLieService.clearCache();
  }
  const games = await oddsService.getUpcomingGames(SPORT_KEY, { nocache: options.nocache === true });
  console.log(`Found ${games.length} NCAAF games from odds service`);

  const now = new Date();
  const end = new Date(now.getTime() + 16 * 60 * 60 * 1000);
  let windowed = games.filter(g => {
    const t = new Date(g.commence_time);
    return t >= now && t <= end;
  });
  console.log(`After date filtering: ${windowed.length} NCAAF games in next 16h`);

  if (typeof options.onlyAtIndex === 'number') {
    const idx = options.onlyAtIndex;
    windowed = idx >= 0 && idx < windowed.length ? [windowed[idx]] : [];
  }

  const season = new Date().getFullYear();
  const picks = [];

  for (const game of windowed) {
    const gameId = `ncaaf-${game.id}`;
    const result = await processGameOnce(gameId, async () => {
      console.log(`Processing NCAAF game: ${game.away_team} @ ${game.home_team}`);

      const homeTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team);
      const awayTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team);
      if (!homeTeam || !awayTeam) {
        console.warn(`NCAAF: Could not resolve teams for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      const [homeTeamStats, awayTeamStats, injuries] = await Promise.all([
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [homeTeam.id], per_page: 100 }),
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [awayTeam.id], per_page: 100 }),
        ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: [homeTeam.id, awayTeam.id] })
      ]);

      const hasHome = Array.isArray(homeTeamStats) && homeTeamStats.length > 0;
      const hasAway = Array.isArray(awayTeamStats) && awayTeamStats.length > 0;
      if (!hasHome || !hasAway) {
        console.warn(`NCAAF: Missing required stats for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      // Aggregate simple season metrics from game-level team_stats
      const aggregateSeason = (rows) => {
        if (!Array.isArray(rows) || rows.length === 0) return {};
        let games = 0;
        let passY = 0, rushY = 0, totalY = 0, tovs = 0;
        let tdConv = 0, tdAtt = 0, fdConv = 0, fdAtt = 0;
        for (const r of rows) {
          games += 1;
          passY += Number(r?.passing_yards) || 0;
          rushY += Number(r?.rushing_yards) || 0;
          totalY += Number(r?.total_yards) || 0;
          tovs += Number(r?.turnovers) || 0;
          // third_down_efficiency like "6-15"
          const tde = typeof r?.third_down_efficiency === 'string' ? r.third_down_efficiency : '';
          const fde = typeof r?.fourth_down_efficiency === 'string' ? r.fourth_down_efficiency : '';
          const parsePair = (s) => {
            const parts = s.split('-').map(x => Number(String(x).trim()));
            return parts.length === 2 && parts.every(n => Number.isFinite(n)) ? { made: parts[0], att: parts[1] } : { made: 0, att: 0 };
          };
          const t = parsePair(tde);
          const f = parsePair(fde);
          tdConv += t.made; tdAtt += t.att;
          fdConv += f.made; fdAtt += f.att;
        }
        const safePct = (num, den) => den > 0 ? num / den : undefined;
        return {
          passYdsPerGame: games ? passY / games : undefined,
          rushYdsPerGame: games ? rushY / games : undefined,
          totalYdsPerGame: games ? totalY / games : undefined,
          turnoversPerGame: games ? tovs / games : undefined,
          thirdDownPct: safePct(tdConv, tdAtt),
          fourthDownPct: safePct(fdConv, fdAtt)
        };
      };
      const homeSeason = aggregateSeason(homeTeamStats);
      const awaySeason = aggregateSeason(awayTeamStats);

      // Identify QB, RB1, WR1 and get season per-game aggregates via player_stats
      const selectPlayers = async (teamId) => {
        const isPos = (abbr) => (p) => {
          const pos = (p?.position || '').toLowerCase();
          const pa = (p?.position_abbreviation || '').toLowerCase();
          return pa === abbr || pos.includes(abbr === 'qb' ? 'quarterback' : abbr === 'rb' ? 'running back' : 'wide receiver');
        };
        let qbs = await ballDontLieService.getPlayersGeneric(SPORT_KEY, { team_ids: [teamId], position: 'QB', per_page: 10 });
        let rbs = await ballDontLieService.getPlayersGeneric(SPORT_KEY, { team_ids: [teamId], position: 'RB', per_page: 10 });
        let wrs = await ballDontLieService.getPlayersGeneric(SPORT_KEY, { team_ids: [teamId], position: 'WR', per_page: 10 });
        qbs = Array.isArray(qbs) ? qbs.filter(isPos('qb')) : [];
        rbs = Array.isArray(rbs) ? rbs.filter(isPos('rb')) : [];
        wrs = Array.isArray(wrs) ? wrs.filter(isPos('wr')) : [];
        const qb = qbs[0] || null;
        const rb = rbs[0] || null;
        const wr = wrs[0] || null;

        const aggregatePlayer = async (player) => {
          if (!player?.id) return null;
          try {
            // Prefer season stats endpoint when available
            const seasonRows = await ballDontLieService.getNcaafPlayerSeasonStats({ playerId: player.id, season });
            if (Array.isArray(seasonRows) && seasonRows.length > 0) {
              const s = seasonRows[0];
              const name = player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim();
              const toFixed = (v, d = 1) => (typeof v === 'number' && isFinite(v)) ? +v.toFixed(d) : v;
              return {
                id: player.id,
                name,
                passYdsG: s?.passing_yards_per_game != null ? toFixed(s.passing_yards_per_game) : undefined,
                passTDG: undefined, // per-game TDs may not be provided; keep undefined if absent
                intsG: undefined,
                compRate: undefined, // season endpoint may not expose attempts/completions for rate; omit if missing
                rushYdsG: s?.rushing_yards_per_game != null ? toFixed(s.rushing_yards_per_game) : undefined,
                rushTDG: undefined,
                recYdsG: s?.receiving_yards_per_game != null ? toFixed(s.receiving_yards_per_game) : undefined,
                recTDG: undefined,
                recG: undefined
              };
            }
            // Fallback: aggregate from per-game player_stats
            const rows = await ballDontLieService.getPlayerStats(SPORT_KEY, { seasons: [season], player_ids: [player.id], per_page: 100 });
            let games = 0;
            let passY = 0, passTD = 0, ints = 0, rushY = 0, rushTD = 0, recY = 0, recTD = 0, rec = 0, att = 0, cmp = 0;
            for (const r of rows || []) {
              games += 1;
              passY += Number(r?.passing_yards) || 0;
              passTD += Number(r?.passing_touchdowns) || 0;
              ints += Number(r?.interceptions) || 0;
              cmp += Number(r?.completions) || 0;
              att += Number(r?.attempts) || 0;
              rushY += Number(r?.rushing_yards) || 0;
              rushTD += Number(r?.rushing_touchdowns) || 0;
              recY += Number(r?.receiving_yards) || 0;
              recTD += Number(r?.receiving_touchdowns) || 0;
              rec += Number(r?.receptions) || 0;
            }
            const name = player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim();
            const toFixed = (v, d = 1) => (typeof v === 'number' && isFinite(v)) ? +v.toFixed(d) : v;
            return {
              id: player.id,
              name,
              passYdsG: games ? toFixed(passY / games) : undefined,
              passTDG: games ? toFixed(passTD / games) : undefined,
              intsG: games ? toFixed(ints / games) : undefined,
              compRate: att > 0 ? toFixed(cmp / att, 3) : undefined,
              rushYdsG: games ? toFixed(rushY / games) : undefined,
              rushTDG: games ? toFixed(rushTD / games) : undefined,
              recYdsG: games ? toFixed(recY / games) : undefined,
              recTDG: games ? toFixed(recTD / games) : undefined,
              recG: games ? toFixed(rec / games) : undefined
            };
          } catch {
            return null;
          }
        };
        const [qbStats, rbStats, wrStats] = await Promise.all([aggregatePlayer(qb), aggregatePlayer(rb), aggregatePlayer(wr)]);
        return { qb: qbStats, rb1: rbStats, wr1: wrStats };
      };
      const [homeSkills, awaySkills] = await Promise.all([selectPlayers(homeTeam.id), selectPlayers(awayTeam.id)]);

      // Try to load standings for basics if available
      let homeStandings = [];
      let awayStandings = [];
      try {
        homeStandings = await ballDontLieService.getStandingsGeneric(SPORT_KEY, { season, team_ids: [homeTeam.id] });
        awayStandings = await ballDontLieService.getStandingsGeneric(SPORT_KEY, { season, team_ids: [awayTeam.id] });
      } catch {}
      const pickBasic = (row) => {
        if (!row) return {};
        const s = Array.isArray(row) ? row[0] : row;
        const record = (s?.overall_wins != null && s?.overall_losses != null) ? `${s.overall_wins}-${s.overall_losses}` : (s?.overall_record || undefined);
        const homeRec = (s?.home_wins != null && s?.home_losses != null) ? `${s.home_wins}-${s.home_losses}` : undefined;
        const awayRec = (s?.away_wins != null && s?.away_losses != null) ? `${s.away_wins}-${s.away_losses}` : undefined;
        const streak = s?.streak || s?.current_streak || undefined;
        const ppg = s?.points_per_game || s?.ppg || undefined;
        const oppg = s?.points_against_per_game || s?.opp_ppg || undefined;
        return { record, homeRec, awayRec, streak, ppg, oppg };
      };

      const statsReport = {
        season,
        home: { team: homeTeam, sample: homeTeamStats.slice(0, 3) },
        away: { team: awayTeam, sample: awayTeamStats.slice(0, 3) },
        injuriesSample: injuries?.slice?.(0, 6) || [],
        basics: {
          home: pickBasic(homeStandings?.[0] || homeStandings),
          away: pickBasic(awayStandings?.[0] || awayStandings)
        },
        seasonSummary: {
          home: homeSeason,
          away: awaySeason
        },
        skillPlayers: {
          home: homeSkills,
          away: awaySkills
        }
      };

      // Provide combined teamStats and minimal gameContext
      const teamStats = {
        home: Array.isArray(homeTeamStats) ? homeTeamStats : [],
        away: Array.isArray(awayTeamStats) ? awayTeamStats : []
      };
      let richKeyFindings = [];
      let realTimeNewsText = '';
      try {
        const dateStr = new Date(game.commence_time).toISOString().slice(0, 10);
        const rich = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'ncaaf', dateStr);
        if (Array.isArray(rich?.key_findings)) {
          richKeyFindings = rich.key_findings.slice(0, 4);
        }
        if (Array.isArray(rich?.key_findings) && rich.key_findings.length > 0) {
          const toLine = (k) => {
            const title = k?.title || 'Finding';
            const rationale = k?.rationale || k?.note || '';
            return rationale ? `${title}: ${rationale}` : String(title);
          };
          realTimeNewsText = rich.key_findings.slice(0, 3).map(toLine).join('\n');
        } else if (typeof rich?.summary === 'string' && rich.summary.trim().length > 0) {
          realTimeNewsText = rich.summary.trim();
        }
      } catch {}
      const gameContext = {
        injuries: Array.isArray(injuries) ? injuries : [],
        season,
        postseason: false,
        notes: 'Regular season context from BDL NCAAF',
        richKeyFindings
      };

      let oddsData = null;
      if (game.bookmakers?.length) {
        oddsData = { bookmaker: game.bookmakers[0]?.title, markets: game.bookmakers[0]?.markets || [] };
      }

      const gameObj = {
        id: gameId,
        sport: 'ncaaf',
        league: 'NCAAF',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        teamStats,
        gameContext,
        statsReport,
        realTimeNews: realTimeNewsText || undefined,
        odds: oddsData,
        gameTime: game.commence_time,
        time: game.commence_time
      };

      const pick = await makeGaryPick(gameObj);
      if (!pick?.success) return null;
      // Recommended sportsbook
      let recommendedSportsbook = null;
      try {
        const extract = pick.rawAnalysis?.rawOpenAIOutput || pick.pick || {};
        recommendedSportsbook = computeRecommendedSportsbook({
          pickType: (extract.type || '').toLowerCase(),
          pickStr: extract.pick || '',
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          bookmakers: Array.isArray(game.bookmakers) ? game.bookmakers : []
        });
      } catch (e) {
        console.warn('Failed to compute recommended sportsbook (NCAAF):', e?.message || e);
      }
      return {
        ...pick,
        recommendedSportsbook: recommendedSportsbook || undefined,
        game: `${game.away_team} @ ${game.home_team}`,
        sport: SPORT_KEY,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        gameTime: game.commence_time,
        pickType: 'normal',
        timestamp: new Date().toISOString()
      };
    });

    if (result && result.success) picks.push(result);
  }

  if (picks.length > 0) {
    console.log(`Total NCAAF picks generated: ${picks.length}`);
  }
  return picks;
}


