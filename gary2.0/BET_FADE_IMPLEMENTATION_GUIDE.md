# Gary 2.0 Bet/Fade Functionality Implementation Guide

## Overview
This document outlines the complete implementation of the bet/fade functionality for Gary 2.0, allowing users to bet WITH Gary or FADE (bet against) Gary's picks, with automatic result tracking and user record management.

## System Architecture

### 1. Database Tables

#### `user_picks` Table
Stores individual user decisions on Gary's picks:
- `id` - Primary key
- `user_id` - Foreign key to auth.users
- `pick_id` - References the pick from daily_picks table
- `decision` - 'bet' (with Gary) or 'fade' (against Gary)
- `outcome` - 'won', 'lost', 'push', or NULL (pending)
- `created_at` - When the decision was made
- `updated_at` - When the outcome was determined

#### `user_stats` Table
Aggregated user performance statistics:
- `id` - User ID (matches auth.users.id)
- `total_picks` - Total number of picks made
- `win_count` - Number of winning picks
- `loss_count` - Number of losing picks
- `push_count` - Number of push picks
- `ride_count` - Number of times user bet WITH Gary
- `fade_count` - Number of times user bet AGAINST Gary
- `current_streak` - Current win/loss streak (positive = wins, negative = losses)
- `longest_streak` - Longest win streak achieved
- `created_at` / `updated_at` - Timestamps

#### `game_results` Table (existing)
Stores Gary's pick results:
- `pick_id` - References daily_picks
- `result` - 'won', 'lost', or 'push'
- `final_score` - Game final score
- `matchup` - Team matchup
- Other metadata

### 2. Core Services

#### `userPickResultsService.js`
Main service for processing user pick results:

**Key Functions:**
- `processUserPickResults()` - Main processing function
- `updateUserStats()` - Updates user statistics
- `getUserRecord()` - Gets user's current record
- `manualProcessResults()` - Manual trigger for admin

**Logic Flow:**
1. Get all user picks without outcomes (`outcome` is NULL)
2. Get corresponding game results for those picks
3. Calculate user outcomes based on decision + Gary's result:
   - User BET + Gary WON = User WON
   - User BET + Gary LOST = User LOST
   - User FADE + Gary WON = User LOST
   - User FADE + Gary LOST = User WON
   - Any PUSH = User PUSH
4. Update user_picks with outcomes
5. Update user_stats with aggregated results

### 3. User Interface Components

#### Bet/Fade Buttons
Located in `RealGaryPicks.jsx`:
- Two buttons per pick: "Bet" and "Fade"
- Disabled after user makes a decision
- Visual feedback showing user's choice
- Integration with authentication system

#### User Record Display
Added to `Billfold.jsx`:
- Shows user's overall record (W-L-P format)
- Displays win rate percentage
- Shows current streak (positive/negative)
- Only visible when user is logged in

#### Admin Interface
`AdminResultsProcessor.jsx` component in `ResultsAdmin.jsx`:
- Manual trigger for processing results
- Real-time processing status
- Detailed breakdown of processed picks
- Error handling and reporting

## Implementation Details

### 1. User Decision Flow

When a user clicks Bet or Fade:
1. `handleDecisionMade()` in `RealGaryPicks.jsx` is called
2. User authentication is verified
3. Check if user already made a decision on this pick
4. Record decision in `user_picks` table via `userStatsService.recordDecision()`
5. Update local state to show user's choice
6. Display confirmation toast message

### 2. Results Processing Flow

When Gary's pick results are available:
1. Admin triggers processing via `AdminResultsProcessor`
2. `userPickResultsService.processUserPickResults()` runs:
   - Finds all pending user picks
   - Matches them with Gary's results
   - Calculates user outcomes
   - Updates `user_picks.outcome`
   - Updates `user_stats` aggregations
3. User can see updated record on next page load

### 3. Database Schema Updates

Run the SQL script `update_user_stats_table.sql` to ensure proper table structure:
```sql
-- Add missing columns
ALTER TABLE user_stats 
ADD COLUMN IF NOT EXISTS push_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_picks_user_id ON user_picks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_picks_pick_id ON user_picks(pick_id);
CREATE INDEX IF NOT EXISTS idx_user_picks_outcome ON user_picks(outcome);
```

## Usage Instructions

### For Users:
1. Navigate to Gary's Picks page
2. Click "Bet" to bet WITH Gary or "Fade" to bet AGAINST Gary
3. View your record on the Billfold page
4. Track your performance over time

### For Admins:
1. Navigate to `/results-admin`
2. Click on "User Pick Results" tab
3. Click "Process User Pick Results" button
4. Monitor processing status and results
5. Run this after Gary's pick results are updated

## Key Features

### Automatic Outcome Calculation
- Handles all bet types (moneyline, spread, totals)
- Properly processes push results
- Maintains user streaks and statistics

### Real-time Updates
- Immediate feedback when making decisions
- Live processing status in admin interface
- Automatic state management

### Data Integrity
- Prevents duplicate decisions on same pick
- Handles edge cases (missing data, API errors)
- Comprehensive error logging

### User Experience
- Clean, intuitive interface
- Visual feedback for decisions
- Comprehensive record tracking
- Mobile-responsive design

## Testing Scenarios

### Test Case 1: Basic Bet/Fade
1. User bets WITH Gary on a pick
2. Gary's pick wins
3. User should get a WIN in their record

### Test Case 2: Fade Scenario
1. User fades (bets AGAINST) Gary
2. Gary's pick loses
3. User should get a WIN in their record

### Test Case 3: Push Handling
1. User makes any decision
2. Gary's pick results in a push
3. User should get a PUSH in their record

### Test Case 4: Streak Tracking
1. User makes multiple winning decisions
2. Current streak should increment positively
3. One loss should reset/reverse the streak

## Troubleshooting

### Common Issues:
1. **User decisions not saving**: Check authentication and database permissions
2. **Results not processing**: Verify game_results table has data with proper pick_ids
3. **Record not updating**: Ensure user_stats table exists with proper schema
4. **Admin interface errors**: Check console for API errors and database connectivity

### Debug Steps:
1. Check browser console for JavaScript errors
2. Verify Supabase table structures match schema
3. Test admin processing with known data
4. Check user authentication status

## Future Enhancements

### Potential Additions:
1. **Leaderboards**: Rank users by win rate or streak
2. **Betting Units**: Track monetary units instead of just wins/losses
3. **Historical Analysis**: Detailed performance analytics
4. **Social Features**: Share records, follow other users
5. **Automated Processing**: Trigger results processing automatically when Gary's results are updated

## Security Considerations

### Row Level Security (RLS):
- Users can only see/modify their own picks
- Admin functions require proper authentication
- Sensitive operations logged for audit

### Data Validation:
- Input sanitization on all user inputs
- Proper type checking for database operations
- Error handling for edge cases

This implementation provides a complete, production-ready bet/fade system that enhances user engagement while maintaining data integrity and providing comprehensive tracking capabilities. 