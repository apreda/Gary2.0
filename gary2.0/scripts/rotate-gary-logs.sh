#!/bin/bash
# Gary log rotation (Sep 18 2026).
#
# The launchd jobs' StandardOutPath/StandardErrorPath files are append-only and
# were never rotated: insights stdout reached 121MB and live-scores 50MB, with
# July lines sitting in the same file as September ones. That is not just disk
# — it makes every error count untrustworthy, because a grep spans months.
#
# launchd HOLDS AN OPEN FD on these files. Renaming or deleting one leaves the
# job writing to a deleted inode and the visible file stays empty forever, so
# this copies the tail aside and then TRUNCATES IN PLACE, which the held fd
# follows correctly.
set -u
LOG_DIR="$HOME/Library/Logs/Gary2.0"
MAX_BYTES=${GARY_LOG_MAX_BYTES:-20971520}   # 20MB
KEEP_LINES=${GARY_LOG_KEEP_LINES:-20000}    # tail kept in the .1 archive

[ -d "$LOG_DIR" ] || exit 0
rotated=0
while IFS= read -r log; do
  size=$(wc -c < "$log" 2>/dev/null || echo 0)
  [ "$size" -gt "$MAX_BYTES" ] || continue
  tail -n "$KEEP_LINES" "$log" > "$log.1" 2>/dev/null
  : > "$log"
  echo "$(date '+%Y-%m-%dT%H:%M:%S%z') rotated $(basename "$log") ($size bytes -> kept last $KEEP_LINES lines in $(basename "$log").1)"
  rotated=$((rotated+1))
done < <(find "$LOG_DIR" -maxdepth 2 -type f \( -name '*.log' -o -name '*.jsonl' \) ! -name '*.1')
echo "$(date '+%Y-%m-%dT%H:%M:%S%z') rotation complete; $rotated file(s) rotated"
