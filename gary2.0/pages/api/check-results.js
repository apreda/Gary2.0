import { pickResultsService } from '../../src/services/pickResultsService.js';

/**
 * API endpoint for checking game and prop pick results from the admin interface
 */
export default async function handler(req, res) {
  // Only allow POST and GET requests
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Extract date from request parameters or body
    const dateStr = req.query.date || (req.body && req.body.date);
    
    // If no date provided and it's a GET request, use yesterday's date
    const useDate = dateStr || (() => {
      if (req.method === 'GET') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toISOString().split('T')[0]; // YYYY-MM-DD format
      }
      return null;
    })();
    
    if (!useDate) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required (format: YYYY-MM-DD)'
      });
    }
    
    console.log(`Processing results check request for date: ${useDate}`);
    
    // Call the pickResultsService to check results for the date
    const results = await pickResultsService.checkResultsForDate(useDate);
    
    // Return the results
    return res.status(200).json(results);
  } catch (error) {
    console.error('Error in results check handler:', error);
    return res.status(500).json({
      success: false,
      message: `Error checking results: ${error.message}`
    });
  }
}
