/**
 * Script to update Supabase with properly formatted pick data
 */
import { supabase, ensureAnonymousSession } from '../supabaseClient.js';

// Format the pick data according to the requirements
const formatPicksData = () => {
  // The provided picks data from Supabase
  const picksData = [
    {
      "id": "pick-1745329824567-n4ey3va",
      "game": "Minnesota Timberwolves @ Los Angeles Lakers",
      "time": "10:00 PM EDT",
      "league": "NBA",
      "spread": "",
      "betType": "Moneyline",
      "analysis": "Gary's analysis shows that Los Angeles Lakers has an advantage in this matchup.",
      "isPremium": false,
      "moneyline": "Los Angeles Lakers -135",
      "overUnder": "",
      "shortPick": "LAL -135",
      "walletValue": "$75",
      "garysBullets": [
        "Los Angeles Lakers has a statistical advantage",
        "Current odds present good value",
        "Recent performance supports this pick"
      ],
      "primeTimeCard": false,
      "confidenceLevel": 75
    },
    {
      "id": "pick-1745329834507-eisdljv",
      "game": "Chicago White Sox @ Minnesota Twins",
      "time": "7:40 PM EDT",
      "league": "MLB",
      "spread": "",
      "betType": "Moneyline",
      "analysis": "Gary's analysis shows that Minnesota Twins has an advantage in this matchup.",
      "isPremium": true,
      "moneyline": "Minnesota Twins -145",
      "overUnder": "",
      "shortPick": "MIN -145",
      "walletValue": "$75",
      "garysBullets": [
        "Minnesota Twins has a statistical advantage",
        "Current odds present good value",
        "Recent performance supports this pick"
      ],
      "primeTimeCard": true,
      "confidenceLevel": 75
    },
    {
      "id": "pick-1745329843802-e217gga",
      "game": "Montréal Canadiens @ Washington Capitals",
      "time": "7:10 PM EDT",
      "league": "NHL",
      "spread": "",
      "betType": "Moneyline",
      "analysis": "Gary's analysis shows that Washington Capitals has an advantage in this matchup.",
      "isPremium": true,
      "moneyline": "Washington Capitals -125",
      "overUnder": "",
      "shortPick": "WSH -125",
      "walletValue": "$75",
      "garysBullets": [
        "Washington Capitals has a statistical advantage",
        "Current odds present good value",
        "Recent performance supports this pick"
      ],
      "primeTimeCard": true,
      "confidenceLevel": 75
    },
    {
      "id": "pick-1745329849610-isg73m3",
      "game": "Aston Villa @ Manchester City",
      "time": "3:00 PM EDT",
      "league": "Soccer",
      "spread": "Manchester City -3.5",
      "betType": "Moneyline",
      "analysis": "Gary's analysis shows Manchester City has a statistical advantage in this matchup based on recent performance metrics.",
      "isPremium": true,
      "moneyline": "Manchester City -110",
      "overUnder": "OVER 220.5",
      "shortPick": "MCI -110",
      "walletValue": "$75",
      "garysBullets": [
        "Manchester City has shown strong performance in recent games",
        "Current odds present good betting value",
        "Statistical analysis supports this selection"
      ],
      "primeTimeCard": false,
      "confidenceLevel": 75
    },
    {
      "id": "pick-1745329849611-4nz7rtx",
      "game": "Crystal Palace @ Arsenal",
      "time": "3:00 PM EDT",
      "league": "Soccer",
      "spread": "Arsenal -3.5",
      "betType": "Moneyline",
      "analysis": "Gary's analysis shows Arsenal has a statistical advantage in this matchup based on recent performance metrics.",
      "isPremium": true,
      "moneyline": "Arsenal -110",
      "overUnder": "OVER 220.5",
      "shortPick": "ARS -110",
      "walletValue": "$75",
      "garysBullets": [
        "Arsenal has shown strong performance in recent games",
        "Current odds present good betting value",
        "Statistical analysis supports this selection"
      ],
      "primeTimeCard": false,
      "confidenceLevel": 75
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
