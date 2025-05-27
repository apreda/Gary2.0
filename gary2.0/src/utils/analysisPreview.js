/**
 * Utility to extract key stats and insights from analysis text
 * and format them as snappy bullet points for card previews
 */

/**
 * Extract key points from analysis text with emojis and formatting
 * @param {string} text - The analysis text to extract from
 * @returns {Array} - Array of formatted key points with emojis
 */
export const extractKeyPoints = (text) => {
  if (!text || typeof text !== 'string') return [];
  
  const points = [];
  
  // Look for percentage stats (shooting, win rates, etc.)
  const percentageMatches = text.match(/\d+\.?\d*%/g);
  if (percentageMatches && percentageMatches.length > 0) {
    const firstPercentage = percentageMatches[0];
    const context = text.substring(
      Math.max(0, text.indexOf(firstPercentage) - 30),
      text.indexOf(firstPercentage) + firstPercentage.length + 30
    ).trim();
    points.push(`📊 ${context.split('.')[0].trim()}`);
  }
  
  // Look for record stats (W-L records)
  const recordMatches = text.match(/\d+-\d+/g);
  if (recordMatches && recordMatches.length > 0) {
    const firstRecord = recordMatches[0];
    const context = text.substring(
      Math.max(0, text.indexOf(firstRecord) - 25),
      text.indexOf(firstRecord) + firstRecord.length + 25
    ).trim();
    points.push(`🏆 ${context.split('.')[0].trim()}`);
  }
  
  // Look for ERA, averages, or other decimal stats
  const statMatches = text.match(/\d+\.\d+\s*(ERA|AVG|OPS|WHIP|PPG|RPG|APG)/gi);
  if (statMatches && statMatches.length > 0) {
    const firstStat = statMatches[0];
    const context = text.substring(
      Math.max(0, text.indexOf(firstStat) - 20),
      text.indexOf(firstStat) + firstStat.length + 20
    ).trim();
    const emoji = firstStat.toLowerCase().includes('era') || firstStat.toLowerCase().includes('whip') ? '⚾' : 
                  firstStat.toLowerCase().includes('ppg') || firstStat.toLowerCase().includes('rpg') ? '🏀' : '📈';
    points.push(`${emoji} ${context.split('.')[0].trim()}`);
  }
  
  // Look for momentum/trend indicators
  const trendWords = ['streak', 'momentum', 'hot', 'cold', 'trending', 'form', 'rolling', 'surging'];
  for (const word of trendWords) {
    const regex = new RegExp(`[^.]*${word}[^.]*`, 'gi');
    const match = text.match(regex);
    if (match && match[0]) {
      points.push(`🔥 ${match[0].trim()}`);
      break;
    }
  }
  
  // Look for matchup advantages
  const matchupWords = ['advantage', 'edge', 'favors', 'struggles', 'dominates', 'weakness', 'strength'];
  for (const word of matchupWords) {
    const regex = new RegExp(`[^.]*${word}[^.]*`, 'gi');
    const match = text.match(regex);
    if (match && match[0]) {
      points.push(`⚔️ ${match[0].trim()}`);
      break;
    }
  }
  
  // Look for injury/roster information
  const injuryWords = ['injury', 'injured', 'out', 'questionable', 'doubtful', 'return'];
  for (const word of injuryWords) {
    const regex = new RegExp(`[^.]*${word}[^.]*`, 'gi');
    const match = text.match(regex);
    if (match && match[0]) {
      points.push(`🏥 ${match[0].trim()}`);
      break;
    }
  }
  
  // Look for weather conditions (for outdoor sports)
  const weatherWords = ['weather', 'wind', 'rain', 'temperature', 'conditions'];
  for (const word of weatherWords) {
    const regex = new RegExp(`[^.]*${word}[^.]*`, 'gi');
    const match = text.match(regex);
    if (match && match[0]) {
      points.push(`🌤️ ${match[0].trim()}`);
      break;
    }
  }
  
  // Look for value/betting insights
  const valueWords = ['value', 'edge', 'line', 'odds', 'sharp', 'public', 'betting'];
  for (const word of valueWords) {
    const regex = new RegExp(`[^.]*${word}[^.]*`, 'gi');
    const match = text.match(regex);
    if (match && match[0]) {
      points.push(`💰 ${match[0].trim()}`);
      break;
    }
  }
  
  // If we don't have enough specific points, extract first meaningful sentence
  if (points.length < 2) {
    const sentences = text.split('.').filter(s => s.trim().length > 15);
    if (sentences.length > 0) {
      points.push(`💡 ${sentences[0].trim()}`);
    }
  }
  
  // Clean up points and ensure they're not too long
  const cleanedPoints = points.map(point => {
    let cleaned = point.trim();
    // If point is too long, truncate it
    if (cleaned.length > 80) {
      const emoji = cleaned.split(' ')[0];
      const text = cleaned.substring(cleaned.indexOf(' ') + 1);
      cleaned = `${emoji} ${text.substring(0, 75)}...`;
    }
    return cleaned;
  });
  
  return cleanedPoints.slice(0, 3); // Max 3 bullet points
};

/**
 * Render key points as JSX elements with consistent styling
 * @param {Array} keyPoints - Array of key points from extractKeyPoints
 * @param {Object} customStyles - Optional custom styles to override defaults
 * @returns {JSX.Element} - Rendered bullet points
 */
export const renderKeyPoints = (keyPoints, customStyles = {}) => {
  if (!keyPoints || keyPoints.length === 0) {
    return (
      <div style={{ 
        opacity: 0.7, 
        fontStyle: 'italic',
        ...customStyles.fallback 
      }}>
        Tap for detailed analysis
      </div>
    );
  }
  
  const defaultStyles = {
    container: {
      fontSize: '0.75rem',
      lineHeight: 1.3,
    },
    bulletPoint: {
      display: 'flex',
      alignItems: 'flex-start',
      marginBottom: '0.3rem',
    },
    emoji: {
      marginRight: '0.4rem',
      fontSize: '0.7rem',
    },
    text: {
      opacity: 0.9,
      lineHeight: 1.3,
    }
  };
  
  const styles = {
    container: { ...defaultStyles.container, ...customStyles.container },
    bulletPoint: { ...defaultStyles.bulletPoint, ...customStyles.bulletPoint },
    emoji: { ...defaultStyles.emoji, ...customStyles.emoji },
    text: { ...defaultStyles.text, ...customStyles.text },
  };
  
  return (
    <div style={styles.container}>
      {keyPoints.map((point, idx) => (
        <div key={idx} style={styles.bulletPoint}>
          <span style={styles.emoji}>
            {point.split(' ')[0]}
          </span>
          <span style={styles.text}>
            {point.substring(point.indexOf(' ') + 1)}
          </span>
        </div>
      ))}
    </div>
  );
}; 