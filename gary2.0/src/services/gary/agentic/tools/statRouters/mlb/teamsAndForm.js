/** MLB stat tools: standings, records, recent results and form, injuries, odds, meetings and rest (split from mlbFetchers.js, Oct 13 2026). */
import { getMlbStandings as getMlbStandingsLegacy, getMlbRecentGames } from '../../../../../providers/mlbStatsApiService.js';
import { ballDontLieService } from '../../../../../providers/ballDontLieService.js';
import { fetchStandingsWithFallback, resolveBdlTeamId, findMlbTeamByName } from './shared.js';
import { mlbFetchers } from '../mlbFetchers.js';

export const teamsAndFormFetchers = {

  // ═══════════════════════════════════════════════════════════════════
  // STANDINGS & CONTEXT
  // ═══════════════════════════════════════════════════════════════════

  MLB_STANDINGS_STRUCTURED: async (sport, home, away, season, options) => {
    const currentYear = new Date().getFullYear();
    // Try BDL GOAT-tier standings first (with prior-season fallback)
    try {
      const result = await fetchStandingsWithFallback(currentYear);
      const standings = result.standings;
      const standingsSeasonLabel = result.isFallback ? ` (${result.season} season)` : '';
      const standingsFallbackNote = result.isFallback ? ' (prior season data — current season not yet started)' : '';
      if (Array.isArray(standings) && standings.length > 0) {
        // Group by division
        const divisions = {};
        for (const t of standings) {
          const div = t.division_name || 'Unknown Division';
          if (!divisions[div]) divisions[div] = [];
          const teamName = t.team?.full_name || t.team?.name || 'Unknown';
          divisions[div].push(
            `${teamName}: ${t.wins}-${t.losses} | Home: ${t.home || '—'} | Away: ${t.road || '—'} | L10: ${t.last_ten_games || '—'} | Streak: ${t.streak || '—'} | GB: ${t.division_games_behind ?? t.games_behind ?? '—'} | Win%: ${t.win_percent != null ? (t.win_percent * 100).toFixed(1) + '%' : '—'}`
          );
        }
        const lines = [];
        for (const [divName, teams] of Object.entries(divisions)) {
          lines.push(`\n--- ${divName} ---`);
          lines.push(...teams);
        }
        return {
          homeValue: lines.join('\n'),
          awayValue: '',
          comparison: `MLB Division Standings${standingsFallbackNote}`,
          source: `BDL API${standingsSeasonLabel}`,
        };
      }
    } catch (e) {
      console.warn('[MLB Fetchers] BDL standings failed, trying legacy:', e.message);
    }

    // Fallback: legacy MLB Stats API
    try {
      const standings = await getMlbStandingsLegacy();
      if (standings?.records) {
        const lines = [];
        for (const record of standings.records) {
          const divName = record.division?.name || 'Division';
          lines.push(`\n--- ${divName} ---`);
          for (const tr of (record.teamRecords || [])) {
            const gb = tr.gamesBack || '-';
            lines.push(`${tr.team?.name}: ${tr.wins}-${tr.losses} (GB: ${gb})`);
          }
        }
        return {
          homeValue: lines.join('\n'),
          awayValue: '',
          comparison: 'MLB Division Standings',
          source: 'MLB Stats API (fallback)',
        };
      }
    } catch (e2) {
      // Both failed
    }
    return { homeValue: 'N/A', awayValue: 'N/A', comparison: 'Standings unavailable', source: 'N/A' };
  },

  MLB_RECENT_RESULTS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const homeLines = [];
    const awayLines = [];

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const mlbTeam = await findMlbTeamByName(team.full_name || team.name);
      if (!mlbTeam) {
        lines.push(`${teamName}: Team not found`);
        continue;
      }
      const games = await getMlbRecentGames(mlbTeam.id, 10).catch(() => []);
      if (games.length === 0) {
        lines.push(`${teamName}: No recent games found`);
        continue;
      }
      for (const g of games) {
        const h = g.teams?.home;
        const a = g.teams?.away;
        const date = g.officialDate || (g.gameDate || '').split('T')[0]; // ET game date: the UTC start dated every 8 PM+ ET game a day late
        lines.push(`${date}: ${a?.team?.name} ${a?.score} @ ${h?.team?.name} ${h?.score}`);
      }
    }
    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Recent results for ${awayTeam} @ ${homeTeam}`,
      source: 'MLB Stats API',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // ODDS (Grounding-based)
  // ═══════════════════════════════════════════════════════════════════

  MLB_ODDS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    // This is a BDL endpoint, so it needs the BDL game id — NOT the MLB Stats
    // API gamePk. The previous precedence (bdlGameId || gamePk || id) meant that
    // once orchestratorMain set game.gamePk (the MLB Stats API id), this used it
    // for the BDL odds query, which returns 0 records. The fetcher then fell to a
    // date-based query that dumped ALL of the day's odds across every game,
    // unfiltered — feeding Gary a mix of multiple games' lines. Prefer the BDL
    // id (game.id / bdl_game_id); only fall to gamePk as a last resort.
    const gameId = options?.game?.bdl_game_id || options?.game?.bdlGameId || options?.game?.id || options?.game?.gamePk;

    // BDL MLB odds rows are FLAT:
    //   vendor, moneyline_home_odds, moneyline_away_odds,
    //   spread_home_value, spread_home_odds, spread_away_value, spread_away_odds,
    //   total_value, total_over_odds, total_under_odds
    // The prior implementation read bookOdds.moneyline.home etc. — those keys
    // don't exist on the BDL payload, so every value rendered as "—" even though
    // the data was right there. Matches the shape used in ballDontLieOddsService.js.
    const formatOddsRow = (row, includeRL = true) => {
      const book = row.vendor || row.sportsbook || row.book || 'Unknown';
      const homeML = row.moneyline_home_odds ?? '—';
      const awayML = row.moneyline_away_odds ?? '—';
      const total = row.total_value ?? '—';
      const overPrice = row.total_over_odds ?? '—';
      const underPrice = row.total_under_odds ?? '—';
      if (includeRL) {
        const homeRL = row.spread_home_value != null
          ? `${row.spread_home_value} (${row.spread_home_odds ?? '—'})`
          : '—';
        const awayRL = row.spread_away_value != null
          ? `${row.spread_away_value} (${row.spread_away_odds ?? '—'})`
          : '—';
        return `${book}: ML ${awayTeam} ${awayML} / ${homeTeam} ${homeML} | RL ${awayRL} / ${homeRL} | O/U ${total} (O ${overPrice} / U ${underPrice})`;
      }
      return `${book}: ML ${awayTeam} ${awayML} / ${homeTeam} ${homeML} | O/U ${total}`;
    };

    if (gameId) {
      try {
        const odds = await ballDontLieService.getMlbGameOdds({ gameIds: [gameId] });
        if (odds && odds.length > 0) {
          const lines = odds.map(row => formatOddsRow(row, true));
          return {
            homeValue: lines.join('\n'),
            awayValue: '',
            comparison: `Current MLB odds for ${awayTeam} @ ${homeTeam}`,
            source: 'BDL API (structured odds)',
          };
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL odds failed for game ${gameId}:`, e.message);
      }
    }

    // Try by today's date if no gameId. ET day + the next UTC day (Jul 30):
    // BDL keys late ET games under the NEXT UTC date, and the old UTC-now
    // derivation pointed at the wrong day entirely from 8 PM ET on.
    try {
      const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const nextUtc = (() => { const d = new Date(`${todayET}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
      const odds = await ballDontLieService.getMlbGameOdds({ dates: [todayET, nextUtc] });
      if (odds && odds.length > 0) {
        // Find odds matching this game
        const homeLower = homeTeam.toLowerCase();
        const awayLower = awayTeam.toLowerCase();
        const gameOdds = odds.filter(o => {
          const oHome = (o.game?.home_team?.full_name || o.game?.home_team || '').toString().toLowerCase();
          const oAway = (o.game?.away_team?.full_name || o.game?.away_team || '').toString().toLowerCase();
          return (oHome.includes(homeLower) || homeLower.includes(oHome)) &&
                 (oAway.includes(awayLower) || awayLower.includes(oAway));
        });

        if (gameOdds.length > 0) {
          const lines = gameOdds.map(row => formatOddsRow(row, false));

          return {
            homeValue: lines.join('\n'),
            awayValue: '',
            comparison: `Current MLB odds for ${awayTeam} @ ${homeTeam}`,
            source: 'BDL API (structured odds)',
          };
        }
      }
    } catch (e) {
      console.warn(`[MLB Fetchers] BDL odds by date failed:`, e.message);
    }

    return {
      homeValue: 'Odds not yet available (lines may not be posted yet)',
      awayValue: '',
      comparison: `Current MLB odds for ${awayTeam} @ ${homeTeam}`,
      source: 'BDL API (no data)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // GENERIC / SHARED TOKENS
  // ═══════════════════════════════════════════════════════════════════

  MLB_INJURIES: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    // BDL provides structured injuries in the scout report — no grounding fallback.
    // If BDL injuries are missing, surface the gap instead of masking with grounding.
    const hasBdlInjuries = options?.game?.injuries && options.game.injuries.length > 50;
    if (hasBdlInjuries) {
      return {
        homeValue: 'See scout report INJURIES section (BDL structured data with FRESH/ESTABLISHED routing labels)',
        awayValue: '',
        comparison: `Structured injury data already in scout report for ${awayTeam} @ ${homeTeam}`,
        source: 'BDL (via scout report)',
      };
    }
    // No grounding fallback — if BDL doesn't have injuries, report it clearly
    console.warn(`[MLB Fetchers] ⚠️ No BDL injury data for ${awayTeam} @ ${homeTeam} — check BDL injury API`);
    return {
      homeValue: 'No structured injury data available — BDL injury API returned empty',
      awayValue: '',
      comparison: `Injury data unavailable for ${awayTeam} @ ${homeTeam}`,
      source: 'BDL API (no data)',
    };
  },

  MLB_RECENT_FORM_STRUCTURED: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const homeLines = [];
    const awayLines = [];

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const mlbTeam = await findMlbTeamByName(team.full_name || team.name);
      if (!mlbTeam) {
        lines.push(`${teamName}: Team not found`);
        continue;
      }
      const games = await getMlbRecentGames(mlbTeam.id, 10).catch(() => []);
      if (games.length === 0) {
        lines.push(`${teamName}: No recent games found`);
        continue;
      }
      let wins = 0, losses = 0;
      for (const g of games) {
        const h = g.teams?.home;
        const a = g.teams?.away;
        const date = g.officialDate || (g.gameDate || '').split('T')[0]; // ET game date: the UTC start dated every 8 PM+ ET game a day late
        const isHome = (h?.team?.id === mlbTeam.id);
        const teamScore = isHome ? h?.score : a?.score;
        const oppScore = isHome ? a?.score : h?.score;
        const won = teamScore > oppScore;
        if (won) wins++; else losses++;
        const oppName = isHome ? a?.team?.name : h?.team?.name;
        lines.push(`${date}: ${won ? 'W' : 'L'} ${teamScore}-${oppScore} vs ${oppName}`);
      }
      lines.unshift(`${teamName}: ${wins}-${losses} last ${games.length} games`);
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Recent form (last 10 games) for ${awayTeam} @ ${homeTeam}`,
      source: 'MLB Stats API',
    };
  },

  MLB_H2H: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    // Use BDL game history to compute H2H — no grounding needed
    try {
      // ADAPTED (bug fix, Sep 11 2026): MLB rows reach this router name-only (the index skips the BDL team lookup for MLB), so these ids were never set and H2H read "unavailable" every night — resolve them the way every other MLB fetcher does.
      const homeId = home.id || home.teamId || await resolveBdlTeamId(home);
      const awayId = away.id || away.teamId || await resolveBdlTeamId(away);
      // No ids = no lookup happened. Say so — the no-meetings sentence below
      // is a finding, and an unresolved club is not a finding (Sep 9 2026:
      // the researcher read "no regular-season meetings" for Twins @ Tigers
      // the day after they played).
      if (!homeId || !awayId) {
        return {
          homeValue: 'H2H lookup unavailable this run (team ids unresolved) — treat season-series data as unavailable, NOT as "no meetings". Do not cite season-series records or run totals.',
          awayValue: '',
          comparison: `MLB H2H: ${awayTeam} vs ${homeTeam}`,
          source: 'BDL API (lookup not attempted)',
        };
      }
      if (homeId && awayId) {
        // paginateAll (Aug 27): one 100-row page of a full MLB season ended
        // in mid-June — H2H said "may not have played yet" about clubs that
        // met LAST NIGHT. Every page now, spring filtered below.
        const games = await ballDontLieService.getGames('baseball_mlb', { team_ids: [homeId], seasons: [season || new Date().getFullYear()], per_page: 100, paginateAll: true });
        const h2h = (games || []).filter(g => {
          const hId = g.home_team?.id || g.home_team_data?.id;
          const aId = g.visitor_team?.id || g.away_team?.id;
          // BDL MLB games report status 'STATUS_FINAL' (not 'Final' — the old
          // strict check matched ZERO games, so this tool returned "no H2H
          // data" for every MLB matchup since launch). Also restrict to
          // regular season: the 2026 season set includes spring_training
          // games that would contaminate the season-series numbers.
          const isFinal = /final/i.test(g.status || '');
          const isRegular = !g.season_type || g.season_type === 'regular';
          return (hId === awayId || aId === awayId) && isFinal && isRegular;
        });
        if (h2h.length > 0) {
          // Chronological order so the per-game readout reads naturally
          h2h.sort((a, b) => new Date(a.date || a.game_date || 0) - new Date(b.date || b.game_date || 0));
          let homeWins = 0, awayWins = 0, homeRuns = 0, awayRuns = 0;
          const results = [];
          for (const g of h2h) {
            // BDL MLB game objects carry runs in home/away_team_data.runs
            // (home_team_data is BOX data — hits/runs/errors — not a team
            // object, so it has no .id; the team id lives on home_team).
            const hScore = Number(g.home_team_data?.runs ?? g.home_team_score ?? g.home_score);
            const vScore = Number(g.away_team_data?.runs ?? g.visitor_team_score ?? g.away_score);
            // A final whose runs haven't landed yet must be SKIPPED — the old
            // `?? 0` fallbacks made it read 0-0, and the else-branch handed a
            // phantom win to the away side (Jul 30; the streak-splice class).
            if (!Number.isFinite(hScore) || !Number.isFinite(vScore) || hScore === vScore) continue;
            const isHomeTeamHome = g.home_team?.id === homeId;
            const ourRuns = isHomeTeamHome ? hScore : vScore;     // runs by tonight's home team
            const theirRuns = isHomeTeamHome ? vScore : hScore;   // runs by tonight's away team
            homeRuns += ourRuns;
            awayRuns += theirRuns;
            if (ourRuns > theirRuns) homeWins++;
            else awayWins++;
            const date = (g.date || g.game_date || '').split('T')[0];
            results.push(`${date}: ${homeTeam.split(' ').pop()} ${ourRuns}-${theirRuns}`);
          }
          // Count only the games actually tallied (skips above) — n drives
          // both the label and the runs/gm averages. Zero tallied falls
          // through to the honest no-data return below.
          const n = homeWins + awayWins;
          if (n > 0) {
            return {
              homeValue: `${homeTeam}: ${homeWins}W vs ${awayTeam} this season, ${homeRuns} runs scored (${(homeRuns / n).toFixed(1)}/gm)`,
              awayValue: `${awayTeam}: ${awayWins}W vs ${homeTeam} this season, ${awayRuns} runs scored (${(awayRuns / n).toFixed(1)}/gm)`,
              comparison: `Season series: ${n} games played — ${results.join(', ')}`,
              source: 'BDL API (game history)',
            };
          }
        }
      }
    } catch (e) {
      // A FAILED lookup is not an empty result (funnel law): say it failed,
      // never "they may not have played" — that read as series blindness on
      // a desk whose pen section narrated the same series (Aug 27 catch).
      console.warn(`[MLB Fetchers] BDL H2H failed: ${e.message}`);
      return {
        homeValue: 'H2H lookup FAILED this run — treat season-series data as unavailable, NOT as "no meetings". Do not cite season-series records or run totals.',
        awayValue: '',
        comparison: `MLB H2H: ${awayTeam} vs ${homeTeam}`,
        source: 'BDL API (lookup failed)',
      };
    }
    return {
      homeValue: 'No regular-season meetings between these clubs this season (full season paginated). Season-series run totals: NOT AVAILABLE — do not cite per-game series scoring averages.',
      awayValue: '',
      comparison: `MLB H2H: ${awayTeam} vs ${homeTeam}`,
      source: 'BDL API (no meetings)',
    };
  },

  MLB_REST_SITUATION: async (sport, home, away, season, options) => {
    // ET date, never UTC (Jul 30): toISOString() rolls to tomorrow at 8 PM ET,
    // which stamped every evening window's rest math one day high.
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;

    async function getLastGameDate(teamName) {
      const mlbTeam = await findMlbTeamByName(teamName);
      if (!mlbTeam) return null;
      const games = await getMlbRecentGames(mlbTeam.id, 3).catch(() => []);
      if (games.length === 0) return null;
      return games[games.length - 1].officialDate || games[games.length - 1].gameDate?.split('T')[0]; // ET game date, not the UTC start
    }

    const homeLast = await getLastGameDate(homeTeam);
    const awayLast = await getLastGameDate(awayTeam);

    function daysRest(lastDate) {
      if (!lastDate) return 'No recent games found';
      const diff = Math.floor((new Date(today) - new Date(lastDate)) / (1000 * 60 * 60 * 24));
      return `${diff} day(s) rest (last played ${lastDate})`;
    }

    return {
      homeValue: daysRest(homeLast),
      awayValue: daysRest(awayLast),
      comparison: `Days rest for ${awayTeam} @ ${homeTeam}`,
      source: 'MLB Stats API (schedule)',
    };
  },

  MLB_SEASON_FORM: async (sport, home, away, season, options) => {
    // Use BDL recent games — no grounding needed for L10 data
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const homeLines = [], awayLines = [];
    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      try {
        const mlbTeam = await findMlbTeamByName(team.full_name || team.name);
        if (!mlbTeam) { lines.push(`${teamName}: Team not found`); continue; }
        const games = await getMlbRecentGames(mlbTeam.id, 10).catch(() => []);
        if (games.length === 0) { lines.push(`${teamName}: No recent games`); continue; }
        let wins = 0, losses = 0, totalRuns = 0, totalAllowed = 0;
        for (const g of games) {
          const h = g.teams?.home, a = g.teams?.away;
          const isHome = h?.team?.id === mlbTeam.id;
          const ts = isHome ? h?.score : a?.score;
          const os = isHome ? a?.score : h?.score;
          if (ts > os) wins++; else losses++;
          totalRuns += (ts || 0); totalAllowed += (os || 0);
        }
        // Stamp the window so the number is auditable (which 10 games, exactly)
        const firstDate = games[0]?.officialDate || (games[0]?.gameDate || '').split('T')[0];
        const lastDate = games[games.length - 1]?.officialDate || (games[games.length - 1]?.gameDate || '').split('T')[0];
        const windowLabel = firstDate && lastDate ? ` (${firstDate} → ${lastDate})` : '';
        lines.push(`${teamName}: ${wins}-${losses} L${games.length}${windowLabel}, ${(totalRuns/games.length).toFixed(1)} RS/gm, ${(totalAllowed/games.length).toFixed(1)} RA/gm`);
      } catch (e) { lines.push(`${teamName}: Recent form unavailable`); }
    }
    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Recent form (L10) for ${awayTeam} @ ${homeTeam}`,
      source: 'BDL API (game history)',
    };
  },

  MLB_TEAM_RECORD: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();

    // Try BDL GOAT-tier standings first (with prior-season fallback)
    try {
      const result = await fetchStandingsWithFallback(currentYear);
      const standings = result.standings;
      const recordSeasonLabel = result.isFallback ? ` (${result.season} season)` : '';
      const recordFallbackNote = result.isFallback ? ' (prior season data — current season not yet started)' : '';
      if (Array.isArray(standings) && standings.length > 0) {
        const homeLower = (homeTeam || '').toLowerCase();
        const awayLower = (awayTeam || '').toLowerCase();

        function formatTeamRecord(t) {
          const name = t.team?.full_name || t.team?.name || '';
          return `${t.division_name || 'Division'}: ${name} ${t.wins}-${t.losses} | Home: ${t.home || '—'} | Away: ${t.road || '—'} | L10: ${t.last_ten_games || '—'} | Streak: ${t.streak || '—'} | GB: ${t.division_games_behind ?? t.games_behind ?? '—'} | Win%: ${t.win_percent != null ? (t.win_percent * 100).toFixed(1) + '%' : '—'}`;
        }

        const homeMatch = standings.find(t => {
          const n = (t.team?.full_name || t.team?.name || '').toLowerCase();
          return n.includes(homeLower) || homeLower.includes(n);
        });
        const awayMatch = standings.find(t => {
          const n = (t.team?.full_name || t.team?.name || '').toLowerCase();
          return n.includes(awayLower) || awayLower.includes(n);
        });

        if (homeMatch || awayMatch) {
          return {
            homeValue: homeMatch ? formatTeamRecord(homeMatch) : 'Not found in standings',
            awayValue: awayMatch ? formatTeamRecord(awayMatch) : 'Not found in standings',
            comparison: `MLB Team Records for ${awayTeam} @ ${homeTeam}${recordFallbackNote}`,
            source: `BDL API${recordSeasonLabel}`,
          };
        }
      }
    } catch (e) {
      console.warn('[MLB Fetchers] BDL standings for team record failed:', e.message);
    }

    // No grounding fallback — if BDL doesn't have standings, surface the gap
    console.warn(`[MLB Fetchers] ⚠️ BDL standings missing for ${awayTeam} @ ${homeTeam}`);
    return {
      homeValue: 'Team record unavailable — BDL standings returned empty',
      awayValue: '',
      comparison: `MLB records for ${awayTeam} @ ${homeTeam}`,
      source: 'BDL API (no data)',
    };
  },

  MLB_RECENT_FORM: async (sport, home, away, season, options) => {
    // Use BDL recent games — same as MLB_SEASON_FORM, no grounding needed
    return mlbFetchers.MLB_SEASON_FORM(sport, home, away, season, options);
  },

  // ═══════════════════════════════════════════════════════════════════
  // MLB STANDINGS (alias for STANDINGS token when sport is MLB)
  // ═══════════════════════════════════════════════════════════════════

  MLB_STANDINGS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();

    // Try BDL GOAT-tier standings first (with prior-season fallback)
    try {
      const result = await fetchStandingsWithFallback(currentYear);
      const standings = result.standings;
      const stSeasonLabel = result.isFallback ? ` (${result.season} season)` : '';
      const stFallbackNote = result.isFallback ? ' (prior season data — current season not yet started)' : '';
      if (Array.isArray(standings) && standings.length > 0) {
        const divisions = {};
        for (const t of standings) {
          const div = t.division_name || 'Unknown Division';
          if (!divisions[div]) divisions[div] = [];
          const teamName = t.team?.full_name || t.team?.name || 'Unknown';
          divisions[div].push(
            `${teamName}: ${t.wins}-${t.losses} | Home: ${t.home || '—'} | Away: ${t.road || '—'} | L10: ${t.last_ten_games || '—'} | Streak: ${t.streak || '—'} | GB: ${t.division_games_behind ?? t.games_behind ?? '—'}`
          );
        }
        const lines = [];
        for (const [divName, teams] of Object.entries(divisions)) {
          lines.push(`\n--- ${divName} ---`);
          lines.push(...teams);
        }
        if (lines.length > 0) {
          return {
            homeValue: lines.join('\n'),
            awayValue: '',
            comparison: `MLB Division Standings${stFallbackNote}`,
            source: `BDL API${stSeasonLabel}`,
          };
        }
      }
    } catch (e) {
      console.warn('[MLB Fetchers] BDL standings failed, trying fallback:', e.message);
    }

    // No grounding fallback — if BDL standings fail, surface the gap
    console.warn(`[MLB Fetchers] ⚠️ BDL standings unavailable for ${awayTeam} @ ${homeTeam}`);
    return {
      homeValue: 'Standings unavailable — BDL returned empty',
      awayValue: '',
      comparison: `MLB standings for ${awayTeam} @ ${homeTeam}`,
      source: 'BDL API (no data)',
    };
  },
};
