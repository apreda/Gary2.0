const gradeGame = (pickText, homeTeam, awayTeam, hScore, vScore) => {
  const pickLower = pickText.toLowerCase();
  const hFull = homeTeam.toLowerCase(), vFull = awayTeam.toLowerCase();
  const hMascot = hFull.split(' ').pop(), vMascot = vFull.split(' ').pop();
  
  // Moneyline
  const isHomePick = pickLower.includes(hMascot) || pickLower.includes(hFull);
  const isVisitorPick = pickLower.includes(vMascot) || pickLower.includes(vFull);
  
  if (isHomePick && !isVisitorPick) return (hScore > vScore) ? 'won' : 'lost';
  if (isVisitorPick && !isHomePick) return (vScore > hScore) ? 'won' : 'lost';
  
  return 'lost';
};

console.log(gradeGame("Pittsburgh Steelers ML +130", "Pittsburgh Steelers", "Houston Texans", 6, 30));
