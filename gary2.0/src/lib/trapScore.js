export function trapScore(t) {
  const w = {
    marketOppSteam: 28,
    newsRisk: 22,
    outlierBooksOnly: 16,
    scheduleSpotBad: 14,
    lowLimitsAtBest: 12,
    publicVsHandleSkew: 8
  };
  let s = 0;
  s += w.marketOppSteam * (t?.marketOppSteam || 0);
  s += w.newsRisk * (t?.newsRisk || 0);
  s += w.scheduleSpotBad * (t?.scheduleSpotBad || 0);
  s += w.publicVsHandleSkew * (t?.publicVsHandleSkew || 0);
  if (t?.outlierBooksOnly) s += w.outlierBooksOnly;
  if (t?.lowLimitsAtBest)  s += w.lowLimitsAtBest;
  return Math.min(100, Math.round(s));
}


