// Default picks to use when Supabase fails
export const DEFAULT_PICKS = [
  {
    id: "pick-1",
    league: "NBA",
    game: "Boston Celtics vs Miami Heat",
    betType: "Spread Pick",
    spread: "Boston Celtics -5.5",
    pick: "Boston Celtics -5.5",
    time: "7:30 PM",
    analysis: "The Celtics have been dominant at home this season with a strong defensive presence.",
    confidenceLevel: 80
  },
  {
    id: "pick-2",
    league: "MLB",
    game: "New York Yankees vs Boston Red Sox",
    betType: "Moneyline Pick",
    moneyline: "New York Yankees",
    moneylineOdds: "-150",
    pick: "New York Yankees ML -150",
    time: "8:00 PM",
    analysis: "Yankees have stronger pitching and batting stats in recent games.",
    confidenceLevel: 75
  },
  {
    id: "pick-3",
    league: "NHL",
    game: "Toronto Maple Leafs vs Montreal Canadiens",
    betType: "Total Pick",
    overUnder: "OVER 5.5",
    pick: "OVER 5.5",
    time: "7:00 PM",
    analysis: "Both teams have been scoring well and have struggled defensively.",
    confidenceLevel: 65
  },
  {
    id: "pick-4",
    league: "PARLAY",
    betType: "Parlay of the Day",
    pick: "PARLAY OF THE DAY",
    parlayOdds: "+420",
    confidenceLevel: 60,
    parlayCard: true,
    parlayLegs: [
      {
        id: "leg-1",
        league: "NBA",
        game: "Denver Nuggets vs Utah Jazz",
        pick: "Denver Nuggets ML -130",
        moneyline: "Denver Nuggets",
        odds: "-130"
      },
      {
        id: "leg-2",
        league: "MLB",
        game: "Los Angeles Dodgers vs San Francisco Giants",
        pick: "Los Angeles Dodgers ML -175",
        moneyline: "Los Angeles Dodgers",
        odds: "-175"
      },
      {
        id: "leg-3",
        league: "NHL",
        game: "Tampa Bay Lightning vs Florida Panthers",
        pick: "Tampa Bay Lightning ML +110",
        moneyline: "Tampa Bay Lightning",
        odds: "+110"
      }
    ],
    analysis: "This parlay combines strong favorites with one underdog value pick for a solid payout potential."
  }
];
