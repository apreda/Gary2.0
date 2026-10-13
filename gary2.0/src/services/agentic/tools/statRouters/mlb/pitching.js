/** MLB stat tools: starters, bullpens, pitch types, pitcher form and Statcast (split from mlbFetchers.js, Oct 13 2026). */
import { findMlbNamedPlayerStats } from '../../../../mlbIdentity.js';
import { getMlbRecentGames, getPlayerSeasonStats, searchPlayer, getProbablePitchers, getGameBoxScore, getPitcherPlatoonSplits, getPitcherEntryContext } from '../../../../mlbStatsApiService.js';
import { getPitcherArsenal, getPitcherStatcastProfile } from '../../../../baseballSavantService.js';
import { ballDontLieService } from '../../../../ballDontLieService.js';
import { formatSampleSuffix } from '../statRouterCommon.js';
import { bullpenLedgerDate, outsToIp, relieverBoxEntries } from '../bullpenLedger.js';
import { fetchPenArms } from '../penArms.js';
import { openaiWebSearch } from '../../../../pickdesk/webSearch.js';
import { foldName } from '../../../../../utils/nameUtils.js';
import { currentRosterFolds, goneTag, fetchSeasonStatsWithFallback, fetchSplitsWithFallback, resolveBdlTeamId, findMlbTeamByName } from './shared.js';

