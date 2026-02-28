#!/bin/bash
set -e
LOG_DIR="logs/picks-20260226"
mkdir -p "$LOG_DIR"
DELAY=30

echo "═══════════════════════════════════════════════════════════"
echo "🐻 GARY PICK LAUNCHER — $(date +%Y-%m-%d)"
echo "═══════════════════════════════════════════════════════════"

launch() {
  local SPORT_FLAG="$1"
  local SPORT_NAME="$2"
  local TEAM="$3"
  local NUM="$4"
  local SAFE=$(echo "$TEAM" | tr ' ' '_' | tr -cd 'A-Za-z0-9_')
  local LOG_FILE="$LOG_DIR/${SPORT_NAME}-${SAFE}.log"
  echo "  [$NUM] $TEAM ($SPORT_NAME) → $LOG_FILE"
  node scripts/run-agentic-picks.js "$SPORT_FLAG" --matchup "$TEAM" --limit=1 > "$LOG_FILE" 2>&1 &
}

N=0

echo "══════ NBA (10 games) ══════"
launch --nba NBA "Indiana Pacers" $((++N)); sleep $DELAY
launch --nba NBA "Philadelphia 76ers" $((++N)); sleep $DELAY
launch --nba NBA "Atlanta Hawks" $((++N)); sleep $DELAY
launch --nba NBA "Brooklyn Nets" $((++N)); sleep $DELAY
launch --nba NBA "Orlando Magic" $((++N)); sleep $DELAY
launch --nba NBA "Chicago Bulls" $((++N)); sleep $DELAY
launch --nba NBA "Dallas Mavericks" $((++N)); sleep $DELAY
launch --nba NBA "Phoenix Suns" $((++N)); sleep $DELAY
launch --nba NBA "Utah Jazz" $((++N)); sleep $DELAY
launch --nba NBA "LA Clippers" $((++N))
echo "✅ NBA: 10 games launched"
sleep $DELAY

echo "══════ NHL (15 games) ══════"
launch --nhl NHL "Boston Bruins" $((++N)); sleep $DELAY
launch --nhl NHL "Canadiens" $((++N)); sleep $DELAY
launch --nhl NHL "Ottawa Senators" $((++N)); sleep $DELAY
launch --nhl NHL "Florida Panthers" $((++N)); sleep $DELAY
launch --nhl NHL "Pittsburgh Penguins" $((++N)); sleep $DELAY
launch --nhl NHL "Carolina Hurricanes" $((++N)); sleep $DELAY
launch --nhl NHL "New York Rangers" $((++N)); sleep $DELAY
launch --nhl NHL "St. Louis Blues" $((++N)); sleep $DELAY
launch --nhl NHL "Nashville Predators" $((++N)); sleep $DELAY
launch --nhl NHL "Colorado Avalanche" $((++N)); sleep $DELAY
launch --nhl NHL "San Jose Sharks" $((++N)); sleep $DELAY
launch --nhl NHL "Los Angeles Kings" $((++N)); sleep $DELAY
launch --nhl NHL "Washington Capitals" $((++N)); sleep $DELAY
launch --nhl NHL "Anaheim Ducks" $((++N)); sleep $DELAY
launch --nhl NHL "Winnipeg Jets" $((++N))
echo "✅ NHL: 15 games launched"
sleep $DELAY

echo "══════ NCAAB (20 games) ══════"
launch --ncaab NCAAB "Alabama Crimson Tide" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Gonzaga Bulldogs" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Creighton Bluejays" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Oregon Ducks" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Texas Longhorns" $((++N)); sleep $DELAY
launch --ncaab NCAAB "UConn Huskies" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Arkansas Razorbacks" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Providence Friars" $((++N)); sleep $DELAY
launch --ncaab NCAAB "East Tennessee State" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Northern Iowa" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Colgate" $((++N)); sleep $DELAY
launch --ncaab NCAAB "American University" $((++N)); sleep $DELAY
launch --ncaab NCAAB "St. Bonaventure" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Saint Joseph" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Duquesne" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Charlotte 49ers" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Nebraska" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Boston University" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Villanova" $((++N)); sleep $DELAY
launch --ncaab NCAAB "Loyola Maryland" $((++N))
echo "✅ NCAAB: 20 games launched"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "🐻 All $N games launched!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Waiting for all to complete..."
wait
echo "✅ All games complete!"
