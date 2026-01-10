# NCAAB Game Logs Bug Fix

## Issue Identified
**Date:** January 7, 2026

### The Bug
Gary was incorrectly calling **NBA game logs endpoint** for **NCAAB players** during the agentic pick generation process.

**Log Evidence:**
```
→ [PLAYER_GAME_LOGS] Lamar Wilkerson (NCAAB) [Ball Don't Lie] Fetching fresh data for nba_game_logs_555_5
```

### The Consequence
- BallDon'tLie would return `null` or stats for a completely different NBA player with the same ID
- Gary's player analysis would show "Player Stats: 0" in the Investigation Audit
- Gary would make picks without proper player context

---

## Root Cause

### 1. Missing NCAAB-Specific Function
There was no `getNcaabPlayerGameLogs()` function in `ballDontLieService.js`. Only NBA, NHL, and NFL had dedicated game log functions.

### 2. Incorrect Sport Mapping
In `agenticOrchestrator.js` (line 2544-2545):
```javascript
// WRONG - lumped NCAAB with NBA
if (args.sport === 'NBA' || args.sport === 'NCAAB') {
  logs = await ballDontLieService.getNbaPlayerGameLogs(player.id, numGames);
}
```

### 3. Overly Broad isNBA Check
In `propsAgenticRunner.js` (line 410):
```javascript
// WRONG - treated all basketball as NBA
const isNBA = sportLabel === 'NBA' || sportLabel === 'NCAAB' || sportKey?.includes('basketball');
```

---

## The Fix

### 1. Created `getNcaabPlayerGameLogs()` Function
**File:** `gary2.0/src/services/ballDontLieService.js`

- Uses correct NCAAB endpoint: `/ncaab/v1/player_stats`
- Properly handles NCAAB season logic (Nov-Apr, year+1 for season)
- 60-day lookback window (college schedules differ from NBA)
- Returns same enhanced structure as NBA logs (consistency, splits, trends)

### 2. Fixed `agenticOrchestrator.js`
**File:** `gary2.0/src/services/agentic/agenticOrchestrator.js` (line 2543-2555)

```javascript
// FIXED - separate handling for NBA vs NCAAB
let logs;
if (args.sport === 'NBA') {
  logs = await ballDontLieService.getNbaPlayerGameLogs(player.id, numGames);
} else if (args.sport === 'NCAAB') {
  logs = await ballDontLieService.getNcaabPlayerGameLogs(player.id, numGames);
} else if (args.sport === 'NHL') {
  logs = await ballDontLieService.getNhlPlayerGameLogs(player.id, numGames);
} else {
  // NFL / NCAAF
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  const season = month >= 8 ? year : year - 1;
  const allLogs = await ballDontLieService.getNflPlayerGameLogsBatch([player.id], season, numGames);
  logs = allLogs[player.id];
}
```

### 3. Fixed `propsAgenticRunner.js`
**File:** `gary2.0/src/services/agentic/propsAgenticRunner.js` (line 409-487)

```javascript
// FIXED - separate flags for NBA and NCAAB
const isNBA = sportLabel === 'NBA' || sportKey === 'basketball_nba';
const isNCAAB = sportLabel === 'NCAAB' || sportKey === 'basketball_ncaab';
const isNHL = sportLabel === 'NHL' || sportKey?.includes('hockey');
const isNFL = sportLabel === 'NFL' || sportLabel === 'NCAAF' || sportKey?.includes('football');

// NBA-specific game logs
if (isNBA) {
  const logs = await ballDontLieService.getNbaPlayerGameLogs(player.id, 5);
  // ...
}

// NCAAB-specific game logs
if (isNCAAB) {
  const logs = await ballDontLieService.getNcaabPlayerGameLogs(player.id, 5);
  // ...
}
```

---

## Verification

✅ No linter errors introduced
✅ Function signature matches NBA/NHL patterns
✅ Correct endpoint mapping verified
✅ Sport-specific handling isolated

---

## Impact

### Before Fix
- Gary would silently fail to get NCAAB player stats
- Investigation audit would show "Player Stats: 0"
- Picks generated without key player context

### After Fix
- Gary correctly fetches NCAAB player game logs from the right endpoint
- Player analysis includes last 5-10 games, averages, consistency, splits
- Picks are informed by actual NCAAB player performance data

---

## Related Files Changed
1. `gary2.0/src/services/ballDontLieService.js` - Added `getNcaabPlayerGameLogs()`
2. `gary2.0/src/services/agentic/agenticOrchestrator.js` - Fixed sport routing
3. `gary2.0/src/services/agentic/propsAgenticRunner.js` - Fixed sport detection

---

**Status:** ✅ FIXED and ready for re-run

