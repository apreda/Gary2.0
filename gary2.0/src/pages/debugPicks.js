// Debug helper for picks structure
export function debugPicks() {
  const savedPicks = localStorage.getItem('dailyPicks');
  if (savedPicks) {
    const picks = JSON.parse(savedPicks);
    console.log('DEBUG PICKS STRUCTURE:', picks);
    picks.forEach((pick, index) => {
      console.log(`PICK ${index}:`, {
        id: pick.id,
        league: pick.league,
        game: pick.game,
        betType: pick.betType,
        pick: pick.pick,
        moneyline: pick.moneyline,
        spread: pick.spread,
        overUnder: pick.overUnder,
        time: pick.time,
        analysis: pick.analysis?.substring(0, 50) + '...',
        pickDetail: pick.pickDetail?.substring(0, 50) + '...',
        garysAnalysis: pick.garysAnalysis?.substring(0, 50) + '...'
      });
    });
    return picks;
  }
  return null;
}
