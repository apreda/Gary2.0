import { picksService } from './picksService';
import { schedulerService } from './schedulerService';

/**
 * Force update the picks with real data
 * This script will clear the existing picks and generate new ones
 * using real data from The Odds API, even if the scheduled time hasn't been reached
 */
export const forceUpdate = async () => {
  try {
    console.log('🚀 Force updating picks with real data...');
    
    // Clear existing picks data
    localStorage.removeItem('dailyPicks');
    localStorage.removeItem('lastPicksGenerationTime');
    
    // Generate new picks with real data
    const newPicks = await picksService.generateDailyPicks();
    
    // Save to localStorage
    localStorage.setItem('dailyPicks', JSON.stringify(newPicks));
    schedulerService.markPicksAsGenerated();
    
    console.log('✅ Picks updated successfully!', newPicks);
    return newPicks;
  } catch (error) {
    console.error('❌ Error force updating picks:', error);
    return picksService.getFallbackPicks();
  }
};
