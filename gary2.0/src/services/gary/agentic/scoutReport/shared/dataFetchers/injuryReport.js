/** Scout-report data: The INJURY REPORT and starting-lineup sections of the desk. (split from dataFetchers.js, Oct 13 2026) */
import { reconcileNflStatus } from '../../../../../sports/nfl/nflAvailability.js';
import { playerNamesMatch } from '../utilities.js';

// ============================================================================
// FORMAT INJURY REPORT
// ============================================================================

export function formatInjuryReport(homeTeam, awayTeam, injuries, sportKey, rosterDepth = null) {
  const lines = [];

  // ADD TODAY'S DATE AT THE TOP - Gary needs this anchor to understand injury timing
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  lines.push(`TODAY'S DATE: ${todayStr}`);
  lines.push('');
  // A source that did not load says so above the rows it would have set (Oct 23 2026 source audit).
  for (const note of injuries?.notOnFile || []) lines.push(note);
  lines.push('');

  // Categorize injuries by importance/duration
  const categorize = (teamInjuries) => {
    const critical = teamInjuries.filter(i => (i.duration === 'FRESH' || i.duration === 'SHORT-TERM' || i.isEdge === true) && i.status !== 'Out' && i.status !== 'OFS');
    // OFS = Out For Season (Rotowire status code)
    const out = teamInjuries.filter(i => i.status === 'Out' || i.status === 'IR' || i.status === 'LTIR' || i.status === 'OFS' || i.status === 'Injured Reserve');
    const seasonal = teamInjuries.filter(i => i.duration === 'SEASON-LONG' && i.status !== 'Out' && i.status !== 'IR' && i.status !== 'OFS' && (i.status || '').toUpperCase() !== 'GTD');
    const others = teamInjuries.filter(i =>
      !critical.includes(i) && !out.includes(i) && !seasonal.includes(i)
    );
    return { critical, out, seasonal, others };
  };

  const homeCats = categorize(injuries.home || []);
  const awayCats = categorize(injuries.away || []);

  // Build roster lookup for team-share context (NBA only, when rosterDepth available)
  const rosterUsageLookup = new Map();
  if (rosterDepth) {
    const allRosterPlayers = [...(rosterDepth.home || []), ...(rosterDepth.away || [])];
    for (const p of allRosterPlayers) {
      if (p.name && (p.pct_pts || p.pct_ast || p.pct_fga)) {
        rosterUsageLookup.set(p.name.toLowerCase().trim(), {
          pct_pts: p.pct_pts || 0,
          pct_reb: p.pct_reb || 0,
          pct_fga: p.pct_fga || 0,
          pct_ast: p.pct_ast || 0
        });
      }
    }
  }

  // Helper to find usage data for an injured player via name matching
  const getPlayerUsage = (playerName) => {
    const nameLower = (playerName || '').toLowerCase().trim();
    if (!nameLower || rosterUsageLookup.size === 0) return null;
    // Direct match first
    if (rosterUsageLookup.has(nameLower)) return rosterUsageLookup.get(nameLower);
    // Fuzzy match (handles hyphenated names etc.)
    for (const [rosterName, usage] of rosterUsageLookup) {
      if (playerNamesMatch(nameLower, rosterName)) return usage;
    }
    return null;
  };

  const formatPlayer = (i) => {
    const name = `${i.player?.first_name || i.firstName || ''} ${i.player?.last_name || i.lastName || ''}`.trim() || i.name || 'Unknown';
    const pos = i.player?.position_abbreviation || i.player?.position || i.position || '';
    // VERBATIM, never cut (founder law: truncation never acceptable — the old
    // first-sentence + 60-char cut printed "did not participate in Monday's
    // practic" into the dossier, live Aug 20). Newlines fold to spaces only.
    // The NBA's official report carries its reason as durationContext (audit, Oct 13 2026).
    // A note that is only a status word repeats the status (Oct 29 2026 hunt, round 7: "Keisean Nixon ... (Questionable)
    // - questionable"); the feed gave no injury.
    const said = (i.description || i.comment || i.injury || i.durationContext || '').replace(/\s+/g, ' ').trim();
    const reason = /^(?:questionable|doubtful|out|probable|active|day-to-day)\.?$/i.test(said) ? 'injury not on file' : said;
    const shortReason = reason ? ` - ${reason}` : '';

    // Build duration tag with ACTUAL DATE, days, and games missed for Gary to see clearly
    let durationTag = '';
    let nflSaid = false;   // an NFL row whose bracket was left empty on purpose (round 16)
    const days = i.daysSinceReport;
    const reportDate = i.reportDateStr; // e.g., "Jan 8"

    // Games-missed label — factual count, no conclusions
    const gm = i.gamesMissed;
    const gmMin = i.gamesMissedIsMinimum;
    let gmLabel = '';
    if (gm !== null && gm !== undefined && gm >= 0) {
      gmLabel = `, ${gmMin ? `${gm}+` : gm} game${gm !== 1 ? 's' : ''} missed`;
    }

    // Show actual date, days ago, AND games missed for maximum clarity
    let timeInfo = '';
    if (reportDate && days !== null && days !== undefined) {
      timeInfo = ` — Since ${reportDate} (${days}d${gmLabel})`;
    } else if (days !== null && days !== undefined) {
      timeInfo = ` (${days}d${gmLabel})`;
    } else if (reportDate) {
      timeInfo = ` — Since ${reportDate}${gmLabel}`;
    } else if (gmLabel) {
      timeInfo = ` (${gmLabel.substring(2)})`;
    }

    // Factual duration labels — just the facts, no conclusions about line movement
    // GTD checked FIRST — a GTD player might return regardless of how long they were out
    const isNcaab = sportKey && (sportKey.includes('ncaab') || sportKey.includes('NCAAB'));
    const isNhl = sportKey && (sportKey.includes('nhl') || sportKey.includes('NHL'));

    let shownStatus = i.status;
    if (/^(?:americanfootball_)?nfl$/i.test(sportKey || '')) {
      // The reported status and whether he played the team's most recent games (nflGameByGame.js
      // attachNflParticipation). No timing tag (founder, Oct 5 2026: "even new this week will still be
      // priced into the line"): every absence is in the spread, and the injury section says so. The age of
      // the report is not printed either: the NFL re-lists every injured player weekly, and "FRESH —
      // Reported Oct 2 (2d)" sat on a quarterback missing his second straight game.
      // This week's note wins over the feed's leftover status word, and the desk says so (nflAvailability.js).
      const reconciled = reconcileNflStatus(i);
      shownStatus = reconciled.status || i.status;
      const rawStatus = String(reconciled.status || 'Unknown').trim().toUpperCase() || 'UNKNOWN';
      const status = (({ Q: 'QUESTIONABLE', D: 'DOUBTFUL', O: 'OUT' })[rawStatus] || rawStatus)
        + (reconciled.feed ? reconciled.pending ? ` (the league has not issued this week's game statuses); the feed reads ${String(reconciled.feed).toUpperCase()}`
          : reconciled.official ? ` per a note after the official report, which reads ${String(reconciled.feed).toUpperCase()}`
          : ` per this week's note; the feed still reads ${String(reconciled.feed).toUpperCase()}` : '');
      const oldNote = i.noteCurrent === false && i.reportDateStr ? ` (note from ${i.reportDateStr}, before the last game)` : '';
      const p = i.participation;
      const before = p?.earlier?.length ? `; the games before, newest first: ${p.earlier.map((x) => (typeof x === 'number' ? `${x}%` : x)).join(', ')}` : '';
      const share = p?.lastText ? `, ${p.lastText}${before}` : p?.lastShare != null ? `, ${p.lastShare}% of snaps${before}` : '';
      const played = !p ? '' : p.neverPlayed ? `; has not played this season${p.reserveAll ? ' (on reserve every week so far)' : ''}` : p.missed > 0
        ? `; did not play the last ${p.missed === 1 ? 'game' : `${p.missed} games`} (${p.missedWeeks.map((w) => `Wk ${w}`).join(', ')}); last played Wk ${p.lastPlayedWeek}${share}`
        : p.lastShare != null && p.lastShare < 10 ? `; on the field for ${p.lastShare}% of snaps in the last game (Wk ${p.lastPlayedWeek}${before})`
        : `; played in the last game (Wk ${p.lastPlayedWeek}${share})`;
      // The status in the bracket only when this week's note and the feed disagree; the row's heading has it, and before the
      // game statuses come out the feed's word is a placeholder (round 16: the status three or four times a row).
      const sameWord = String(shownStatus || '').trim().toUpperCase() === status;
      const said = (reconciled.feed && !reconciled.pending) || (!reconciled.feed && !sameWord) ? `${status}${played}` : played.replace(/^;\s*/, '');
      durationTag = said ? `${oldNote} [${said}]` : oldNote;
      nflSaid = true;
    } else if (i.status?.toUpperCase() === 'GTD') {
      const durationContext = days ? ` - was out ${days}d` : '';
      durationTag = ` [GTD${durationContext}]`;
    } else if (i.duration === 'SEASON START') {
      durationTag = ' [SEASON OPENER — no regular-season games played yet]';
    } else if (i.duration === 'SEASON-LONG' || i.status === 'Injured Reserve' || i.status === 'IR' || i.status === 'LTIR' || i.status === 'OFS') {
      // How many of the team's games the box scores were checked over, when that is all that is known (round 9: "recent
      // games" for players out every game of the season).
      durationTag = ` [SEASON-LONG${i.gamesMissedIsMinimum && Number(i.gamesMissed) > 0 ? `: ${Number(i.gamesMissed)}` : ''}]`;
    } else if (i.duration === 'LONG-TERM') {
      durationTag = ` [LONG-TERM${timeInfo}]`;
    } else if (i.duration === 'FRESH') {
      durationTag = ` [FRESH${timeInfo}]`;
    } else if (i.duration === 'SHORT-TERM') {
      durationTag = ` [SHORT-TERM${timeInfo}]`;
    } else if (i.duration === 'PRICED IN') {
      durationTag = ` [PRICED IN${timeInfo}]`;
    } else if (days !== null && days !== undefined) {
      durationTag = ` [OUT${timeInfo}]`;
    }

    if (!durationTag && !nflSaid && (i.status === 'IR' || i.status === 'Injured Reserve' || i.status === 'LTIR' || i.status === 'OFS' ||
        (i.description && i.description.toLowerCase().includes('injured reserve')))) {
      durationTag = ' [Out For Season]';
    }

    // Probable = expected to play (~75%+ chance). NOT out — do not label as OUT.
    if (!durationTag && !nflSaid && (i.status === 'Prob' || i.status === 'Probable')) {
      durationTag = ' [Probable — Expected to Play]';
    }

    // Fallback: no duration info resolved
    if (!durationTag && !nflSaid && !reportDate && days === null) {
      durationTag = ' [OUT - duration unknown]';
    }

    let result = `  • ${name}${pos ? ` (${pos})` : ''} (${shownStatus || 'Unknown'})${shortReason}${durationTag}`;

    // Add team-share context for OUT/DOUBTFUL players (NBA only)
    // Shows what % of team production is missing — helps Gary assess line adjustment
    const statusUp = (i.status || '').toUpperCase();
    const isOut = statusUp.includes('OUT') || statusUp === 'IR' || statusUp === 'LTIR' || statusUp === 'OFS' || statusUp === 'DOUBTFUL';
    if (isOut) {
      const usage = getPlayerUsage(name);
      if (usage && (usage.pct_pts > 0.05 || usage.pct_ast > 0.05)) {
        const shareParts = [];
        if (usage.pct_pts) shareParts.push(`${(usage.pct_pts * 100).toFixed(1)}% PTS`);
        if (usage.pct_reb) shareParts.push(`${(usage.pct_reb * 100).toFixed(1)}% REB`);
        if (usage.pct_fga) shareParts.push(`${(usage.pct_fga * 100).toFixed(1)}% FGA`);
        result += `\n      Team Share: ${shareParts.join(' | ')}`;
      }
    }

    return result;
  };

  if (/^(?:americanfootball_)?nfl$/i.test(sportKey || '')) {
    // NFL supplies the date of the latest report, not the start of an absence.
    // Keep every row once; report age alone cannot establish time missed or
    // whether an absence has already appeared in the team's games or odds.
    lines.push('NFL INJURY REPORT');
    lines.push('────────────────────────────────────────');
    for (const [side, team, tag] of [['home', homeTeam, '[HOME]'], ['away', awayTeam, '[AWAY]']]) {
      lines.push(`${tag} ${team}:`);
      const rows = injuries[side] || [];
      if (rows.length) rows.forEach(i => lines.push(formatPlayer(i)));
      else lines.push(injuries.sourceOk === false ? '  Injury report unavailable' : '  No injuries reported');
      lines.push('');
    }
    return lines.join('\n');
  }

  const isCollege = /ncaaf/i.test(String(sportKey || ''));
  const collegeEmpty = (side) => (injuries?.sourceOk !== false && injuries?.collegeContext?.sides?.[side]?.availability === 'checked'
    ? 'No absences reported by the checked sources' : 'Availability report not retrieved; absences unknown');

  // Split injuries into two structural tiers per team
  const splitTeam = (cats) => {
    // Active = new developments that may not be reflected in recent form/line
    // A season opener's absences have no games behind them yet (the stats are last season's), so they are active.
    const recentOut = cats.out.filter(i => i.duration === 'FRESH' || i.duration === 'SEASON START' || i.isEdge === true);
    const questionableGtd = cats.others.filter(i => i.status !== 'Prob' && i.status !== 'Probable');
    const probable = cats.others.filter(i => i.status === 'Prob' || i.status === 'Probable');
    const active = [...cats.critical, ...recentOut, ...questionableGtd, ...probable];

    // Established = team has been playing without these players
    const midSeasonOut = cats.out.filter(i => i.duration === 'SHORT-TERM');
    const seasonLongOut = cats.out.filter(i =>
      i.duration === 'SEASON-LONG' || i.status === 'IR' || i.status === 'LTIR' || i.status === 'OFS' || i.status === 'Injured Reserve'
    );
    const unknownOut = cats.out.filter(i =>
      !recentOut.includes(i) && !midSeasonOut.includes(i) && !seasonLongOut.includes(i)
    );
    const established = [...midSeasonOut, ...seasonLongOut, ...cats.seasonal, ...unknownOut];

    return { active, established, recentOut, questionableGtd, probable, midSeasonOut, seasonLongOut, unknownOut };
  };

  const homeSplit = splitTeam(homeCats);
  const awaySplit = splitTeam(awayCats);

  // ── TIER 1: ACTIVE INJURIES ──
  const hasAnyActive = homeSplit.active.length > 0 || awaySplit.active.length > 0;
  if (hasAnyActive) {
    lines.push('ACTIVE INJURIES');
    lines.push('────────────────────────────────────────');

    const renderActive = (teamName, cats, split, locationTag) => {
      const parts = [];
      if (cats.critical.length > 0) {
        cats.critical.forEach(i => parts.push(formatPlayer(i)));
      }
      if (split.recentOut.length > 0) {
        split.recentOut.forEach(i => parts.push(formatPlayer(i)));
      }
      if (split.questionableGtd.length > 0) {
        split.questionableGtd.forEach(i => parts.push(formatPlayer(i)));
      }
      if (split.probable.length > 0) {
        split.probable.forEach(i => parts.push(formatPlayer(i)));
      }
      if (parts.length > 0) {
        lines.push(`${locationTag} ${teamName}:`);
        parts.forEach(p => lines.push(p));
        lines.push('');
      } else if (isCollege && split.established.length === 0) {
        // A college side with no rows says whether its availability was read at all (college review, Oct 13 2026).
        lines.push(`${locationTag} ${teamName}: ${collegeEmpty(locationTag === '[HOME]' ? 'home' : 'away')}`);
        lines.push('');
      }
    };

    renderActive(homeTeam, homeCats, homeSplit, '[HOME]');
    renderActive(awayTeam, awayCats, awaySplit, '[AWAY]');
  } else if (isCollege) {
    for (const [team, split, tag, side] of [[homeTeam, homeSplit, '[HOME]', 'home'], [awayTeam, awaySplit, '[AWAY]', 'away']]) {
      if (split.established.length === 0) { lines.push(`${tag} ${team}: ${collegeEmpty(side)}`); lines.push(''); }
    }
  }

  // ── TIER 2: ESTABLISHED ABSENCES ──
  const hasAnyEstablished = homeSplit.established.length > 0 || awaySplit.established.length > 0;
  if (hasAnyEstablished) {
    lines.push('ESTABLISHED ABSENCES (already reflected in line + all stats above — do NOT cite these players by name as reasons for your pick)');
    lines.push('────────────────────────────────────────');

    const renderEstablished = (teamName, split, locationTag) => {
      if (split.established.length === 0) return;
      lines.push(`${locationTag} ${teamName}:`);
      split.established.forEach(i => lines.push(formatPlayer(i)));
      lines.push('');
    };

    renderEstablished(homeTeam, homeSplit, '[HOME]');
    renderEstablished(awayTeam, awaySplit, '[AWAY]');
  }

  // No injuries at all (a college side already printed its own line above; a failed feed is never "no injuries")
  // An NBA team that has not filed its official report yet is unread, never healthy (audit, Oct 13 2026).
  const notFiled = (side) => (injuries?.notSubmitted?.[side] ? `Official injury report not yet submitted (league report of ${injuries.notSubmitted.reportTime || 'the latest posting'})` : null);
  if (!hasAnyActive && !hasAnyEstablished && !isCollege) {
    lines.push(`[HOME] ${homeTeam}: ${notFiled('home') || (injuries?.sourceOk === false ? 'Injury report unavailable' : 'No injuries reported')}`);
    lines.push(`[AWAY] ${awayTeam}: ${notFiled('away') || (injuries?.sourceOk === false ? 'Injury report unavailable' : 'No injuries reported')}`);
    lines.push('');
  } else if (!isCollege && (notFiled('home') || notFiled('away'))) {
    if (notFiled('home')) lines.push(`[HOME] ${homeTeam}: ${notFiled('home')}`);
    if (notFiled('away')) lines.push(`[AWAY] ${awayTeam}: ${notFiled('away')}`);
    lines.push('');
  }


  return lines.join('\n');
}

// ============================================================================
// FORMAT STARTING LINEUPS
// ============================================================================

export function formatStartingLineups(homeTeam, awayTeam, lineups) {
  if (!lineups || (!lineups.home?.length && !lineups.away?.length)) return '';

  // A web search's projection, named as one (Oct 23 2026 source audit: printed as "CONFIRMED").
  const lines = ['STARTING LINEUPS (PROJECTED, FROM A WEB SEARCH; NOT CONFIRMED)'];
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (lineups.away?.length) {
    lines.push(`[AWAY] ${awayTeam}: ${lineups.away.map(p => `${p.name}${p.position ? ` (${p.position})` : ''}`).join(', ')}`);
  }
  
  if (lineups.home?.length) {
    lines.push(`[HOME] ${homeTeam}: ${lineups.home.map(p => `${p.name}${p.position ? ` (${p.position})` : ''}`).join(', ')}`);
  }
  
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}
