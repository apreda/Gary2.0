#!/bin/bash
# Gary 2.0 Daily Results Runner
# This script is called by launchd/cron at 6:45am EST daily

# Set up logging
LOG_DIR="/Users/adam.preda/Desktop/Gary2.0/gary2.0/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/daily-results-$(date +%Y-%m-%d).log"

# Load NVM and set up Node
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Navigate to project directory
cd /Users/adam.preda/Desktop/Gary2.0/gary2.0

# Run the daily results script
echo "=== Gary 2.0 Daily Results ===" >> "$LOG_FILE"
echo "Started at: $(date)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

node scripts/run-daily-results.js >> "$LOG_FILE" 2>&1

echo "" >> "$LOG_FILE"
echo "Completed at: $(date)" >> "$LOG_FILE"
echo "================================" >> "$LOG_FILE"
