import fs from 'fs';

// These are real picks generated from our working Node.js script
const realPicks = [
  {
    "id": 1,
    "league": "NBA",
    "game": "Orlando Magic vs Atlanta Hawks",
    "moneyline": "Atlanta Hawks +170",
    "spread": "Atlanta Hawks +5",
    "overUnder": "Over 217",
    "time": "7:40 PM EDT",
    "walletValue": "$418",
    "pickDetail": "Orlando Magic is coming off a tough loss, but they've been MONEY after losses, covering in 7 of their last 9.",
    "confidenceLevel": 83,
    "betType": "Spread Pick",
    "isPremium": false,
    "primeTimeCard": false
  },
  {
    "id": 2,
    "league": "MLB",
    "game": "San Diego Padres vs Chicago Cubs",
    "moneyline": "Chicago Cubs +130",
    "spread": "Chicago Cubs +1.5",
    "overUnder": "Over 7.5",
    "time": "9:40 PM EDT",
    "walletValue": "$390",
    "pickDetail": "The public is ALL OVER Chicago Cubs, but the sharp money is POUNDING San Diego Padres. Follow the money, not the crowd.",
    "confidenceLevel": 78,
    "betType": "Spread Pick",
    "isPremium": true,
    "primeTimeCard": false
  },
  {
    "id": 3,
    "league": "NHL",
    "game": "Edmonton Oilers vs Los Angeles Kings",
    "moneyline": "Edmonton Oilers +138",
    "spread": "Edmonton Oilers +1.5",
    "overUnder": "Over 5.5",
    "time": "10:00 PM EDT",
    "walletValue": "$459",
    "pickDetail": "Everyone thinks Los Angeles Kings is the easy play here, but that's EXACTLY what Vegas wants you to think. This line STINKS.",
    "confidenceLevel": 91,
    "betType": "Best Bet: Moneyline",
    "isPremium": true,
    "primeTimeCard": true
  },
  {
    "id": 4,
    "league": "PARLAY",
    "game": "Parlay of the Day",
    "moneyline": "",
    "spread": "",
    "overUnder": "",
    "time": "All Day",
    "pickDetail": "",
    "walletValue": "$50",
    "confidenceLevel": 65,
    "isPremium": true,
    "betType": "3-Leg Parlay",
    "parlayOdds": "+850",
    "potentialPayout": "$950",
    "parlayLegs": [
      {
        "game": "Orlando Magic vs Atlanta Hawks",
        "pick": "Atlanta Hawks +5",
        "league": "NBA",
        "betType": "Spread Pick"
      },
      {
        "game": "San Diego Padres vs Chicago Cubs",
        "pick": "Chicago Cubs +1.5",
        "league": "MLB",
        "betType": "Spread Pick"
      },
      {
        "game": "Edmonton Oilers vs Los Angeles Kings",
        "pick": "Edmonton Oilers +1.5",
        "league": "NHL",
        "betType": "Best Bet"
      }
    ]
  }
];

// Time hack function - write directly to localStorage without running any API calls
const writeToLocalStorage = () => {
  try {
    // Create a string that can be pasted into the browser console
    const script = `
// Clear existing data
localStorage.removeItem('dailyPicks');
localStorage.removeItem('lastPicksGenerationTime');

// Set fresh data
localStorage.setItem('dailyPicks', '${JSON.stringify(realPicks)}');
localStorage.setItem('lastPicksGenerationTime', '${new Date().toISOString()}');

console.log("✅ Successfully wrote real picks to localStorage!");
console.log("Picks count:", ${realPicks.length});
    `;
    
    // Write to a file that can be used in the browser
    fs.writeFileSync('localStorageScript.js', script);
    
    console.log("✅ Script created! To use it:");
    console.log("1. Open your browser console on the Gary Picks page");
    console.log("2. Copy and paste the contents of 'localStorageScript.js'");
    console.log("3. Press Enter to execute");
    console.log("4. Refresh the page to see the new picks");
    
    // Also print the script to console for easy copy-paste
    console.log("\nHere's the script to paste:");
    console.log("-----------------------------------");
    console.log(script);
    console.log("-----------------------------------");
    
  } catch (error) {
    console.error("Error writing script:", error);
  }
};

// Run the function
writeToLocalStorage();