export const pitchingFetchers = {

  // ═══════════════════════════════════════════════════════════════════
  // PITCHING
  // ═══════════════════════════════════════════════════════════════════

  MLB_STARTING_PITCHERS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const gamePk = options?.game?.gamePk || options?.game?.id;
    const currentYear = new Date().getFullYear();

    if (gamePk) {
      try {
        const pitcherData = await getProbablePitchers(gamePk);
        const homePitcher = pitcherData.home;
        const awayPitcher = pitcherData.away;

        if (homePitcher || awayPitcher) {
          const homeLines = [];
          const awayLines = [];

          // Format pitcher info and try to get BDL season stats
          for (const [pitcher, teamName, lines, team] of [
            [homePitcher, homeTeam, homeLines, home],
            [awayPitcher, awayTeam, awayLines, away],
          ]) {
            if (!pitcher) {
              lines.push(`${teamName}: Probable pitcher not yet announced`);
              continue;
            }
            const name = pitcher.fullName || `${pitcher.firstName || ''} ${pitcher.lastName || ''}`.trim() || 'TBD';
            let statsLine = '';

            // Try BDL season stats for the pitcher
            const bdlTeamId = await resolveBdlTeamId(team);
            if (bdlTeamId) {
              try {
                const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
                const pitcherLower = foldName(name);
                const match = findMlbNamedPlayerStats((result.stats || []).filter(s => s.pitching_ip > 0), pitcherLower);
                if (match) {
                  const seasonLabel = result.isFallback ? ` (${result.season})` : '';
                  statsLine = ` | ${match.pitching_w ?? 0}-${match.pitching_l ?? 0}, ${match.pitching_era?.toFixed(2) ?? '—'} ERA, ${match.pitching_whip?.toFixed(2) ?? '—'} WHIP, ${match.pitching_k ?? '—'} K in ${match.pitching_ip?.toFixed(1) ?? '—'} IP${seasonLabel}`;
                }
              } catch (_) { /* BDL stats optional */ }
            }

            lines.push(`${teamName}: ${name} (ID: ${pitcher.id || 'N/A'})${statsLine}`);
          }

          return {
            homeValue: homeLines.join('\n'),
            awayValue: awayLines.join('\n'),
            comparison: `Probable starting pitchers for ${awayTeam} @ ${homeTeam}`,
            source: 'MLB Stats API + BDL',
          };
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] getProbablePitchers failed for gamePk ${gamePk}:`, e.message);
      }
    }

    // No gamePk or API returned no pitchers
    return {
      homeValue: `${homeTeam}: Probable pitchers not yet announced`,
      awayValue: `${awayTeam}: Probable pitchers not yet announced`,
      comparison: `Probable starting pitchers for ${awayTeam} @ ${homeTeam}`,
      source: 'MLB Stats API (no data yet)',
    };
  },

  MLB_BULLPEN: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    // This fetcher combines closer/reliever stats + recent workload for a full bullpen picture.
    // MLB_CLOSER_RELIEVER_STATS and MLB_BULLPEN_WORKLOAD provide the detailed data;
    // this fetcher adds a minimal Grounding call only for day-of bullpen news that APIs can't capture.
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedApi = false;

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) {
        lines.push(`${teamName}: Unable to resolve team ID`);
        continue;
      }

      try {
        // Get closer/reliever season stats
        const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
        // A reliever is someone who RELIEVES (Jul 30): zero starts. The old
        // `ip < 50` heuristic misfiled low-IP starters as relief arms and
        // dropped 50+ IP setup workhorses by late season. Rank saves, then
        // holds, then innings so the real high-leverage arms surface, not
        // just save-getters.
        const relievers = (result.stats || [])
          .filter(s => s.pitching_ip > 0 && (s.pitching_gs || 0) === 0 && s.pitching_era != null)
          .sort((a, b) =>
            (b.pitching_sv || 0) - (a.pitching_sv || 0) ||
            (b.pitching_hld || 0) - (a.pitching_hld || 0) ||
            (b.pitching_ip || 0) - (a.pitching_ip || 0))
          .slice(0, 5);

        if (relievers.length > 0) {
          usedApi = true;
          const rosterFolds = await currentRosterFolds(teamName);
          lines.push(`${teamName} Key Relievers:`);
          for (const r of relievers) {
            const name = r.player?.full_name || r.player?.last_name || 'Unknown';
            lines.push(`  ${name}: ${r.pitching_sv ?? 0} SV, ${r.pitching_hld ?? 0} HLD, ${r.pitching_era?.toFixed(2) ?? '—'} ERA, ${r.pitching_ip?.toFixed(1) ?? '—'} IP${goneTag(rosterFolds, name)}`);
          }
        }

        // Recent workload (with pitch counts) lives in MLB_BULLPEN_WORKLOAD,
        // which reads MLB Stats API boxscores directly. A previous version
        // here passed MLB gamePks to BDL's getMlbGameStats — different ID
        // namespaces, so it always returned 0 records. Removed rather than
        // duplicated; the workload token is wired into the same factor.
        if (relievers.length > 0) {
          lines.push(`  Recent per-game workload: see MLB_BULLPEN_WORKLOAD (appearance detail + day/series rollups)`);
        }

        if (usedApi) continue;
      } catch (e) {
        console.warn(`[MLB Fetchers] Bullpen API data failed for ${teamName}:`, e.message);
      }

      lines.push(`${teamName}: See MLB_CLOSER_RELIEVER_STATS and MLB_BULLPEN_WORKLOAD for detailed bullpen data`);
    }

    // Minimal grounding call for day-of bullpen news only — via the seam so
    // the bridge makes it $0 (was a hardwired PAID Gemini call per desk
    // build, found Jul 30). Jul 8 2026 fix preserved: the result is
    // {success, data, raw} — read .data, not .length on the object.
    let newsNote = '';
    try {
      const news = await openaiWebSearch(
        `${awayTeam} vs ${homeTeam} MLB bullpen news closer availability update today`
      );
      const newsText = news?.data || '';
      if (newsText.length > 20) newsNote = `\n\nDay-of Bullpen News: ${newsText}`;
    } catch (_) { /* Grounding is optional */ }

    return {
      homeValue: homeLines.join('\n') + (newsNote ? newsNote : ''),
      awayValue: awayLines.join('\n'),
      comparison: `Bullpen status for ${awayTeam} @ ${homeTeam}`,
      source: usedApi ? 'BDL API + MLB Stats API' : 'grounded search (fallback)',
    };
  },
  MLB_PITCH_TYPES_SP: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const gamePk = options?.game?.gamePk || options?.game?.id;
    const currentYear = new Date().getFullYear();

    if (!gamePk) {
      return {
        homeValue: `${homeTeam}: No gamePk — can't identify SP`,
        awayValue: `${awayTeam}: No gamePk — can't identify SP`,
        comparison: 'Probable SP pitch-type breakdown',
        source: 'No data',
      };
    }

    let probable;
    try {
      probable = await getProbablePitchers(gamePk);
    } catch (e) {
      console.warn(`[MLB Fetchers] PITCH_TYPES_SP: getProbablePitchers failed for ${gamePk}: ${e.message}`);
      probable = {};
    }

    // For each side: resolve probable pitcher's BDL player id via team season stats name match.
    const sides = [
      { team: home, teamName: homeTeam, pitcher: probable?.home },
      { team: away, teamName: awayTeam, pitcher: probable?.away },
    ];

    const resolved = []; // { teamName, name, bdlId, mlbamId }
    for (const side of sides) {
      if (!side.pitcher) {
        resolved.push({ teamName: side.teamName, name: null, bdlId: null, mlbamId: null });
        continue;
      }
      const name = side.pitcher.fullName || `${side.pitcher.firstName || ''} ${side.pitcher.lastName || ''}`.trim();
      const bdlTeamId = await resolveBdlTeamId(side.team);
      let bdlId = null;
      if (bdlTeamId && name) {
        try {
          const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
          const target = foldName(name);
          const match = findMlbNamedPlayerStats((result.stats || []).filter(s => s.pitching_ip > 0), target);
          bdlId = match?.player?.id || null;
        } catch { /* fall through with bdlId=null */ }
      }
      resolved.push({ teamName: side.teamName, name, bdlId, mlbamId: side.pitcher.id || null });
    }

    // Per-pitch velocity from Baseball Savant arsenal CSV (BDL carries no pitch speed).
    // Keyed by MLBAM id with name fallback; null when Savant has no row.
    const arsenals = new Map(); // resolved index -> arsenal | null
    // (Prior-season velocity baseline REMOVED — founder ruling, Aug 10: no
    // prior-season numbers on the desk. Velocity prints current-season only;
    // a velo story, if there is one, arrives as written via the press layer.)
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i];
      if (!r.name) { arsenals.set(i, null); continue; }
      const arsenal = await getPitcherArsenal(r.mlbamId ?? r.name, currentYear).catch(() => null)
        || await getPitcherArsenal(r.name, currentYear).catch(() => null);
      arsenals.set(i, arsenal);
    }

    const playerIds = resolved.map(r => r.bdlId).filter(id => id != null);
    let records = [];
    if (playerIds.length > 0) {
      records = await ballDontLieService.getMlbPitcherPitchTypeStats({
        playerIds, season: currentYear
      }).catch(() => []);
    }

    // Group records by player_id, format per-pitch lines (top 5 pitches by usage).
    const byPlayer = new Map();
    for (const r of records) {
      const pid = r.player_id ?? r.player?.id;
      if (pid == null) continue;
      const list = byPlayer.get(pid) || [];
      list.push(r);
      byPlayer.set(pid, list);
    }
    const fmtPct = (v) => (v != null && Number.isFinite(Number(v))) ? `${Number(v).toFixed(1)}%` : '—';
    const fmtAvg = (v) => (v != null && Number.isFinite(Number(v))) ? Number(v).toFixed(3) : '—';
    const formatPitcher = ({ teamName, name, bdlId }, arsenal) => {
      if (!name) return `${teamName}: SP not announced`;
      // mph lookup keyed by pitch CODE (FF/SI/FS...) — both sources carry codes
      // and codes are stable; display-name strings can drift ("4-Seam" vs
      // "Four-Seam"). Name map kept as fallback for codeless BDL rows.
      const mphByCode = new Map((arsenal?.pitches || []).map(p => [p.code, p.mph]));
      const mphByName = new Map((arsenal?.pitches || []).map(p => [p.name.toLowerCase(), p.mph]));
      const velocityLine = arsenal
        ? `  Velocity (Savant ${currentYear}): ${arsenal.pitches.map(p => `${p.name} ${p.mph} mph`).join(' | ')}`
        : `  Velocity: NOT AVAILABLE — do not cite pitch speeds for ${name}`;
      if (bdlId == null) return `${teamName}: ${name} — not found in BDL season stats\n${velocityLine}`;
      const list = (byPlayer.get(bdlId) || []).slice();
      if (list.length === 0) return `${teamName}: ${name} — no pitch-type data yet\n${velocityLine}`;
      list.sort((a, b) => (Number(b.pitch_usage_percent) || 0) - (Number(a.pitch_usage_percent) || 0));
      // FULL ARSENAL (founder, Aug 5 2026 PM — reversing the same-day top-3
      // cut): "we don't want to select his top three and leave off the other
      // pitches." Complete data is naked data; the ESPN page shows all five.
      // The volume problem was framing and grain, not the arsenal.
      const top = list.slice(0, 5).map(r => {
        const label = r.pitch_name || r.pitch_type || 'Unknown';
        // Show pitch_count so the reader can weight whiff%/xwOBA by sample.
        const n = r.pitch_count != null ? `${r.pitch_count} pitches` : '? pitches';
        const mph = mphByCode.get(String(r.pitch_type || '').toUpperCase()) ?? mphByName.get(String(label).toLowerCase());
        const mphStr = mph != null ? `, avg ${mph} mph` : '';
        return `  ${label} (${fmtPct(r.pitch_usage_percent)}, ${n}${mphStr}): xwOBA ${fmtAvg(r.xwoba)}, whiff ${fmtPct(r.whiff_percent)}, chase ${fmtPct(r.chase_percent)}, BA ${fmtAvg(r.ba)}`;
      });
      return `${teamName}: ${name}\n${top.join('\n')}\n${velocityLine}`;
    };

    return {
      homeValue: formatPitcher(resolved[0], arsenals.get(0)),
      awayValue: formatPitcher(resolved[1], arsenals.get(1)),
      comparison: `Probable SP pitch-type breakdown (${currentYear} season)`,
      source: 'BDL API (pitch-type season stats) + Baseball Savant (velocity)',
    };
  },

  /**
   * Top hitters' performance against each pitch type.
   * Per hitter per pitch type: BA, xwOBA, SLG.
   * Picks top 5 hitters per team by OPS, then fetches pitch-type splits.
   */

  MLB_PITCHER_SCOUTING: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const gamePk = options?.game?.gamePk || options?.game?.id;
    const homeLines = [];
    const awayLines = [];
    let usedApi = false;

    // Try to identify probable pitchers
    let probablePitchers = null;
    if (gamePk) {
      try {
        probablePitchers = await getProbablePitchers(gamePk);
      } catch (_) { /* Will fall back */ }
    }

    for (const [team, teamName, lines, side] of [
      [home, homeTeam, homeLines, 'home'],
      [away, awayTeam, awayLines, 'away'],
    ]) {
      const pitcher = probablePitchers?.[side];
      const pitcherName = pitcher?.fullName || `${pitcher?.firstName || ''} ${pitcher?.lastName || ''}`.trim();

      if (!pitcherName) {
        lines.push(`${teamName}: Probable pitcher not identified — scouting report unavailable`);
        continue;
      }

      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) {
        lines.push(`${pitcherName}: Unable to resolve team for stats lookup`);
        continue;
      }

      try {
        // Get season stats
        const seasonResult = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
        const pitcherLower = foldName(pitcherName);
        const match = findMlbNamedPlayerStats((seasonResult.stats || []).filter(s => s.pitching_ip > 0), pitcherLower);

        if (match) {
          usedApi = true;
          const label = seasonResult.isFallback ? ` (${seasonResult.season})` : '';
          const name = match.player?.full_name || pitcherName;

          // Season line
          lines.push(`--- ${name} Scouting Profile${label} ---`);
          lines.push(`Record: ${match.pitching_w ?? 0}-${match.pitching_l ?? 0} | ERA: ${match.pitching_era?.toFixed(2) ?? '—'} | WHIP: ${match.pitching_whip?.toFixed(2) ?? '—'}`);
          lines.push(`K: ${match.pitching_k ?? '—'} (${match.pitching_k_per_9?.toFixed(1) ?? '—'} K/9) | BB: ${match.pitching_bb ?? '—'} | HR: ${match.pitching_hr ?? '—'} | IP: ${match.pitching_ip?.toFixed(1) ?? '—'}`);
          if (match.pitching_h != null) {
            lines.push(`H: ${match.pitching_h} | HBP: ${match.pitching_hbp ?? '—'} | WAR: ${match.pitching_war?.toFixed(1) ?? '—'}`);
          }

          // Try splits (venue/day-night from BDL — BDL has no L/R breakdown for pitchers)
          const playerId = match.player?.id;
          if (playerId) {
            try {
              const splitsResult = await fetchSplitsWithFallback(playerId, seasonResult.season);
              const splits = splitsResult.splits;
              if (splits?.byBreakdown?.length > 0) {
                lines.push(`Splits:`);
                for (const b of splits.byBreakdown) {
                  const splitLabel = b.split_name || b.split_abbreviation || 'Unknown';
                  const era = b.era != null ? Number(b.era).toFixed(2) : (b.avg != null ? `${Number(b.avg).toFixed(3)} opp AVG` : '—');
                  const ops = b.ops != null ? Number(b.ops).toFixed(3) : '—';
                  const sample = formatSampleSuffix(b, [
                    { field: 'innings_pitched', label: 'IP', decimals: 1 },
                    { field: 'pitching_ip', label: 'IP', decimals: 1 },
                    { field: 'ip', label: 'IP', decimals: 1 },
                    { field: 'games', label: 'G' },
                    { field: 'batters_faced', label: 'BF' },
                  ]);
                  lines.push(`  ${splitLabel}: ${era} ERA, ${ops} opp OPS${sample}`);
                }
              }
            } catch (_) { /* Splits optional */ }

            // Platoon splits (vs LHB / vs RHB) — MLB Stats API, keyed by the
            // probable pitcher's MLBAM id. This is the ONLY structured source
            // for pitcher platoon claims; BDL has no L/R breakdown for pitchers.
            try {
              const mlbamId = pitcher?.id;
              const platoon = mlbamId ? await getPitcherPlatoonSplits(mlbamId, currentYear) : null;
              if (platoon?.vsLeft || platoon?.vsRight) {
                lines.push(`Platoon (opponents batting, ${currentYear}):`);
                for (const [sideLabel, p] of [['vs LHB', platoon.vsLeft], ['vs RHB', platoon.vsRight]]) {
                  if (!p) { lines.push(`  ${sideLabel}: no data`); continue; }
                  lines.push(`  ${sideLabel}: ${p.avg ?? '—'} AVG, ${p.ops ?? '—'} OPS, ${p.hr ?? '—'} HR, ${p.bb ?? '—'} BB (${p.ab ?? '—'} AB)`);
                }
              } else {
                lines.push(`Platoon (vs LHB/RHB): NOT AVAILABLE — do not characterize this pitcher's platoon splits`);
              }
            } catch (_) {
              lines.push(`Platoon (vs LHB/RHB): NOT AVAILABLE — do not characterize this pitcher's platoon splits`);
            }

            // Contact quality allowed + fastball velocity + batted-ball tendency
            try {
              const mlbamId = pitcher?.id;
              const [profile, arsenal, seasonPitching] = await Promise.all([
                getPitcherStatcastProfile(mlbamId ?? pitcherName, currentYear).catch(() => null),
                getPitcherArsenal(mlbamId ?? pitcherName, currentYear).catch(() => null),
                mlbamId ? getPlayerSeasonStats(mlbamId, currentYear, 'pitching').catch(() => null) : Promise.resolve(null),
              ]);
              const parts = [];
              if (profile?.brlPercent != null) parts.push(`Barrel% allowed: ${profile.brlPercent}%`);
              if (profile?.ev95Percent != null) parts.push(`Hard-hit% allowed: ${profile.ev95Percent}%`);
              if (arsenal?.fastballMph != null) parts.push(`Fastball velo: ${arsenal.fastballMph} mph`);
              // GO/AO ratio is the fetchable grounder/flyout tendency proxy
              // (true GB%/FB% has no source in our stack — never cite one).
              if (seasonPitching?.groundOutsToAirouts != null) parts.push(`GO/AO: ${seasonPitching.groundOutsToAirouts} (grounders per flyout — above ~1.2 leans ground-ball, below ~0.8 leans fly-ball)`);
              if (parts.length > 0) {
                lines.push(`Contact/velocity (${currentYear}): ${parts.join(' | ')}`);
              } else {
                lines.push(`Contact/velocity: NOT AVAILABLE — do not cite velocity or batted-ball quality for this pitcher`);
              }
            } catch (_) { /* Savant optional */ }

            // Try BvP data against opposing team
            const opposingTeam = side === 'home' ? away : home;
            const opposingTeamId = await resolveBdlTeamId(opposingTeam);
            if (opposingTeamId) {
              try {
                const bvp = await ballDontLieService.getMlbPlayerVsPlayer({
                  playerId,
                  opponentTeamId: opposingTeamId,
                }).catch(() => []);
                if (bvp && bvp.length > 0) {
                  const opposingName = opposingTeam.full_name || opposingTeam.name;
                  lines.push(`vs ${opposingName} hitters (career, may lag most recent meetings):`);
                  for (const m of bvp.slice(0, 5)) {
                    const batter = m.opponent_player?.full_name || m.opponent_player?.last_name || 'Unknown';
                    const avg = m.avg != null ? (typeof m.avg === 'number' ? m.avg.toFixed(3) : m.avg) : '—';
                    const ab = m.at_bats ?? '—';
                    const hr = m.home_runs ?? '—';
                    lines.push(`  ${batter}: ${avg} AVG, ${hr} HR (${ab} AB)`);
                  }
                }
              } catch (_) { /* BvP optional */ }
            }
          }

          continue;
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] Pitcher scouting API failed for ${pitcherName}:`, e.message);
      }

      lines.push(`${pitcherName}: Scouting data unavailable via API`);
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Starting pitcher scouting for ${awayTeam} @ ${homeTeam}`,
      source: usedApi ? 'BDL API (season stats + splits + BvP)' : 'BDL (no data)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // MLB REGULAR SEASON — STRUCTURED FETCHERS
  // ═══════════════════════════════════════════════════════════════════

  MLB_PITCHER_SEASON_STATS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const gamePk = options?.game?.gamePk || options?.game?.id;
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;
    let pitcherFallbackLabel = '';
    let pitcherFallbackNote = '';

    // Step 1: Identify probable starters via MLB Stats API (no Grounding needed)
    let probablePitchers = null;
    if (gamePk) {
      try {
        probablePitchers = await getProbablePitchers(gamePk);
      } catch (_) { /* Will fall back */ }
    }

    for (const [team, teamName, lines, side] of [
      [home, homeTeam, homeLines, 'home'],
      [away, awayTeam, awayLines, 'away'],
    ]) {
      const pitcher = probablePitchers?.[side];
      const pitcherName = pitcher?.fullName || `${pitcher?.firstName || ''} ${pitcher?.lastName || ''}`.trim();

      if (!pitcherName) {
        lines.push(`${teamName}: Probable pitcher not yet announced`);
        continue;
      }

      // Step 2: Try BDL season stats for the team's pitchers (with prior-season fallback), find the named pitcher
      const bdlTeamId = await resolveBdlTeamId(team);
      if (bdlTeamId) {
        try {
          const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
          if (result.isFallback) {
            pitcherFallbackLabel = ` (${result.season} season)`;
            pitcherFallbackNote = ' (prior season data — current season not yet started)';
          }
          // Find pitchers (have pitching_era or pitching_ip) and match name
          const pitchers = (result.stats || []).filter(s => s.pitching_era != null || s.pitching_ip > 0);
          const pitcherLower = foldName(pitcherName);
          const match = findMlbNamedPlayerStats(pitchers, pitcherLower);
          if (match) {
            usedBdl = true;
            const name = match.player?.full_name || pitcherName;
            const era = match.pitching_era != null ? match.pitching_era.toFixed(2) : '—';
            const whip = match.pitching_whip != null ? match.pitching_whip.toFixed(2) : '—';
            const k = match.pitching_k ?? '—';
            const k9 = match.pitching_k_per_9 != null ? match.pitching_k_per_9.toFixed(1) : '—';
            const ip = match.pitching_ip != null ? match.pitching_ip.toFixed(1) : '—';
            const war = match.pitching_war != null ? match.pitching_war.toFixed(1) : '—';
            const w = match.pitching_w ?? '—';
            const l = match.pitching_l ?? '—';
            const bb = match.pitching_bb ?? '—';
            lines.push(`${name}: ${w}-${l}, ${era} ERA, ${whip} WHIP, ${k} K (${k9} K/9), ${bb} BB in ${ip} IP | WAR: ${war}`);
            if (match.pitching_h != null && match.pitching_hr != null) {
              lines.push(`  H: ${match.pitching_h}, HR: ${match.pitching_hr}, HBP: ${match.pitching_hbp ?? '—'}`);
            }
            continue;
          }
        } catch (e) {
          console.warn(`[MLB Fetchers] BDL pitcher stats failed for ${teamName}:`, e.message);
        }
      }

      // Fallback: legacy MLB Stats API search + season stats
      const players = await searchPlayer(pitcherName).catch(() => []);
      const pitcherPlayer = players.find(p => String(p.id) === String(pitcher?.id)) || findMlbNamedPlayerStats(players.filter(p => p.primaryPosition?.type === 'Pitcher'), pitcherName);
      if (pitcherPlayer?.id) {
        const stats = await getPlayerSeasonStats(pitcherPlayer.id, currentYear, 'pitching').catch(() => null);
        if (stats) {
          lines.push(`${pitcherPlayer.fullName || pitcherName}: ${stats.wins || 0}-${stats.losses || 0}, ${stats.era || '—'} ERA, ${stats.whip || '—'} WHIP, ${stats.strikeOuts || 0} K, ${stats.baseOnBalls || 0} BB in ${stats.inningsPitched || 0} IP`);
          if (stats.strikeOuts && stats.inningsPitched) {
            // MLB IP is THIRDS notation ("10.2" = 10⅔) — parseFloat math
            // under-counted innings and inflated K/9 by up to ~5% on short
            // seasons (Jul 30). Convert to true innings via outs first.
            const raw = parseFloat(stats.inningsPitched) || 0;
            const ip = (Math.floor(raw) * 3 + Math.round((raw % 1) * 10)) / 3 || 1;
            const k9 = ((stats.strikeOuts / ip) * 9).toFixed(1);
            const bb9 = (((stats.baseOnBalls || 0) / ip) * 9).toFixed(1);
            lines.push(`  K/9: ${k9}, BB/9: ${bb9}, K/BB: ${stats.baseOnBalls ? (stats.strikeOuts / stats.baseOnBalls).toFixed(2) : '—'}`);
          }
        } else {
          lines.push(`${pitcherName}: Season stats unavailable via API`);
        }
      } else {
        lines.push(`${pitcherName}: Player not found in API`);
      }
    }
    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Starting pitcher season stats for ${awayTeam} @ ${homeTeam}${pitcherFallbackNote}`,
      source: usedBdl ? `BDL API${pitcherFallbackLabel}` : 'MLB Stats API',
    };
  },

  MLB_PITCHER_RECENT_FORM: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const gamePk = options?.game?.gamePk || options?.game?.id;
    const homeLines = [];
    const awayLines = [];
    let usedApi = false;

    // Try to identify probable pitchers first
    let probablePitchers = null;
    if (gamePk) {
      try {
        probablePitchers = await getProbablePitchers(gamePk);
      } catch (_) { /* Will fall back */ }
    }

    for (const [team, teamName, lines, side] of [
      [home, homeTeam, homeLines, 'home'],
      [away, awayTeam, awayLines, 'away'],
    ]) {
      const pitcher = probablePitchers?.[side];
      const pitcherName = pitcher?.fullName || `${pitcher?.firstName || ''} ${pitcher?.lastName || ''}`.trim();

      if (!pitcherName) {
        lines.push(`${teamName}: Probable pitcher not identified — cannot fetch recent form`);
        continue;
      }

      // Try to find the pitcher's BDL player ID via team season stats
      const bdlTeamId = await resolveBdlTeamId(team);
      let pitcherId = null;

      if (bdlTeamId) {
        try {
          const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
          const pitcherLower = foldName(pitcherName);
          const match = findMlbNamedPlayerStats((result.stats || []).filter(s => s.pitching_ip > 0), pitcherLower);
          if (match?.player?.id) pitcherId = match.player.id;
        } catch (_) { /* Will try game stats below */ }
      }

      if (pitcherId) {
        try {
          // Get pitcher's game-by-game stats in TRUE chronological order
          // (real game dates joined; spring/in-progress rows excluded —
          // game_id is not reliably chronological, June 3 2026 audit).
          const gameStats = await ballDontLieService.getMlbPlayerGameRowsChrono(pitcherId, currentYear).catch(() => []);

          // Filter to starts. BDL game stats use flat field names (ip, er, p_k, etc.)
          // — NOT the pitching_* prefix used by season stats. Rows arrive
          // oldest→newest, so the last 5 entries are the latest 5 starts.
          let starts = gameStats
            .filter(s => (s.ip || 0) >= 3 || (s.games_started || 0) > 0)
            .slice(-5)
            .reverse();

          // If current season empty, try prior season
          if (starts.length === 0) {
            const priorStats = await ballDontLieService.getMlbPlayerGameRowsChrono(pitcherId, currentYear - 1).catch(() => []);

            starts = priorStats
              .filter(s => (s.ip || 0) >= 3 || (s.games_started || 0) > 0)
              .slice(-5)
              .reverse();

            if (starts.length > 0) {
              lines.push(`${pitcherName} — Last 5 starts (${currentYear - 1} season):`);
            }
          } else {
            lines.push(`${pitcherName} — Last ${starts.length} starts:`);
          }

          if (starts.length > 0) {
            usedApi = true;
            for (const s of starts) {
              const ip = s.ip != null ? Number(s.ip).toFixed(1) : '—';
              const h = s.p_hits ?? '—';
              const er = s.er ?? '—';
              const k = s.p_k ?? '—';
              const bb = s.p_bb ?? '—';
              lines.push(`  ${ip} IP, ${h} H, ${er} ER, ${k} K, ${bb} BB`);
            }
            continue;
          }
        } catch (e) {
          console.warn(`[MLB Fetchers] Pitcher recent form API failed for ${pitcherName}:`, e.message);
        }
      }

      // Fallback: season summary from BDL
      if (bdlTeamId) {
        try {
          const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
          const pitcherLower = foldName(pitcherName);
          const match = findMlbNamedPlayerStats((result.stats || []).filter(s => s.pitching_ip > 0), pitcherLower);
          if (match) {
            usedApi = true;
            const label = result.isFallback ? ` (${result.season})` : '';
            lines.push(`${pitcherName} — Season Summary${label}: ${match.pitching_w ?? 0}-${match.pitching_l ?? 0}, ${match.pitching_era?.toFixed(2) ?? '—'} ERA, ${match.pitching_whip?.toFixed(2) ?? '—'} WHIP, ${match.pitching_k ?? '—'} K in ${match.pitching_ip?.toFixed(1) ?? '—'} IP`);
            lines.push(`  (Game-by-game log unavailable — showing season totals)`);
            continue;
          }
        } catch (_) { /* Fall through */ }
      }

      lines.push(`${pitcherName}: Recent form data unavailable`);
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Starting pitcher recent form (last 5 starts) for ${awayTeam} @ ${homeTeam}`,
      source: usedApi ? 'BDL API + MLB Stats API' : 'BDL (no game log data)',
    };
  },

  MLB_BULLPEN_WORKLOAD: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const homeLines = [];
    const awayLines = [];
    let usedApi = false;

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const mlbTeam = await findMlbTeamByName(team.full_name || team.name);
      if (!mlbTeam) {
        lines.push(`${teamName}: Team not found`);
        continue;
      }

      try {
        // PEN RECENCY, THE FOUNDER'S SPEC (Aug 27, replacing the Aug-26
        // 7/14-GAME windows he never asked for — his words: last game, who
        // pitched in it, who's pitched this series, and the pen over the
        // last 5/7/10 DAYS and 3 series). The most recent series prints
        // appearance by appearance (the last game is its newest row), then
        // the day-window and series rollups. Facts only; the read is the
        // brain's. (The Aug-26 composition/close-spot prose died the same
        // day — duplication audit; the game stories carry the narrative.)
        const allRecentGames = await getMlbRecentGames(mlbTeam.id, 14);
        if (!allRecentGames || allRecentGames.length === 0) {
          lines.push(`${teamName}: No recent games found`);
          continue;
        }
        // Series runs, oldest → newest: consecutive games vs the same club.
        const oppOf = (g) => (g?.teams?.home?.team?.id === mlbTeam.id
          ? (g?.teams?.away?.team?.name || '?')
          : (g?.teams?.home?.team?.name || '?'));
        const nickOf = (name) => {
          const two = String(name || '').match(/\b(Blue Jays|Red Sox|White Sox)$/);
          return two ? two[1] : String(name || '?').split(' ').pop();
        };
        const seriesRuns = [];
        for (const g of allRecentGames) {
          const opp = oppOf(g);
          const tail = seriesRuns[seriesRuns.length - 1];
          if (tail && tail.opp === opp) tail.games.push(g);
          else seriesRuns.push({ opp, games: [g] });
        }
        const trailing = seriesRuns[seriesRuns.length - 1];
        // DETAIL FLOOR (founder, Aug 27: "for the last game, the last two
        // games, Gary needs to know every single thing"): the full trailing
        // series AND never fewer than the last three games, even when a new
        // series just started — capped at six appearances-detail games.
        const detailSet = new Map();
        for (const g of [...(trailing?.games || []), ...allRecentGames.slice(-3)]) {
          if (g?.gamePk != null) detailSet.set(g.gamePk, g);
        }
        const detailGames = [...detailSet.values()]
          .sort((x, y) => String(bullpenLedgerDate(x)).localeCompare(String(bullpenLedgerDate(y))))
          .slice(-6);
        const detailPks = new Set(detailGames.map((g) => g.gamePk));
        // "This series" vs "last series": is the trailing run tonight's opponent?
        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
        const tonightOpp = norm(teamName) === norm(homeTeam) ? awayTeam : homeTeam;
        const trailingIsTonight = trailing && (norm(trailing.opp) === norm(tonightOpp)
          || norm(trailing.opp).includes(norm(nickOf(tonightOpp)))
          || norm(tonightOpp).includes(norm(nickOf(trailing.opp))));
        lines.push(`${teamName} pen, ${trailingIsTonight ? `this series vs ${nickOf(trailing.opp)}` : `last series (vs ${nickOf(trailing?.opp)})`} and the last three games, newest first, appearance by appearance:`);

        usedApi = true;
        // ONE boxscore walk over the whole fetch: full appearance lines for
        // the detail window, bare per-game pen totals for the rollups.
        // (recentGames come from MLB Stats API — gamePk namespace; BDL game
        // ids are a different namespace and return nothing here.)
        const perGamePen = []; // { pk, date, outs, er }
        const armTotals = new Map(); // detail window: name -> { outs, pitches, er, dates[] }
        const gameDates = [];        // detail window, chronological
        const detailRows = [];       // detail window rows, printed newest first
        for (const game of allRecentGames) {
          const date = bullpenLedgerDate(game);
          const inDetail = detailPks.has(game.gamePk);
          const box = await getGameBoxScore(game.gamePk).catch(() => null);
          if (!box?.teams) {
            if (inDetail) lines.push(`${date}: Box score unavailable`);
            continue;
          }
          // ENTRY CONTEXT (founder GO, Aug 12 — the pen's missing story):
          // the situation each arm walked into — inning and score before his
          // first pitch — from the official play-by-play. Detail window only.
          const entryCtx = inDetail ? await getPitcherEntryContext(game.gamePk).catch(() => new Map()) : new Map();
          const sideKey = box.teams.home?.team?.id === mlbTeam.id ? 'home' : 'away';
          const side = box.teams[sideKey];
          let gOuts = 0;
          let gEr = 0;
          const relievers = [];
          // pitchers[] is appearance order: [0] is the STARTER, everyone after
          // is relief. relieverBoxEntries also drops position players mopping
          // up a blowout — they are not pen arms (Aug 15 KC fix).
          for (const { pid, player: p } of relieverBoxEntries(side)) {
            const ipStr = p?.stats?.pitching?.inningsPitched;
            if (ipStr == null) continue;
            // MLB IP is in "outs decimal" form (e.g. "1.2" = 1 inning + 2 outs).
            const ip = parseFloat(ipStr);
            if (!Number.isFinite(ip) || ip < 0) continue;
            const outs = Math.floor(ip) * 3 + Math.round((ip % 1) * 10);
            const er = p?.stats?.pitching?.earnedRuns;
            gOuts += outs;
            gEr += Number(er) || 0;
            if (!inDetail) continue;
            const name = p?.person?.fullName || 'Unknown';
            // Pitch count is the real workload signal — IP alone overstates a
            // 15-pitch four-out save and understates a 30-pitch single inning.
            const pitches = p?.stats?.pitching?.numberOfPitches;
            const pitchStr = pitches != null ? `, ${pitches} pitches` : '';
            // PEN CONTEXT (founder GO, Aug 5 PM): the official decision note
            // carries the appearance's result by name — (BS, 4), (SV, 20),
            // (H, 12) — so a blown save is a printed fact.
            const note = p?.stats?.pitching?.note;
            // THE OUTING'S SHAPE (founder GO, Aug 12 — Plan A2): K/BB and
            // inherited runners make the appearance a story, not a bare IP.
            const k = p?.stats?.pitching?.strikeOuts;
            const bb = p?.stats?.pitching?.baseOnBalls;
            const ir = p?.stats?.pitching?.inheritedRunners;
            const irs = p?.stats?.pitching?.inheritedRunnersScored;
            const kbb = [k != null && k > 0 ? `${k} K` : null, bb != null && bb > 0 ? `${bb} BB` : null].filter(Boolean).join(' ');
            const inherited = ir != null && Number(ir) > 0 ? `, inherited ${irs ?? 0}/${ir} scored` : '';
            // The situation he entered: "in B7 2-1" — the score before his
            // first pitch, from the play-by-play entry context above.
            const ec = entryCtx.get(pid);
            const entered = ec?.inning != null ? ` (in ${ec.half}${ec.inning} ${ec.awayScore}-${ec.homeScore})` : '';
            // Real traffic only (2+ on) — one runner is a Tuesday.
            const jam = ec?.maxOn >= 3 ? ', bases loaded' : ec?.maxOn === 2 ? ', 2 on' : '';
            relievers.push(`${name} ${ip.toFixed(1)} IP${entered}${er != null ? `, ${er} ER` : ''}${kbb ? `, ${kbb}` : ''}${inherited}${jam}${pitchStr}${note ? ` ${note}` : ''}`);
            const t = armTotals.get(name) || { outs: 0, pitches: 0, er: 0, dates: [] };
            t.outs += outs;
            t.pitches += Number(pitches) || 0;
            t.er += Number(er) || 0;
            t.dates.push(date);
            armTotals.set(name, t);
          }
          perGamePen.push({ pk: game.gamePk, date, outs: gOuts, er: gEr });
          if (inDetail) {
            gameDates.push(date);
            // THE GAME AS A GAME (founder GO, Sep 2 2026): the result, the
            // starter's line and where he left it, then the pen in order.
            const mine = game?.teams?.[sideKey];
            const theirs = game?.teams?.[sideKey === 'home' ? 'away' : 'home'];
            const result = mine?.score != null && theirs?.score != null
              ? `${mine.isWinner ? 'W' : theirs.isWinner ? 'L' : 'T'} ${mine.score}-${theirs.score} ${sideKey === 'home' ? 'vs' : '@'} ${nickOf(theirs?.team?.name)}`
              : null;
            const spId = Array.isArray(side.pitchers) ? side.pitchers[0] : null;
            const sp = spId != null ? side.players?.[`ID${spId}`] : null;
            let spLine = null;
            if (sp) {
              const st = sp.stats?.pitching || {};
              const firstRelPid = relieverBoxEntries(side)[0]?.pid;
              const ec = firstRelPid != null ? entryCtx.get(firstRelPid) : null;
              const left = ec?.inning != null
                ? `, left in ${ec.half}${ec.inning} with the score ${ec.awayScore}-${ec.homeScore} (away-home)`
                : (relievers.length ? '' : ', went the distance');
              spLine = `SP ${sp.person?.fullName || 'starter'} ${st.inningsPitched ?? '?'} IP, ${st.earnedRuns ?? '?'} ER${st.numberOfPitches != null ? `, ${st.numberOfPitches} pitches` : ''}${left}`;
            }
            const penPart = relievers.length
              ? (spLine ? `then ${relievers.join(', ')}` : relievers.join(', '))
              : 'no reliever appearances';
            detailRows.push(`${date}${result ? ` (${result})` : ''}: ${[spLine, penPart].filter(Boolean).join(' — ')}`);
          }
        }
        lines.push(...detailRows.reverse());
        // Roll-up (founder, Jul 30): the aggregate facts beside the ledger —
        // total relief IP, arms used, and who worked both of the last two
        // game days. Facts only.
        if (armTotals.size) {
          const totalOuts = [...armTotals.values()].reduce((s, a) => s + a.outs, 0);
          const totalEr = [...armTotals.values()].reduce((acc, a) => acc + (a.er || 0), 0);
          // Distinct dates — a doubleheader made everyone 'worked both of
          // the last two game days' (live catch, Rockies Aug 5 DH).
          const lastTwo = [...new Set(gameDates)].slice(-2);
          const b2b = [...armTotals.entries()]
            .filter(([, a]) => lastTwo.length === 2 && lastTwo.every((d) => a.dates.includes(d)))
            .map(([n]) => n);
          const heaviest = [...armTotals.entries()]
            .sort((a, b) => b[1].pitches - a[1].pitches)
            .slice(0, 3)
            .map(([n, a]) => `${n} ${a.pitches} pitches/${a.dates.length} G`)
            .join(', ');
          lines.push(
            `These ${gameDates.length} game${gameDates.length === 1 ? '' : 's'} total: ${outsToIp(totalOuts)} relief IP, ${totalEr} ER ` +
            `across ${armTotals.size} arms; heaviest: ${heaviest}; ` +
            `worked both of the last two game days: ${b2b.length ? b2b.join(', ') : 'none'}.`,
          );
        }
        // The pen by DAYS — the founder's recency grain (5/7/10 calendar days
        // back from today ET, so off days and doubleheaders count as
        // themselves instead of stretching a game-count window).
        const todayEtPen = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const daysAgoPen = (d) => Math.round((new Date(`${todayEtPen}T12:00:00`) - new Date(`${d}T12:00:00`)) / 86400000);
        for (const win of [5, 7, 10]) {
          const rows = perGamePen.filter((r) => r.date && daysAgoPen(r.date) >= 0 && daysAgoPen(r.date) <= win);
          const outs = rows.reduce((s, r) => s + r.outs, 0);
          const er = rows.reduce((s, r) => s + r.er, 0);
          if (rows.length && outs > 0) {
            lines.push(`Pen last ${win} days: ${outsToIp(outs)} IP, ${er} ER (${((er * 27) / outs).toFixed(2)} ERA) over ${rows.length} game${rows.length === 1 ? '' : 's'}`);
          }
        }
        // The pen by SERIES — the sport's native unit, last three, newest first.
        const seriesBits = seriesRuns.slice(-3).reverse().map((s) => {
          const pks = new Set(s.games.map((g) => g.gamePk));
          const rows = perGamePen.filter((r) => pks.has(r.pk));
          if (!rows.length) return null;
          const outs = rows.reduce((sum, r) => sum + r.outs, 0);
          const er = rows.reduce((sum, r) => sum + r.er, 0);
          return `vs ${nickOf(s.opp)} (${rows.length}g): ${outsToIp(outs)} IP, ${er} ER`;
        }).filter(Boolean);
        if (seriesBits.length) lines.push(`Pen by series, newest first: ${seriesBits.join(' · ')}`);
      } catch (e) {
        console.warn(`[MLB Fetchers] ⚠️ Bullpen workload API failed for ${teamName}: ${e.message}`);
        lines.push(`${teamName}: Bullpen workload data unavailable — check MLB Stats API boxscore`);
      }
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Bullpen recency (series detail + 5/7/10-day and 3-series rollups) for ${awayTeam} @ ${homeTeam}`,
      source: usedApi ? 'BDL API + MLB Stats API' : 'grounded search (fallback)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // MLB NEW: Closer/Reliever, Catcher Defense, RISP, Team Defense
  // ═══════════════════════════════════════════════════════════════════

  // THE PEN — every arm, newest work first (founder GO, Sep 2 2026): built
  // roster-first from the official game logs in penArms.js. The BDL-stint
  // list this replaced dropped any arm under 3 IP with the club and anyone
  // with a start on his record — the Sep 1 Red Sox desk printed four arms of
  // eight, and the "pen as a unit" line was built from the four.
  MLB_CLOSER_RELIEVER_STATS: async (sport, home, away, season, options) => fetchPenArms(sport, home, away, season, options),

  // ═══════════════════════════════════════════════════════════════════
  // STATCAST — CONTACT QUALITY (exit velocity, barrel rate, hard hit)
  // Uses BDL /mlb/v1/plate_appearances endpoint (pitch-level Statcast)
  // ═══════════════════════════════════════════════════════════════════

  MLB_STATCAST: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const homeLines = [];
    const awayLines = [];
    let usedApi = false;

    // Helper: compute Statcast aggregates from plate appearances
    function computeStatcast(pas, teamBattingHalf) {
      const evs = [];
      let barrels = 0;
      let totalBIP = 0;
      for (const pa of pas) {
        if (pa.half_inning !== teamBattingHalf) continue;
        const pitches = pa.pitches || [];
        const last = pitches[pitches.length - 1];
        if (!last?.exit_velocity) continue;
        totalBIP++;
        evs.push(last.exit_velocity);
        if (last.is_barrel === true) barrels++;
      }
      if (totalBIP === 0) return null;
      const avgEV = evs.reduce((a, b) => a + b, 0) / evs.length;
      const hardHits = evs.filter(v => v >= 95).length;
      return {
        avgEV: avgEV.toFixed(1),
        hardHitPct: ((hardHits / totalBIP) * 100).toFixed(1),
        barrelPct: ((barrels / totalBIP) * 100).toFixed(1),
        bip: totalBIP
      };
    }

    for (const [team, teamName, lines, isHomeTeam] of [
      [home, homeTeam, homeLines, true],
      [away, awayTeam, awayLines, false]
    ]) {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) { lines.push(`${teamName}: Unable to resolve team`); continue; }

      try {
        // Get last 5 days of games for this team
        const dates = [];
        for (let i = 1; i <= 7; i++) {
          const d = new Date(); d.setDate(d.getDate() - i);
          dates.push(d.toISOString().slice(0, 10));
        }
        const teamGames = await ballDontLieService.getGames('baseball_mlb', {
          team_ids: [bdlTeamId], dates, per_page: 50
        }).catch(() => []);

        const finished = (teamGames || [])
          .filter(g => g.status === 'STATUS_FINAL')
          .sort((a, b) => (b.id || 0) - (a.id || 0))
          .slice(0, 3);

        if (finished.length === 0) {
          lines.push(`${teamName}: No recent completed games for Statcast`);
          continue;
        }

        // Fetch plate appearances for up to 3 recent games
        const allPAs = [];
        for (const game of finished) {
          const gamePAs = await ballDontLieService.getMlbPlateAppearances(game.id).catch(() => []);
          // Determine which half_inning is this team's batting
          const isTeamHome = game.home_team?.id === bdlTeamId;
          const battingHalf = isTeamHome ? 'bottom' : 'top';
          for (const pa of gamePAs) {
            pa._teamBattingHalf = battingHalf;
          }
          allPAs.push(...gamePAs);
        }

        if (allPAs.length === 0) {
          lines.push(`${teamName}: No plate appearance data available`);
          continue;
        }

        // Two aggregations from BDL plate-appearance Statcast:
        // (1) BIP-level — last pitch of each PA that produced a ball in play.
        //     Extracts the full Statcast surface (xwOBA, xSLG, xBA, launch
        //     angle, bat speed, barrel) not just exit velocity. xwOBA is the
        //     headline regression-aware contact metric — much more predictive
        //     than raw wOBA or BA, and the metric sharp MLB bettors actually use.
        // (2) Pitch-level — every pitch in the team's batting PAs, used to
        //     compute swing decisions (whiff rate, chase rate). Predictive for
        //     strikeout props and pitcher matchup quality.
        const bipPitches = [];
        let pitchTotal = 0, swings = 0, whiffs = 0, oozPitches = 0, chases = 0;
        for (const pa of allPAs) {
          if (pa.half_inning !== pa._teamBattingHalf) continue;
          const pitches = pa.pitches || [];
          for (const p of pitches) {
            pitchTotal++;
            if (p.is_swing === true) swings++;
            if (p.is_whiff === true) whiffs++;
            if (p.is_in_zone === false) {
              oozPitches++;
              if (p.is_chase === true) chases++;
            }
          }
          const last = pitches[pitches.length - 1];
          if (last && last.exit_velocity != null) bipPitches.push(last);
        }

        if (bipPitches.length === 0) {
          lines.push(`${teamName}: No Statcast contact data from recent games`);
          continue;
        }

        usedApi = true;
        const nums = (arr, key) => arr.map(p => p[key]).filter(v => v != null && Number.isFinite(Number(v))).map(Number);
        const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        const fmt = (v, d = 1) => v != null ? v.toFixed(d) : '—';
        const pct = (num, den) => den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—';

        const evs = nums(bipPitches, 'exit_velocity');
        const las = nums(bipPitches, 'launch_angle');
        const xwobas = nums(bipPitches, 'expected_woba');
        const xslgs = nums(bipPitches, 'expected_slugging');
        const xbas = nums(bipPitches, 'expected_batting_average');
        const batSpeeds = nums(bipPitches, 'bat_speed');
        const barrels = bipPitches.filter(p => p.is_barrel === true).length;
        const hardHits = evs.filter(v => v >= 95).length;
        const sweetSpot = las.filter(la => la >= 8 && la <= 32).length;
        const maxEV = evs.length ? Math.max(...evs) : null;

        lines.push(`${teamName} (last ${finished.length} games, ${bipPitches.length} BIP, ${pitchTotal} pitches):`);
        lines.push(`  Exit Velo: avg ${fmt(avg(evs))} mph, max ${fmt(maxEV)} mph, hard-hit ${pct(hardHits, evs.length)}`);
        if (las.length) lines.push(`  Launch Angle: avg ${fmt(avg(las))}°, sweet-spot (8–32°) ${pct(sweetSpot, las.length)}`);
        if (xwobas.length || xslgs.length || xbas.length) {
          lines.push(`  Expected: ${fmt(avg(xwobas), 3)} xwOBA, ${fmt(avg(xslgs), 3)} xSLG, ${fmt(avg(xbas), 3)} xBA`);
        }
        lines.push(`  Barrels: ${pct(barrels, bipPitches.length)}`);
        if (batSpeeds.length) lines.push(`  Bat Speed: avg ${fmt(avg(batSpeeds))} mph`);
        if (swings > 0 || oozPitches > 0) {
          lines.push(`  Plate discipline: whiff ${pct(whiffs, swings)}, chase ${pct(chases, oozPitches)}`);
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] Statcast fetch failed for ${teamName}:`, e.message);
        lines.push(`${teamName}: Statcast data unavailable`);
      }
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Statcast contact quality (last 3 games) for ${awayTeam} @ ${homeTeam}`,
      source: usedApi ? 'BDL API (Statcast plate appearances)' : 'BDL (no data)',
    };
  },

  // Default handler
  // DEFAULT removed Jul 6 2026 — the neutral unknown-token handler lives in
  // statRouters/index.js (per-sport DEFAULTs collided in the merged map).
};
