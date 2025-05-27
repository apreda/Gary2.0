/**
 * Utility to extract key stats and insights from analysis text
 * and format them as snappy bullet points for card previews
 */

/**
 * Extract key points from analysis text and format as bullet points
 * @param {string} text - The analysis text to extract from
 * @returns {Array} - Array of formatted key points without emojis
 */
export const extractKeyPoints = (text) => {
  if (!text || typeof text !== 'string') return [];
  
  const points = [];
  
  // Split text into sentences for better analysis
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  // Look for sentences with specific stats and numbers
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    
    // Look for percentage stats (shooting, win rates, etc.)
    if (/\d+\.?\d*%/.test(trimmed) && points.length < 3) {
      points.push(trimmed);
      continue;
    }
    
    // Look for record stats (W-L records)
    if (/\d+-\d+/.test(trimmed) && points.length < 3) {
      points.push(trimmed);
      continue;
    }
    
    // Look for ERA, averages, or other decimal stats
    if (/\d+\.\d+\s*(ERA|AVG|OPS|WHIP|PPG|RPG|APG)/gi.test(trimmed) && points.length < 3) {
      points.push(trimmed);
      continue;
    }
    
    // Look for momentum/trend indicators
    if (/(streak|momentum|hot|cold|trending|form|rolling|surging)/gi.test(trimmed) && points.length < 3) {
      points.push(trimmed);
      continue;
    }
    
    // Look for matchup advantages
    if (/(advantage|edge|favors|struggles|dominates|weakness|strength)/gi.test(trimmed) && points.length < 3) {
      points.push(trimmed);
      continue;
    }
    
    // Look for injury/roster information
    if (/(injury|injured|out|questionable|doubtful|return)/gi.test(trimmed) && points.length < 3) {
      points.push(trimmed);
      continue;
    }
    
    // Look for weather conditions (for outdoor sports)
    if (/(weather|wind|rain|temperature|conditions)/gi.test(trimmed) && points.length < 3) {
      points.push(trimmed);
      continue;
    }
    
    // Look for value/betting insights
    if (/(value|line|odds|sharp|public|betting)/gi.test(trimmed) && points.length < 3) {
      points.push(trimmed);
      continue;
    }
  }
  
  // If we don't have enough specific points, add the first few meaningful sentences
  if (points.length < 3) {
    for (const sentence of sentences) {
      if (points.length >= 3) break;
      const trimmed = sentence.trim();
      if (trimmed.length > 15 && !points.includes(trimmed)) {
        points.push(trimmed);
      }
    }
  }
  
  // Clean up points and ensure they're not too long
  const cleanedPoints = points.map(point => {
    let cleaned = point.trim();
    // If point is too long, truncate it
    if (cleaned.length > 80) {
      cleaned = cleaned.substring(0, 75) + '...';
    }
    return cleaned;
  });
  
  return cleanedPoints.slice(0, 3); // Max 3 bullet points
};

/**
 * Format key points as HTML string for rendering
 * @param {Array} keyPoints - Array of key points from extractKeyPoints
 * @returns {string} - HTML string with bullet points
 */
export const formatKeyPointsAsHTML = (keyPoints) => {
  if (!keyPoints || keyPoints.length === 0) {
    return '<div style="opacity: 0.7; font-style: italic;">Tap for detailed analysis</div>';
  }
  
  const bulletPoints = keyPoints.map(point => 
    `<div style="display: flex; align-items: flex-start; margin-bottom: 0.3rem;">
      <span style="margin-right: 0.4rem; font-size: 0.7rem; opacity: 0.6;">•</span>
      <span style="opacity: 0.9; line-height: 1.3;">${point}</span>
    </div>`
  ).join('');
  
  return `<div style="font-size: 0.75rem; line-height: 1.3;">${bulletPoints}</div>`;
}; 