// Numeric scores and market grading shared by local and Edge game settlement.
export function settlementNumber(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isFinalSettlementStatus(status) {
  const normalized = String(status ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized || /cancel|postpon|suspend|delay|scheduled|in[ _-]?progress|halftime|not[ _-]?final|pending/.test(normalized)) return false;
  return /(?:^|[^a-z])final(?:[^a-z]|$)/.test(normalized)
    || ['post', 'completed', 'finished', 'closed'].includes(normalized);
}

export function gradeGameSpread(pickText, side, homeScore, awayScore) {
  const text = String(pickText ?? '');
  const numeric = text.match(/([+-](?:0|[1-9]\d{0,1})(?:\.\d+)?)(?![\d.])/);
  const pickEm = /\b(?:pk|pick\s*['’]?\s*em)\b/i.test(text);
  if ((!numeric && !pickEm) || !['home', 'away'].includes(side)) return null;
  const spread = numeric ? Number(numeric[1]) : 0;
  const home = settlementNumber(homeScore), away = settlementNumber(awayScore);
  if (home == null || away == null || ![spread, home, away].every(Number.isFinite)) return null;
  const margin = side === 'home' ? home - away : away - home;
  const covered = margin + spread;
  return covered === 0 ? 'push' : covered > 0 ? 'won' : 'lost';
}

export function gradeGameMarket(pickText, side, homeScore, awayScore) {
  if (typeof pickText !== 'string' || !pickText.trim()) return null;
  const home = settlementNumber(homeScore), away = settlementNumber(awayScore);
  if (![home, away].every(value => Number.isSafeInteger(value) && value >= 0)) return null;
  const p = pickText.toLowerCase();
  // These markets need period/team-specific evidence, never a full-game final.
  if (/\b(?:team\s+total|first\s+(?:half|five|5)|second\s+half|1st\s+half|2nd\s+half|f5|1h|2h)\b/.test(p)) return null;
  const total = pickText.match(/\b(over|under)\s+(\d+(?:\.\d+)?)(?![\d.])/i);
  if (total) {
    const line = Number(total[2]), actual = home + away;
    return actual === line ? 'push' : (total[1].toLowerCase() === 'over' ? actual > line : actual < line) ? 'won' : 'lost';
  }
  if (/\b(over|under)\b/.test(p)) return null;
  const isML = /\b(?:ml|moneyline)\b/.test(p);
  if (!isML) {
    const spread = gradeGameSpread(pickText, side, home, away);
    if (spread != null) return spread;
    // An explicit but unreadable spread must not fall through to moneyline.
    if (/[+-](?:\d{1,2})(?:\.|\b)/.test(p) || /\b(?:pk|pick\s*['’]?\s*em)\b/.test(p)) return null;
  }
  if (/\b(draw|tie)\b/.test(p)) return home === away ? 'won' : 'lost';
  if (!['home', 'away'].includes(side)) return null;
  if (home === away) return 'push';
  return (side === 'home' ? home > away : away > home) ? 'won' : 'lost';
}
