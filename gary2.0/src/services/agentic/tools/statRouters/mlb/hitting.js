/** MLB stat tools: lineups, key hitters, splits, batter vs pitcher, situational hitting and defense (split from mlbFetchers.js, Oct 13 2026). */
import { getMlbRecentGames, getProbablePitchers, getGameBoxScore } from '../../../../mlbStatsApiService.js';
import { ballDontLieService } from '../../../../ballDontLieService.js';
import { formatSampleSuffix } from '../statRouterCommon.js';
import { foldName } from '../../../../../utils/nameUtils.js';
import { fetchSeasonStatsWithFallback, fetchTeamStatsWithFallback, fetchSplitsWithFallback, resolveBdlTeamId, findMlbTeamByName } from './shared.js';

export const hittingFetchers = {

  // ═══════════════════════════════════════════════════════════════════
  // HITTING / LINEUP
  // ═══════════════════════════════════════════════════════════════════

  MLB_KEY_HITTERS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;

    let seasonLabel = '';
    let fallbackNote = '';
    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      // Try BDL season stats by team first (with prior-season fallback)
      const bdlTeamId = await resolveBdlTeamId(team);
      if (bdlTeamId) {
        try {
          const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
          seasonLabel = result.isFallback ? ` (${result.season} season)` : '';
          fallbackNote = result.isFallback ? ' (prior season data — current season not yet started)' : '';
          // Filter to hitters (batting_avg > 0 or batting_ops > 0) and sort by OPS descending
          const hitters = (result.stats || [])
            // Real batting sample, not "has never pitched" (Jul 30): the old
          // `!s.pitching_era` clause erased a two-way player's BAT entirely
          // (the Ohtani class), while a pitcher's fluke 1-for-2 could top an
          // OPS sort. >= 20 AB keeps April regulars and kills both.
          .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && (s.batting_ab || 0) >= 20)
            .sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0))
            .slice(0, 6);
          if (hitters.length > 0) {
            usedBdl = true;
            for (const h of hitters) {
              const name = h.player?.full_name || h.player?.last_name || 'Unknown';
              const avg = h.batting_avg != null ? h.batting_avg.toFixed(3) : '—';
              const hr = h.batting_hr ?? '—';
              const rbi = h.batting_rbi ?? '—';
              const ops = h.batting_ops != null ? h.batting_ops.toFixed(3) : '—';
              const war = h.batting_war != null ? h.batting_war.toFixed(1) : '—';
              const ab = h.batting_ab ?? '—';
              const hits = h.batting_h ?? '—';
              lines.push(`${name}: ${avg} AVG, ${hr} HR, ${rbi} RBI, ${ops} OPS, ${war} WAR (${ab} AB, ${hits} H)`);
            }
            continue;
          }
        } catch (e) {
          console.warn(`[MLB Fetchers] BDL key hitters failed for ${teamName}:`, e.message);
        }
      }

      // BDL had no key hitters for this team — report clearly. No career fallback:
      // a lifetime average is misleading vs. current-year context.
      lines.push(`${teamName}: No ${currentYear} hitting data yet`);
    }
    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Key hitters (season stats, sorted by OPS)${fallbackNote}`,
      source: usedBdl ? `BDL API${seasonLabel}` : 'BDL (no current-season hitting data)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // PITCH-TYPE BREAKDOWNS (BDL GOAT) — per-pitch stats for SPs and hitters
  // Replaces blind grounded search searches like "how does X hit sliders".
  // These are deterministic, current-season Statcast aggregates from BDL.
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Probable SPs' season pitch-type stats.
   * Per pitch type: usage%, whiff%, chase%, xwOBA, BA against.
   */
  MLB_PITCH_TYPES_HITTERS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();

    // Per side: resolve top hitters by OPS via BDL season stats.
    const collectTopHitters = async (team, teamName) => {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) return { teamName, hitters: [] };
      try {
        const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
        const hitters = (result.stats || [])
          // Real batting sample, not "has never pitched" (Jul 30): the old
          // `!s.pitching_era` clause erased a two-way player's BAT entirely
          // (the Ohtani class), while a pitcher's fluke 1-for-2 could top an
          // OPS sort. >= 20 AB keeps April regulars and kills both.
          .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && (s.batting_ab || 0) >= 20)
          .sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0))
          .slice(0, 5)
          .map(s => ({
            id: s.player?.id,
            name: s.player?.full_name || s.player?.last_name || 'Unknown',
          }))
          .filter(h => h.id != null);
        return { teamName, hitters };
      } catch (e) {
        console.warn(`[MLB Fetchers] PITCH_TYPES_HITTERS: season stats failed for ${teamName}: ${e.message}`);
        return { teamName, hitters: [] };
      }
    };

    const [homeSide, awaySide] = await Promise.all([
      collectTopHitters(home, homeTeam),
      collectTopHitters(away, awayTeam),
    ]);

    const playerIds = [...homeSide.hitters, ...awaySide.hitters].map(h => h.id);
    let records = [];
    if (playerIds.length > 0) {
      records = await ballDontLieService.getMlbHitterPitchTypeStats({
        playerIds, season: currentYear
      }).catch(() => []);
    }

    const byPlayer = new Map();
    for (const r of records) {
      const pid = r.player_id ?? r.player?.id;
      if (pid == null) continue;
      const list = byPlayer.get(pid) || [];
      list.push(r);
      byPlayer.set(pid, list);
    }
    const fmtAvg = (v) => (v != null && Number.isFinite(Number(v))) ? Number(v).toFixed(3) : '—';
    const formatHitter = (h) => {
      const list = (byPlayer.get(h.id) || []).slice();
      if (list.length === 0) return `${h.name}: no pitch-type data yet`;
      if (list.filter(r => (Number(r.pa_count) || 0) >= 10).length === 0) return `${h.name}: no pitch-type sample of 10+ PA yet`;
      // Sort by SAMPLE SIZE (PA against the pitch type) descending — NOT by
      // xwOBA. Sorting by xwOBA surfaced tiny-sample outliers first (e.g. a
      // 1.2 xwOBA on 6 PA against splitters), which reads as a fake "this guy
      // crushes splitters" edge. The pitches a hitter faces MOST are both the
      // most reliable signal and the most relevant (they're what the opposing
      // SP is likely to throw). Each line carries its PA count so the reader
      // can weight it; the Flash prompt instructs that splits under ~30 pitches
      // / ~10 PA are noise, not signal.
      list.sort((a, b) => (Number(b.pa_count) || 0) - (Number(a.pa_count) || 0));
      // LAB DIET (Aug 5): rows under 10 PA are noise dressed as signal — the
      // prompt used to caveat them; now they simply don't print. Top 3.
      const gated = list.filter(r => (Number(r.pa_count) || 0) >= 10);
      const top = gated.slice(0, 3).map(r => {
        const label = r.pitch_name || r.pitch_type || 'Unknown';
        const pa = r.pa_count != null ? `${r.pa_count} PA` : '? PA';
        return `${label} (${pa}): ${fmtAvg(r.ba)} BA, ${fmtAvg(r.xwoba)} xwOBA, ${fmtAvg(r.slg)} SLG`;
      });
      return `${h.name}: ${top.join(' | ')}`;
    };

    const formatSide = ({ teamName, hitters }) => {
      if (hitters.length === 0) return `${teamName}: No hitters found`;
      const lines = hitters.map(formatHitter);
      return `${teamName}:\n  ${lines.join('\n  ')}`;
    };

    return {
      homeValue: formatSide(homeSide),
      awayValue: formatSide(awaySide),
      // Label matches the code (Jul 30): rows sort by SAMPLE (PA faced), not
      // xwOBA — the old label told the reader the opposite of the truth.
      comparison: `Top hitters' pitch-type performance (${currentYear} season — most-faced pitch types first, PA counts shown)`,
      source: 'BDL API (pitch-type season stats)',
    };
  },

  MLB_LINEUP: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const gameId = options?.game?.id || options?.game?.gameId;
    const gamePk = options?.game?.gamePk;
    const homeAbbr = home.abbreviation || '';
    const awayAbbr = away.abbreviation || '';

    const formatBdlLineup = (teamData, teamName) => {
      if (!teamData || teamData.batters.length === 0) return `${teamName}: Lineup not yet posted`;
      let out = `${teamName}:\n`;
      out += teamData.batters.map(b =>
        `  ${b.battingOrder}. ${b.name} (${b.position}) [${b.batsThrows}]`
      ).join('\n');
      if (teamData.pitcher) {
        out += `\n  SP: ${teamData.pitcher.name} (${teamData.pitcher.batsThrows})`;
      }
      return out;
    };

    // PRIMARY: MLB Stats API boxscore (free, public, returns posted lineups + handedness)
    // The prior implementation called ballDontLieService.getMlbLineups, but that method
    // does not exist on the service — every call threw and silently fell through to the
    // "not available" branch, leaving Gary with zero lineup data for MLB games.
    if (gamePk) {
      try {
        const { getMlbGameLineups } = await import('../../../../mlbStatsApiService.js');
        const mlbLineups = await getMlbGameLineups(gamePk);
        if (mlbLineups) {
          const homeData = mlbLineups[homeAbbr] || Object.values(mlbLineups).find(t => t.teamName?.toLowerCase().includes((home.name || '').toLowerCase()));
          const awayData = mlbLineups[awayAbbr] || Object.values(mlbLineups).find(t => t.teamName?.toLowerCase().includes((away.name || '').toLowerCase()));
          if ((homeData?.batters?.length > 0) || (awayData?.batters?.length > 0)) {
            return {
              homeValue: formatBdlLineup(homeData, homeTeam),
              awayValue: formatBdlLineup(awayData, awayTeam),
              comparison: `Pre-game lineups with batting order + handedness for ${awayTeam} @ ${homeTeam}`,
              source: 'MLB Stats API (boxscore lineups)',
            };
          }
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] MLB Stats API lineup fetch failed for gamePk ${gamePk}: ${e.message}`);
      }
    }

    // Lineups not yet posted (game too far out, or boxscore not populated yet).
    console.warn(`[MLB Fetchers] ⚠️ No lineup data available for ${awayTeam} @ ${homeTeam} (gamePk: ${gamePk}, gameId: ${gameId})`);
    return {
      homeValue: `${homeTeam}: Lineup not yet available (check closer to game time)`,
      awayValue: `${awayTeam}: Lineup not yet available (check closer to game time)`,
      comparison: `Lineups not yet posted for ${awayTeam} @ ${homeTeam}`,
      source: 'MLB Stats API (no posted lineup)',
    };
  },

  MLB_TOP_PLAYERS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;
    let topSeasonLabel = '';
    let topFallbackNote = '';

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      // Try BDL season stats — get top hitters + top pitchers by WAR (with prior-season fallback)
      const bdlTeamId = await resolveBdlTeamId(team);
      if (bdlTeamId) {
        try {
          const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
          if (result.isFallback) {
            topSeasonLabel = ` (${result.season} season)`;
            topFallbackNote = ' (prior season data — current season not yet started)';
          }
          const stats = result.stats;
          if (stats && stats.length > 0) {
            // Top 3 hitters by OPS — real batting sample gate (Jul 30), not
            // "has never pitched": the old clause erased two-way bats and a
            // pitcher's fluke 1-for-2 could top an OPS sort.
            const hitters = stats
              .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && (s.batting_ab || 0) >= 20)
              .sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0))
              .slice(0, 3);
            // Top 2 pitchers by WAR (or ERA lowest)
            const pitchers = stats
              .filter(s => s.pitching_era != null && s.pitching_ip > 0)
              .sort((a, b) => (b.pitching_war || 0) - (a.pitching_war || 0))
              .slice(0, 2);

            if (hitters.length > 0 || pitchers.length > 0) {
              usedBdl = true;
              for (const h of hitters) {
                const name = h.player?.full_name || h.player?.last_name || 'Unknown';
                lines.push(`${name}: ${h.batting_avg?.toFixed(3) || '—'} AVG, ${h.batting_hr ?? '—'} HR, ${h.batting_rbi ?? '—'} RBI, ${h.batting_ops?.toFixed(3) || '—'} OPS, ${h.batting_war?.toFixed(1) || '—'} WAR`);
              }
              for (const p of pitchers) {
                const name = p.player?.full_name || p.player?.last_name || 'Unknown';
                lines.push(`${name}: ${p.pitching_era?.toFixed(2) || '—'} ERA, ${p.pitching_whip?.toFixed(2) || '—'} WHIP, ${p.pitching_k ?? '—'} K, ${p.pitching_ip?.toFixed(1) || '—'} IP, ${p.pitching_war?.toFixed(1) || '—'} WAR`);
              }
              continue;
            }
          }
        } catch (e) {
          console.warn(`[MLB Fetchers] BDL top players failed for ${teamName}:`, e.message);
        }
      }

      // No BDL data — return clean no-data instead of expensive Grounding
      lines.push(`${teamName}: No 2026 season data available yet (season may not have started)`);
    }
    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Top players (hitters by OPS + pitchers by WAR)${topFallbackNote}`,
      source: usedBdl ? `BDL API${topSeasonLabel}` : 'BDL (no data)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // MLB BDL GOAT-TIER — Player Splits & Matchups
  // ═══════════════════════════════════════════════════════════════════

  MLB_PLAYER_SPLITS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;
    let splitsSeasonLabel = '';
    let splitsFallbackNote = '';

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) {
        lines.push(`${teamName}: Unable to resolve BDL team ID for splits`);
        continue;
      }

      try {
        // Get top hitters for the team (with prior-season fallback), then fetch splits for each
        const seasonResult = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
        const effectiveSeason = seasonResult.season;
        if (seasonResult.isFallback) {
          splitsSeasonLabel = ` (${seasonResult.season} season)`;
          splitsFallbackNote = ' (prior season data — current season not yet started)';
        }
        const topHitters = (seasonResult.stats || [])
          // Real batting sample, not "has never pitched" (Jul 30): the old
          // `!s.pitching_era` clause erased a two-way player's BAT entirely
          // (the Ohtani class), while a pitcher's fluke 1-for-2 could top an
          // OPS sort. >= 20 AB keeps April regulars and kills both.
          .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && (s.batting_ab || 0) >= 20)
          .sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0))
          .slice(0, 4);

        if (topHitters.length === 0) {
          lines.push(`${teamName}: No hitter data available for splits`);
          continue;
        }

        for (const hitter of topHitters) {
          const playerId = hitter.player?.id;
          const name = hitter.player?.full_name || hitter.player?.last_name || 'Unknown';
          if (!playerId) {
            lines.push(`${name}: No player ID for splits lookup`);
            continue;
          }

          const splitsResult = await fetchSplitsWithFallback(playerId, effectiveSeason);
          const splits = splitsResult.splits;
          if (!splits || Object.keys(splits).length === 0) {
            lines.push(`${name}: Splits data unavailable`);
            continue;
          }

          usedBdl = true;
          lines.push(`--- ${name} ---`);

          // L/R breakdown — BDL splits use flat field names (avg, ops, home_runs, at_bats).
          // LAB DIET (founder GO, Aug 5 2026): platoon rows ONLY. The full
          // byBreakdown array carried Away/Day/Home/Night rows under an "L/R
          // SPLITS" header — tiny-sample venue/time trivia (the CES "Away:
          // 22 AB" class) that fed the bench's stat-tilt. vs-LHP/vs-RHP is
          // what the section's name promises; recent form stays below.
          if (splits.byBreakdown && Array.isArray(splits.byBreakdown)) {
            const platoon = splits.byBreakdown.filter((b) =>
              /\b(lhp|rhp|left|right)\b/i.test(String(b.split_name || b.split_abbreviation || '')));
            for (const b of platoon) {
              const label = b.split_name || b.split_abbreviation || 'Unknown';
              const avg = b.avg != null ? Number(b.avg).toFixed(3) : '—';
              const ops = b.ops != null ? Number(b.ops).toFixed(3) : '—';
              const hr = b.home_runs ?? '—';
              const ab = b.at_bats ?? '—';
              lines.push(`  ${label}: ${avg} AVG, ${ops} OPS, ${hr} HR (${ab} AB)`);
            }
          }

          // (Per-hitter venue rows REMOVED — LAB DIET Aug 5: three ballpark
          // lines per bat at 10-30 AB each was the exact noise class the
          // founder called out; the SP venue split elsewhere stays, IP-gated.)

          // Recent form (Jul 30, founder: no headline without its context —
          // Gary saw season + L/R while blind to the last two weeks, the
          // exact hot/cold context the Hub computes). Label comes from the
          // split actually used, so a 7- or 30-day fallback names itself.
          if (splits.byDayMonth && Array.isArray(splits.byDayMonth)) {
            const norm = (x) => String(x || '').toLowerCase();
            const recent = splits.byDayMonth.find((b) => norm(b.split_name).includes('last 15 days'))
              || splits.byDayMonth.find((b) => norm(b.split_name).includes('last 7 days'))
              || splits.byDayMonth.find((b) => norm(b.split_name).includes('last 30 days'));
            if (recent) {
              const avg = recent.avg != null ? Number(recent.avg).toFixed(3) : '—';
              const ops = recent.ops != null ? Number(recent.ops).toFixed(3) : '—';
              const sample = formatSampleSuffix(recent, [
                { field: 'at_bats', label: 'AB' },
                { field: 'plate_appearances', label: 'PA' },
              ]);
              lines.push(`  ${recent.split_name || 'Recent'}: ${avg} AVG, ${ops} OPS${sample}`);
            }
          }
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL splits failed for ${teamName}:`, e.message);
        lines.push(`${teamName}: Splits lookup failed`);
      }
    }

    return {
      homeValue: homeLines.join('\n') || 'No player splits data available yet (season may not have started)',
      awayValue: awayLines.join('\n') || 'No player splits data available yet',
      comparison: `Player splits (L/R, home/away) for ${awayTeam} @ ${homeTeam}${splitsFallbackNote} — HITTERS ONLY; pitcher platoon splits (vs LHB/RHB) come from MLB_PITCHER_SCOUTING`,
      source: usedBdl ? `BDL API${splitsSeasonLabel}` : 'BDL (no data)',
    };
  },

  // (MLB_LINEUP_VS_SP fetcher REMOVED — founder ruling, Aug 10 2026: the
  // section was career-grain by nature; no career numbers on the desk.)

  MLB_BATTER_VS_PITCHER: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const gamePk = options?.game?.gamePk || options?.game?.id;
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;

    // Identify today's probable starters so each hitter's line vs THE actual
    // opposing SP is surfaced explicitly (not buried among 12 career rows).
    let probable = {};
    if (gamePk) {
      try { probable = await getProbablePitchers(gamePk); } catch (_) { /* optional */ }
    }
    const spNameFor = (side) => {
      const p = probable?.[side];
      return p ? (p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim()) : null;
    };

    // For each team's hitters, look up their history vs the opposing team's pitchers
    for (const [battingTeam, battingName, opposingTeam, opposingName, opposingSpName, lines] of [
      [home, homeTeam, away, awayTeam, spNameFor('away'), homeLines],
      [away, awayTeam, home, homeTeam, spNameFor('home'), awayLines],
    ]) {
      const battingTeamId = await resolveBdlTeamId(battingTeam);
      const opposingTeamId = await resolveBdlTeamId(opposingTeam);

      if (!battingTeamId || !opposingTeamId) {
        lines.push(`${battingName}: Unable to resolve team IDs for BvP lookup`);
        continue;
      }

      try {
        // Get top hitters for the batting team (with prior-season fallback for
        // player identification). 8 covers the bulk of a lineup — a top-5 cap
        // previously dropped slumping stars whose BvP the rationale then invented.
        const seasonResult = await fetchSeasonStatsWithFallback({ teamId: battingTeamId, season: currentYear });
        const topHitters = (seasonResult.stats || [])
          // Real batting sample, not "has never pitched" (Jul 30): the old
          // `!s.pitching_era` clause erased a two-way player's BAT entirely
          // (the Ohtani class), while a pitcher's fluke 1-for-2 could top an
          // OPS sort. >= 20 AB keeps April regulars and kills both.
          .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && (s.batting_ab || 0) >= 20)
          .sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0))
          .slice(0, 8);

        if (topHitters.length === 0) {
          lines.push(`${battingName}: No hitter data available`);
          continue;
        }

        const fmtRow = (m) => {
          const ab = m.at_bats ?? '—';
          const hits = m.hits ?? '—';
          const hr = m.home_runs ?? '—';
          const avg = m.avg != null ? (typeof m.avg === 'number' ? m.avg.toFixed(3) : m.avg) : '—';
          const ops = m.ops != null ? (typeof m.ops === 'number' ? m.ops.toFixed(3) : m.ops) : '—';
          const k = m.strikeouts ?? m.k ?? '—';
          const bb = m.walks ?? m.bb ?? '—';
          return `${avg} AVG, ${ops} OPS, ${hr} HR, ${k} K, ${bb} BB (${ab} AB, ${hits} H)`;
        };
        const matchesSp = (m) => {
          if (!opposingSpName) return false;
          const p = foldName(m.opponent_player?.full_name);
          return p && p === foldName(opposingSpName);
        };

        for (const hitter of topHitters) {
          const playerId = hitter.player?.id;
          const name = hitter.player?.full_name || hitter.player?.last_name || 'Unknown';
          if (!playerId) continue;

          const matchups = await ballDontLieService.getMlbPlayerVsPlayer({ playerId, opponentTeamId: opposingTeamId }).catch(() => []);
          if (!matchups || matchups.length === 0) {
            const spNote = opposingSpName ? ` (incl. no history vs ${opposingSpName})` : '';
            lines.push(`${name} vs ${opposingName}: No matchup history${spNote}`);
            continue;
          }

          usedBdl = true;
          lines.push(`--- ${name} vs ${opposingName} pitchers ---`);
          // Today's opposing starter first — that's the matchup that matters tonight.
          if (opposingSpName) {
            const spRow = matchups.find(matchesSp);
            if (spRow && (spRow.at_bats || 0) >= 10) {
              lines.push(`  vs ${opposingSpName} (TODAY'S SP): ${fmtRow(spRow)}`);
            } else if (spRow) {
              // LAB DIET (Aug 5): under 10 AB the rate stats mislead (the
              // Nats-mash-Luzardo-in-6-AB class) — the counts are the fact.
              lines.push(`  vs ${opposingSpName} (TODAY'S SP): ${spRow.at_bats ?? 0} career AB, ${spRow.hits ?? 0} H`);
            } else {
              lines.push(`  vs ${opposingSpName} (TODAY'S SP): no career history in source`);
            }
          }
          const others = matchups
            .filter(m => !matchesSp(m) && (m.at_bats || 0) >= 10)
            .sort((a, b) => (b.at_bats || 0) - (a.at_bats || 0))
            .slice(0, 5);
          for (const m of others) {
            const pitcher = m.opponent_player?.full_name || m.opponent_player?.last_name || 'Unknown P';
            lines.push(`  vs ${pitcher}: ${fmtRow(m)}`);
          }
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL BvP failed for ${battingName} vs ${opposingName}:`, e.message);
        lines.push(`${battingName} vs ${opposingName}: BvP lookup failed`);
      }
    }

    return {
      homeValue: homeLines.join('\n') || 'No 2026 batter vs pitcher data available yet (season may not have started)',
      awayValue: awayLines.join('\n') || 'No 2026 batter vs pitcher data available yet',
      comparison: `Batter vs pitcher matchup history for ${awayTeam} @ ${homeTeam} (career totals; source may lag the most recent meetings — do not cite BvP lines not shown here)`,
      source: usedBdl ? 'BDL API' : 'BDL (no data)',
    };
  },

  MLB_RISP_SITUATIONAL: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;
    let rispSeasonLabel = '';
    let rispFallbackNote = '';

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) {
        lines.push(`${teamName}: Unable to resolve team ID`);
        continue;
      }

      try {
        // Get top hitters (with prior-season fallback), then fetch splits for situational data
        const seasonResult = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
        const effectiveSeason = seasonResult.season;
        if (seasonResult.isFallback) {
          rispSeasonLabel = ` (${seasonResult.season} season)`;
          rispFallbackNote = ' (prior season data — current season not yet started)';
        }
        const topHitters = (seasonResult.stats || [])
          // Real batting sample, not "has never pitched" (Jul 30): the old
          // `!s.pitching_era` clause erased a two-way player's BAT entirely
          // (the Ohtani class), while a pitcher's fluke 1-for-2 could top an
          // OPS sort. >= 20 AB keeps April regulars and kills both.
          .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && (s.batting_ab || 0) >= 20)
          .sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0))
          .slice(0, 4);

        if (topHitters.length === 0) {
          lines.push(`${teamName}: No hitter data available for RISP`);
          continue;
        }

        let hasAnyRispData = false;
        for (const hitter of topHitters) {
          const playerId = hitter.player?.id;
          const name = hitter.player?.full_name || hitter.player?.last_name || 'Unknown';
          if (!playerId) continue;

          const splitsResult = await fetchSplitsWithFallback(playerId, effectiveSeason);
          const splits = splitsResult.splits;
          if (!splits?.bySituation || !Array.isArray(splits.bySituation)) continue;

          // Extract situational splits: RISP, Runners On, None On, Bases Loaded
          // BDL splits use flat field names (avg, ops, home_runs, rbis, at_bats, split_name)
          const situational = splits.bySituation.filter(s => {
            const label = (s.split_name || s.split_abbreviation || '').toLowerCase();
            return label.includes('scoring position') || label.includes('runners on') ||
                   label.includes('none on') || label.includes('bases loaded') ||
                   label.includes('risp');
          });

          if (situational.length > 0) {
            hasAnyRispData = true;
            usedBdl = true;
            lines.push(`--- ${name} ---`);
            for (const s of situational) {
              const label = s.split_name || s.split_abbreviation || 'Unknown';
              const avg = s.avg != null ? Number(s.avg).toFixed(3) : '—';
              const ops = s.ops != null ? Number(s.ops).toFixed(3) : '—';
              const hr = s.home_runs ?? '—';
              const rbi = s.rbis ?? '—';
              const ab = s.at_bats ?? '—';
              lines.push(`  ${label}: ${avg} AVG, ${ops} OPS, ${hr} HR, ${rbi} RBI (${ab} AB)`);
            }
          }
        }

        if (hasAnyRispData) continue;
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL RISP/situational failed for ${teamName}:`, e.message);
      }

      // No BDL data — return clean no-data instead of expensive Grounding
      lines.push(`${teamName}: No 2026 RISP/situational data available yet (season may not have started)`);
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `RISP & situational hitting for ${awayTeam} @ ${homeTeam}${rispFallbackNote}`,
      source: usedBdl ? `BDL API (splits)${rispSeasonLabel}` : 'BDL (no data)',
    };
  },

  MLB_CATCHER_DEFENSE: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;
    let catcherSeasonLabel = '';
    let catcherFallbackNote = '';

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) {
        lines.push(`${teamName}: Unable to resolve team ID`);
        continue;
      }

      try {
        const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
        if (result.isFallback) {
          catcherSeasonLabel = ` (${result.season} season)`;
          catcherFallbackNote = ' (prior season data — current season not yet started)';
        }
        // Filter to catchers by position
        const catchers = (result.stats || []).filter(s => {
          const pos = (s.player?.position || '').toLowerCase();
          return pos.includes('catcher') || pos === 'c';
        });

        if (catchers.length > 0) {
          usedBdl = true;
          // RUNNING GAME ONLY (founder, Aug 5 PM: "we definitely do not need
          // catcher framing and all that. Stolen base is fine"). Batting lines
          // duplicated the lineup surfaces; framing/PB/WAR were micro. What
          // survives is the fact a fan holds: can you run on this catcher.
          for (const c of catchers) {
            const name = c.player?.full_name || c.player?.last_name || 'Unknown';
            const cs = c.fielding_cs ?? c.catching_cs ?? '—';
            const sba = c.fielding_sba ?? c.catching_sba ?? '—';
            lines.push(`${name}: ${cs} caught of ${sba} steal attempts`);
          }
          continue;
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL catcher defense failed for ${teamName}:`, e.message);
      }

      // No BDL data — return clean no-data instead of expensive Grounding
      lines.push(`${teamName}: No 2026 catcher defense data available yet (season may not have started)`);
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Catcher defense & batting for ${awayTeam} @ ${homeTeam}${catcherFallbackNote}`,
      source: usedBdl ? `BDL API${catcherSeasonLabel}` : 'BDL (no data)',
    };
  },

  MLB_TEAM_DEFENSE: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;
    let defenseSeasonLabel = '';
    let defenseFallbackNote = '';

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) {
        lines.push(`${teamName}: Unable to resolve team ID`);
        continue;
      }

      try {
        const result = await fetchTeamStatsWithFallback(bdlTeamId, currentYear);
        if (result.isFallback) {
          defenseSeasonLabel = ` (${result.season} season)`;
          defenseFallbackNote = ' (prior season data — current season not yet started)';
        }
        const teamStats = result.stats;
        if (teamStats && typeof teamStats === 'object' && Object.keys(teamStats).length > 0) {
          usedBdl = true;
          // Fielding stats
          const errors = teamStats.fielding_e ?? teamStats.errors ?? '—';
          const fp = teamStats.fielding_fp != null ? teamStats.fielding_fp.toFixed(3) : (teamStats.fielding_pct != null ? teamStats.fielding_pct.toFixed(3) : '—');
          const tc = teamStats.fielding_tc ?? '—';
          // Pitching stats that reflect defense
          const era = teamStats.pitching_era != null ? teamStats.pitching_era.toFixed(2) : '—';
          const whip = teamStats.pitching_whip != null ? teamStats.pitching_whip.toFixed(2) : '—';
          // Additional defense indicators
          const dp = teamStats.fielding_dp ?? teamStats.double_plays ?? '—';
          const gp = teamStats.gp ?? teamStats.games_played ?? '—';

          lines.push(`${teamName} (${gp} GP):`);
          lines.push(`  Fielding: ${errors} E, ${fp} FPCT, ${tc} TC, ${dp} DP`);
          lines.push(`  Team Pitching: ${era} ERA, ${whip} WHIP`);
          // DEFENSE RIGHT NOW (founder GO, Aug 12 — defense was the desk's
          // thinnest area: a season fielding percentage is the one number
          // that never moves). The last 7 games from official boxscores:
          // errors, and the runs the glove actually cost (runs minus earned
          // runs) — a team kicking it around this week is a fact a fan holds
          // and the season rate hides. Fail-open per game.
          try {
            const mlbTeam = await findMlbTeamByName(teamName);
            if (mlbTeam?.id) {
              const recent = await getMlbRecentGames(mlbTeam.id, 7);
              let e = 0, unearned = 0, counted = 0;
              for (const g of (recent || [])) {
                const box = await getGameBoxScore(g.gamePk).catch(() => null);
                if (!box?.teams) continue;
                const sideKey = box.teams.home?.team?.id === mlbTeam.id ? 'home' : 'away';
                const st = box.teams[sideKey]?.teamStats;
                if (!st) continue;
                e += Number(st.fielding?.errors) || 0;
                const r = Number(st.pitching?.runs);
                const er2 = Number(st.pitching?.earnedRuns);
                if (Number.isFinite(r) && Number.isFinite(er2)) unearned += Math.max(0, r - er2);
                counted += 1;
              }
              if (counted >= 3) {
                lines.push(`  Last ${counted} games: ${e} error${e === 1 ? '' : 's'}, ${unearned} unearned run${unearned === 1 ? '' : 's'} allowed`);
              }
            }
          } catch { /* recent-defense is additive — never sink the section */ }
          continue;
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL team defense failed for ${teamName}:`, e.message);
      }

      // No BDL data — return clean no-data instead of expensive Grounding
      lines.push(`${teamName}: No 2026 team defense data available yet (season may not have started)`);
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Team defense & fielding for ${awayTeam} @ ${homeTeam}${defenseFallbackNote}`,
      source: usedBdl ? `BDL API${defenseSeasonLabel}` : 'BDL (no data)',
    };
  },
};
