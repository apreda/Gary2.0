import "dotenv/config";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const API_KEY = process.env.BALLDONTLIE_API_KEY;

const BOOK_DISPLAY_NAMES = {
  draftkings: 'DraftKings',
  fanduel: 'FanDuel',
  caesars: 'Caesars',
  betmgm: 'BetMGM',
  betrivers: 'BetRivers',
  bet365: 'Bet365',
  betway: 'Betway',
  ballybet: 'Bally Bet',
  betparx: 'BetParx',
  rebet: 'Rebet',
  polymarket: 'Polymarket',
  kalshi: 'Kalshi'
};

const PREFERRED_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'bet365', 'betrivers'];

function formatOdds(val) {
  if (val === null || val === undefined) return null;
  const num = parseFloat(val);
  if (isNaN(num)) return null;
  return num > 0 ? `+${num}` : `${num}`;
}

(async () => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  console.log(`Working with date: ${today}`);

  // 1. Get NBA games from BDL
  console.log("\n1. Fetching NBA games from BDL...");
  const gamesUrl = `https://api.balldontlie.io/v1/games?dates[]=${today}&per_page=100`;
  const gamesResp = await axios.get(gamesUrl, { headers: { Authorization: API_KEY } });
  const games = gamesResp.data?.data || [];
  console.log(`   Found ${games.length} NBA games`);

  // Build game ID -> team mapping
  const gameMap = {};
  for (const g of games) {
    gameMap[g.id] = {
      id: g.id,
      home: g.home_team?.full_name,
      away: g.visitor_team?.full_name
    };
    console.log(`   ${g.id}: ${g.visitor_team?.full_name} @ ${g.home_team?.full_name}`);
  }

  // 2. Fetch odds from BDL v2
  console.log("\n2. Fetching odds from BDL v2...");
  const gameIds = Object.keys(gameMap);
  const oddsUrl = `https://api.balldontlie.io/v2/odds?${gameIds.map(id => `game_ids[]=${id}`).join('&')}&per_page=100`;

  let oddsData = [];
  try {
    const oddsResp = await axios.get(oddsUrl, { headers: { Authorization: API_KEY } });
    oddsData = oddsResp.data?.data || [];
    console.log(`   Got ${oddsData.length} odds rows`);
  } catch (e) {
    console.log(`   Odds API error: ${e.response?.data?.errors?.[0]?.error || e.message}`);
    console.log(`   Will try alternative approach...`);
  }

  // Group odds by game
  const oddsByGame = {};
  for (const o of oddsData) {
    const gid = o.game_id;
    if (!oddsByGame[gid]) oddsByGame[gid] = [];
    oddsByGame[gid].push({
      vendor: (o.vendor || '').toLowerCase(),
      spread_home: o.spread_home_value,
      spread_home_odds: o.spread_home_odds,
      spread_away: o.spread_away_value,
      spread_away_odds: o.spread_away_odds,
      ml_home: o.moneyline_home_odds,
      ml_away: o.moneyline_away_odds
    });
  }

  console.log("\n   Odds by game:");
  for (const [gid, vendors] of Object.entries(oddsByGame)) {
    const game = gameMap[gid];
    console.log(`   ${game?.away} @ ${game?.home}: ${vendors.length} sportsbooks`);
  }

  // 3. Get current picks from Supabase
  console.log("\n3. Fetching picks from Supabase...");
  const { data, error } = await supabase
    .from("daily_picks")
    .select("*")
    .eq("date", today);

  if (error || !data?.length) {
    console.error("   Error fetching picks:", error?.message || "No data");
    return;
  }

  const rowId = data[0].id;
  const picks = data[0].picks || [];
  const nbaPicks = picks.filter(p => p.sport === "basketball_nba");
  console.log(`   Found ${nbaPicks.length} NBA picks`);

  // 4. Match and update picks
  console.log("\n4. Matching odds to picks...");
  const updatedPicks = picks.map(p => {
    if (p.sport !== "basketball_nba") return p;

    // Find matching game
    const homeLower = (p.homeTeam || '').toLowerCase();
    const matchingGameId = Object.keys(gameMap).find(gid => {
      const g = gameMap[gid];
      return g.home.toLowerCase().includes(homeLower.split(' ').pop()) ||
             homeLower.includes(g.home.toLowerCase().split(' ').pop());
    });

    if (!matchingGameId) {
      console.log(`   ❌ No game match for ${p.awayTeam} @ ${p.homeTeam}`);
      return p;
    }

    const gameOdds = oddsByGame[matchingGameId];
    if (!gameOdds || gameOdds.length === 0) {
      console.log(`   ❌ No odds for ${p.awayTeam} @ ${p.homeTeam} (game ${matchingGameId})`);
      return p;
    }

    // Determine if pick is home or away
    const pickTeam = p.pick.split(/\s+[+-]/)[0].trim().toLowerCase();
    const isHomePick = pickTeam.includes(homeLower.split(' ').pop()) ||
                       homeLower.includes(pickTeam.split(' ').pop());

    // Sort by preferred books
    const sortedOdds = [...gameOdds].sort((a, b) => {
      const aIdx = PREFERRED_BOOKS.indexOf(a.vendor);
      const bIdx = PREFERRED_BOOKS.indexOf(b.vendor);
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
      return a.vendor.localeCompare(b.vendor);
    });

    // Format for storage - SPREAD MUST BE A NUMBER for iOS parsing
    const sportsbookOdds = sortedOdds.slice(0, 8).map(o => {
      const rawSpread = isHomePick ? o.spread_home : o.spread_away;
      const spreadNum = typeof rawSpread === 'number' ? rawSpread : parseFloat(rawSpread);
      return {
        book: BOOK_DISPLAY_NAMES[o.vendor] || o.vendor.charAt(0).toUpperCase() + o.vendor.slice(1),
        spread: isNaN(spreadNum) ? null : spreadNum, // NUMBER, not string
        spread_odds: formatOdds(isHomePick ? o.spread_home_odds : o.spread_away_odds),
        ml: formatOdds(isHomePick ? o.ml_home : o.ml_away)
      };
    });

    console.log(`   ✅ ${p.awayTeam} @ ${p.homeTeam} - ${sportsbookOdds.length} books (isHomePick=${isHomePick})`);
    return { ...p, sportsbook_odds: sportsbookOdds };
  });

  // 5. Update Supabase
  console.log("\n5. Updating Supabase...");
  const { error: updateError } = await supabase
    .from("daily_picks")
    .update({ picks: updatedPicks })
    .eq("id", rowId);

  if (updateError) {
    console.error("   Update error:", updateError.message);
  } else {
    console.log("   ✅ Successfully updated!");

    // Verify
    console.log("\n6. Verification:");
    const nba = updatedPicks.filter(p => p.sport === "basketball_nba");
    nba.forEach(p => {
      console.log(`\n   ${p.awayTeam} @ ${p.homeTeam}`);
      console.log(`   pick: ${p.pick}`);
      console.log(`   sportsbook_odds: ${p.sportsbook_odds?.length || 0} books`);
      if (p.sportsbook_odds && p.sportsbook_odds.length > 0) {
        console.log(`   Sample: ${p.sportsbook_odds[0].book} spread=${p.sportsbook_odds[0].spread} (${typeof p.sportsbook_odds[0].spread})`);
      }
    });
  }
})();
