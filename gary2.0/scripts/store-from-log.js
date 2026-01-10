#!/usr/bin/env node
/**
 * Emergency script to extract picks from log file and store directly to Supabase
 * Used when analysis completes but storage fails
 */

// MUST load env vars FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env first, then .env.local (later values override)
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

// Now import modules that depend on env vars
const { picksService } = await import('../src/services/picksService.js');

const LOG_FILE = '/tmp/ncaab-final-run.log';

// Manual picks array based on log review
// Format: home_team is always listed second in "Away @ Home" matchup format
const MANUAL_PICKS = [
  {
    team: "Butler Bulldogs",
    home_team: "Butler Bulldogs",
    away_team: "St. John's Red Storm",
    opponent: "St. John's Red Storm",
    pick_type: "spread",
    line_value: 4.5,
    line_odds: 100,
    is_underdog: true,
    is_star: true,
    sport: "basketball_ncaab",
    rationale: "Hinkle Fieldhouse is one of those places where logic often goes to die. Michael Ajayi is a double-double machine who leads the nation in rebounding against St. John's abysmal defensive boards (310th nationally). Butler ranks 16th in offensive rebounding - second chance points will be the equalizer."
  },
  {
    team: "Tennessee Volunteers",
    home_team: "Tennessee Volunteers",
    away_team: "Texas Longhorns",
    opponent: "Texas Longhorns",
    pick_type: "spread",
    line_value: -10.5,
    line_odds: -108,
    is_underdog: false,
    is_star: false,
    sport: "basketball_ncaab",
    rationale: "Rick Barnes hosting his former program in Knoxville. Tennessee has the third-best defensive efficiency in the country and the best offensive rebounding team. Texas is 1-4 in Quad 1 and 2 games. Vols pull away second half."
  },
  {
    team: "Florida Gators",
    home_team: "Florida Gators",
    away_team: "Georgia Bulldogs",
    opponent: "Georgia Bulldogs",
    pick_type: "spread",
    line_value: -9.5,
    line_odds: -115,
    is_underdog: false,
    is_star: false,
    sport: "basketball_ncaab",
    rationale: "Georgia's #18 ranking is a mirage - bottom SOS. Florida is the best rebounding team in the country. Mike White is 1-6 against Todd Golden for a reason. The O-Dome is difficult for visitors."
  },
  {
    team: "Duke Blue Devils",
    home_team: "Louisville Cardinals",
    away_team: "Duke Blue Devils",
    opponent: "Louisville Cardinals",
    pick_type: "moneyline",
    line_value: 0,
    line_odds: -108,
    is_underdog: false,
    is_star: false,
    sport: "basketball_ncaab",
    rationale: "Cameron Boozer is the best player in the country and Louisville's interior defense is their glaring weakness. Without Mikel Brown Jr., Louisville's offense has looked disjointed. Duke holds opponents to very low percentage from deep."
  },
  {
    team: "Texas Tech Red Raiders",
    home_team: "Houston Cougars",
    away_team: "Texas Tech Red Raiders",
    opponent: "Houston Cougars",
    pick_type: "spread",
    line_value: 6.5,
    line_odds: -118,
    is_underdog: true,
    is_star: false,
    sport: "basketball_ncaab",
    rationale: "Two teams in bottom ten for tempo - every possession is high stakes. 6.5 points is wide for a low-possession game. JT Toppin is All-American who can score from all levels. Emanuel Sharp 0-for-9 last game."
  },
  {
    team: "Wisconsin Badgers",
    home_team: "Wisconsin Badgers",
    away_team: "UCLA Bruins",
    opponent: "UCLA Bruins",
    pick_type: "spread",
    line_value: -3.5,
    line_odds: -108,
    is_underdog: false,
    is_star: false,
    sport: "basketball_ncaab",
    rationale: "Kohl Center is house of horrors for visitors. UCLA is 1-4 away from home. Skyy Clark hamstring injury 3 days ago is huge - primary defender and floor spacer. Nolan Winter is a 7-foot matchup nightmare."
  },
  {
    team: "TCU Horned Frogs",
    home_team: "Kansas Jayhawks",
    away_team: "TCU Horned Frogs",
    opponent: "Kansas Jayhawks",
    pick_type: "spread",
    line_value: 7.5,
    line_odds: -108,
    is_underdog: true,
    is_star: false,
    sport: "basketball_ncaab",
    rationale: "Devil's Advocate flip! Kansas's recent losses expose vulnerability - they've dropped 2 of last 3. TCU's three-guard lineup creates mismatches Kansas struggles with. Jamie Dixon's team matches up better than the spread suggests."
  },
  {
    team: "Texas A&M Aggies",
    home_team: "Auburn Tigers",
    away_team: "Texas A&M Aggies",
    opponent: "Auburn Tigers",
    pick_type: "spread",
    line_value: 6.5,
    line_odds: -112,
    is_underdog: true,
    is_star: false,
    sport: "basketball_ncaab",
    rationale: "Auburn coming off ugly loss to Georgia - emotional letdown spot. A&M's Zhuric Phelps can go shot-for-shot with anyone. Wade Taylor IV is a difference maker. Aggies keep it close in hostile environment."
  },
  {
    team: "West Virginia Mountaineers",
    home_team: "West Virginia Mountaineers",
    away_team: "Cincinnati Bearcats",
    opponent: "Cincinnati Bearcats",
    pick_type: "moneyline",
    line_value: 0,
    line_odds: -120,
    is_underdog: false,
    is_star: false,
    sport: "basketball_ncaab",
    rationale: "WVU's press-Virginia defense is perfect antidote for Cincinnati's turnover-prone attack. Sencire Harris leads potent backcourt. The Coliseum is rocking. Bearcats don't have the guard play to handle pressure."
  },
  {
    team: "Syracuse Orange",
    home_team: "Georgia Tech Yellow Jackets",
    away_team: "Syracuse Orange",
    opponent: "Georgia Tech Yellow Jackets",
    pick_type: "spread",
    line_value: -2.5,
    line_odds: -106,
    is_underdog: false,
    is_star: false,
    sport: "basketball_ncaab",
    rationale: "Syracuse's zone disrupts Georgia Tech's offensive flow. Orange have more weapons with Elijah Moore and Chris Bell. Tech's home court advantage is minimal against experienced ACC teams."
  },
  {
    team: "South Carolina Gamecocks",
    home_team: "LSU Tigers",
    away_team: "South Carolina Gamecocks",
    opponent: "LSU Tigers",
    pick_type: "spread",
    line_value: 7.5,
    line_odds: -110,
    is_underdog: true,
    is_star: false,
    sport: "basketball_ncaab",
    rationale: "South Carolina's defense travels well. LSU has been inconsistent all season. The Gamecocks have the personnel to slow down LSU's transition attack. 7.5 is too many points."
  },
  {
    team: "Iowa Hawkeyes",
    home_team: "Minnesota Golden Gophers",
    away_team: "Iowa Hawkeyes",
    opponent: "Minnesota Golden Gophers",
    pick_type: "spread",
    line_value: -5.5,
    line_odds: -102,
    is_underdog: false,
    is_star: false,
    sport: "basketball_ncaab",
    rationale: "The Drake Derby - Ben McCollum brought his championship system from Drake to Iowa. Hawkeyes have top 20 defense (#17 KenPom). Minnesota down to 8 scholarship players after injuries. Iowa will suck air out of The Barn with crawling tempo."
  },
  {
    team: "Georgetown Hoyas",
    home_team: "DePaul Blue Demons",
    away_team: "Georgetown Hoyas",
    opponent: "DePaul Blue Demons",
    pick_type: "moneyline",
    line_value: 0,
    line_odds: 124,
    is_underdog: true,
    is_star: false,
    sport: "basketball_ncaab",
    rationale: "Georgetown's Ed Cooley brings physical Big East defense. KJ Lewis averaging 15.2 PPG is the best player on the floor. DePaul's reliance on three-point volume is high variance. Value on underdog ML."
  },
  {
    team: "Boston College Eagles",
    home_team: "SMU Mustangs",
    away_team: "Boston College Eagles",
    opponent: "SMU Mustangs",
    pick_type: "spread",
    line_value: 11.5,
    line_odds: -102,
    is_underdog: true,
    is_star: false,
    sport: "basketball_ncaab",
    rationale: "BC's Chad Venning provides interior presence SMU will struggle with. Eagles play disciplined half-court offense. 11.5 is too many points for an ACC road game where BC has nothing to lose."
  }
];

