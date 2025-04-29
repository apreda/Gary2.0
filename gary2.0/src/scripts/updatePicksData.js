/**
 * Script to update Supabase with properly formatted pick data
 * 
 * NOTE: This script is maintained for backward compatibility and testing.
 * The updated Gary 2.0 system now uses picksService.js to preserve the exact OpenAI output format.
 */
import { supabase, ensureAnonymousSession } from '../supabaseClient.js';

// Format the pick data according to the new OpenAI output format requirements
const formatPicksData = () => {
  // Updated picks data matching the exact OpenAI output format
  const picksData = [
    {
      "id": "pick-1745329824567-n4ey3va",
      "pick": "Los Angeles Lakers -3.5 -110",
      "type": "spread",
      "confidence": 0.75,
      "trapAlert": false,
      "revenge": false,
      "superstition": false,
      "momentum": 0.68,
      "homeTeam": "Los Angeles Lakers",
      "awayTeam": "Minnesota Timberwolves",
      "league": "NBA", // Direct league name without transformation
      "time": "10:00 PM ET", // Exact time format
      "rationale": "Lakers have dominated at home recently, covering in 7 of their last 10 home games. Minnesota struggles on the road as an underdog, going 2-6 ATS in their last 8 road games. Lakers' size advantage in the paint should be decisive."
    },
    {
      "id": "pick-1745329834507-eisdljv",
      "pick": "Minnesota Twins -145",
      "type": "moneyline",
      "confidence": 0.82,
      "trapAlert": false,
      "revenge": true,
      "superstition": false,
      "momentum": 0.75,
      "homeTeam": "Minnesota Twins",
      "awayTeam": "Chicago White Sox",
      "league": "MLB", // Direct league name without transformation
      "time": "7:40 PM ET", // Exact time format
      "rationale": "Minnesota has dominated this matchup, winning 7 of the last 8 against Chicago. The Twins' starting pitcher has exceptional home splits with a 2.15 ERA at Target Field. Chicago's road woes continue with a 4-12 record in their last 16 road games."
    },
    {
      "id": "pick-1745329843802-e217gga",
      "pick": "Washington Capitals -1.5 +155",
      "type": "puckline",
      "confidence": 0.65,
      "trapAlert": false,
      "revenge": false,
      "superstition": true,
      "momentum": 0.62,
      "homeTeam": "Washington Capitals",
      "awayTeam": "Montréal Canadiens",
      "league": "NHL", // Direct league name without transformation
      "time": "7:10 PM ET", // Exact time format
      "rationale": "Capitals have won 6 of their last 7 home games by multiple goals. Montreal struggles defensively on the road, allowing 3.8 goals per game in their last 10 road contests. Washington's power play at home ranks in the top 5 in the league."
    },
    {
      "id": "pick-1745329849610-isg73m3",
      "pick": "Manchester City -1.5 -110",
      "type": "spread",
      "confidence": 0.78,
      "trapAlert": false,
      "revenge": false,
      "superstition": false,
      "momentum": 0.81,
      "homeTeam": "Manchester City",
      "awayTeam": "Aston Villa",
      "league": "EPL", // Direct league name without transformation
      "time": "3:00 PM ET", // Exact time format
      "rationale": "Manchester City has been dominant at the Etihad Stadium, winning their last 8 home matches by an average margin of 2.3 goals. Aston Villa has struggled against top-tier opposition, losing by multiple goals in 5 of their last 6 away matches against top-four teams."
    },
    {
      "id": "pick-1745329849611-4nz7rtx",
      "pick": "OVER 2.5 -115",
      "type": "total",
      "confidence": 0.72,
      "trapAlert": true,
      "revenge": false,
      "superstition": false,
      "momentum": 0.64,
      "homeTeam": "Arsenal",
      "awayTeam": "Crystal Palace",
      "league": "EPL", // Direct league name without transformation
      "time": "3:00 PM ET", // Exact time format
      "rationale": "Arsenal's home matches have gone over 2.5 goals in 8 of their last 10. Crystal Palace's defensive form has deteriorated, conceding in each of their last 7 away matches. Recent head-to-head matches at the Emirates have averaged 3.2 goals per game."
    }
  ];
  
  return picksData;
};

// Main function to update Supabase with the picks data
const updateSupabasePicksData = async () => {
  try {
    console.log('Ensuring Supabase connection...');
    await ensureAnonymousSession();
    
    const picksData = formatPicksData();
    console.log(`Formatted ${picksData.length} picks for database storage`);
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    // Check if entry for today exists
    const { data: existingData, error: checkError } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('date', today)
      .maybeSingle();
      
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking for existing data:', checkError);
      throw new Error('Failed to check for existing picks data');
    }
    
    const timestamp = new Date().toISOString();
    
    if (existingData) {
      // Update existing entry
      console.log('Updating existing entry in Supabase for date:', today);
      const { error: updateError } = await supabase
        .from('daily_picks')
        .update({ 
          picks: picksData,
          updated_at: timestamp
        })
        .eq('date', today);
        
      if (updateError) {
        console.error('Error updating picks in Supabase:', updateError);
        throw new Error('Failed to update picks in database');
      }
    } else {
      // Create new entry
      console.log('Creating new entry in Supabase for date:', today);
      const { error: insertError } = await supabase
        .from('daily_picks')
        .insert([
          { 
            date: today, 
            picks: picksData,
            created_at: timestamp,
            updated_at: timestamp
          }
        ]);
        
      if (insertError) {
        console.error('Error inserting picks in Supabase:', insertError);
        throw new Error('Failed to insert picks in database');
      }
    }
    
    // Verify data was saved
    console.log('Verifying picks were saved...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('date', today)
      .single();
      
    if (verifyError) {
      console.error('Error verifying picks were saved:', verifyError);
    } else if (!verifyData || !verifyData.picks) {
      console.error('Picks verification failed - data missing or empty');
    } else {
      console.log('Picks saved to Supabase successfully!');
      console.log(`Updated ${verifyData.picks.length} picks with proper formatting.`);
    }
  } catch (error) {
    console.error('Script error:', error);
  }
};

// Run the update function
updateSupabasePicksData();
