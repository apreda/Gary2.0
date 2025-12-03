#!/bin/bash

# ============================================
# Gary 2.0 - Daily Picks Generator
# ============================================
# Usage: ./scripts/run-picks.sh [options]
#
# Options:
#   --nba       Run NBA picks only
#   --nfl       Run NFL picks only
#   --ncaab     Run NCAAB picks only
#   --ncaaf     Run NCAAF picks only
#   --all       Run all sports (default)
#   --continue  Keep chaining through all games (loops until done)
#   --status    Check current picks status
#
# Examples:
#   ./scripts/run-picks.sh              # Run first game of each sport
#   ./scripts/run-picks.sh --nba        # Run NBA only
#   ./scripts/run-picks.sh --all --continue  # Run all sports, all games
# ============================================

BASE_URL="https://betwithgary.com/api/run-daily-picks"
SPORTS=()
CONTINUE_MODE=false
STATUS_MODE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --nba)
      SPORTS+=("basketball_nba")
      shift
      ;;
    --nfl)
      SPORTS+=("americanfootball_nfl")
      shift
      ;;
    --ncaab)
      SPORTS+=("basketball_ncaab")
      shift
      ;;
    --ncaaf)
      SPORTS+=("americanfootball_ncaaf")
      shift
      ;;
    --all)
      SPORTS=("basketball_nba" "americanfootball_nfl" "basketball_ncaab" "americanfootball_ncaaf")
      shift
      ;;
    --continue)
      CONTINUE_MODE=true
      shift
      ;;
    --status)
      STATUS_MODE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Default to all sports if none specified
if [ ${#SPORTS[@]} -eq 0 ]; then
  SPORTS=("basketball_nba" "americanfootball_nfl" "basketball_ncaab" "americanfootball_ncaaf")
fi

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🐻 GARY 2.0 PICKS GENERATOR 🐻       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# Function to get friendly sport name
get_sport_name() {
  case $1 in
    basketball_nba) echo "🏀 NBA" ;;
    americanfootball_nfl) echo "🏈 NFL" ;;
    basketball_ncaab) echo "🏀 NCAAB" ;;
    americanfootball_ncaaf) echo "🏈 NCAAF" ;;
    *) echo "$1" ;;
  esac
}

# Function to run picks for a sport
run_sport() {
  local sport=$1
  local cursor=${2:-0}
  local sport_name=$(get_sport_name $sport)
  
  echo -e "${YELLOW}▶ Running ${sport_name} (cursor: ${cursor})...${NC}"
  
  response=$(curl -L -s "${BASE_URL}?sport=${sport}&cursor=${cursor}")
  
  # Parse response
  success=$(echo $response | grep -o '"success":true' | head -1)
  generated=$(echo $response | grep -o '"generatedCount":[0-9]*' | head -1 | cut -d':' -f2)
  next_cursor=$(echo $response | grep -o '"nextCursor":[0-9]*' | head -1 | cut -d':' -f2)
  duration=$(echo $response | grep -o '"durationMs":[0-9]*' | head -1 | cut -d':' -f2)
  
  if [ -n "$success" ]; then
    duration_sec=$((duration / 1000))
    echo -e "${GREEN}  ✓ Generated: ${generated} pick(s) in ${duration_sec}s${NC}"
    
    if [ "$CONTINUE_MODE" = true ] && [ -n "$next_cursor" ] && [ "$generated" != "0" ]; then
      echo -e "${BLUE}  → Continuing to next game...${NC}"
      run_sport $sport $next_cursor
    elif [ "$generated" = "0" ]; then
      echo -e "${GREEN}  ✓ ${sport_name} complete - no more games${NC}"
    fi
  else
    echo -e "${RED}  ✗ Error: ${response}${NC}"
  fi
  
  echo ""
}

# Main execution
echo -e "${BLUE}Sports to process: ${#SPORTS[@]}${NC}"
echo -e "${BLUE}Continue mode: ${CONTINUE_MODE}${NC}"
echo ""

start_time=$(date +%s)

for sport in "${SPORTS[@]}"; do
  run_sport $sport 0
done

end_time=$(date +%s)
total_time=$((end_time - start_time))

echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ All picks triggered! Total time: ${total_time}s${NC}"
echo ""
echo -e "${YELLOW}📊 View logs at: https://vercel.com/dashboard${NC}"
echo -e "${YELLOW}   → Select project → Functions → View Logs${NC}"
echo ""