async function main() {
  console.log('📂 Reading log file...');
  
  try {
    // Read log file
    const logContent = fs.readFileSync(LOG_FILE, 'utf8');
    console.log(`📄 Log file loaded (${logContent.length} chars)`);
    
    // Format picks for storage
    // IMPORTANT: Use field names that match picksService expectations:
    // - homeTeam/awayTeam (camelCase) not home_team/away_team
    // - league not sport
    const picksForStorage = MANUAL_PICKS.map((pick, idx) => ({
      team: pick.team,
      opponent: pick.opponent,
      homeTeam: pick.home_team,
      awayTeam: pick.away_team,
      pick: pick.team,
      type: pick.pick_type,
      odds: pick.line_odds,
      league: 'NCAAB',
      is_underdog: pick.is_underdog,
      is_star: pick.is_star,
      sport: pick.sport,
      rationale: pick.rationale,
      game_date: new Date().toISOString().split('T')[0],
      game_id: `ncaab_manual_${idx}_${Date.now()}`,
      units: pick.is_star ? 2 : 1
    }));
    
    console.log(`\n📊 Storing ${picksForStorage.length} picks to Supabase...`);
    console.log('Picks:', picksForStorage.map(p => `${p.team} (${p.pick_type})`).join(', '));
    
    // Store picks
    const result = await picksService.storeDailyPicksInDatabase(picksForStorage);
    
    if (result.success) {
      console.log('\n✅ Successfully stored picks to Supabase!');
      console.log(result.message);
    } else {
      console.error('\n❌ Failed to store picks:', result.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().then(() => {
  console.log('\n🎉 Done!');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
