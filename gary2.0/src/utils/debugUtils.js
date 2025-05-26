/**
 * Debug utilities for tracking player stats and API issues
 */

export const debugUtils = {
  /**
   * Log API call details for debugging
   */
  logApiCall: (service, method, params, result, error = null) => {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      service,
      method,
      params,
      success: !error,
      error: error?.message || null,
      resultSize: result ? (Array.isArray(result) ? result.length : typeof result) : null
    };
    
    console.log(`[DEBUG ${timestamp}] ${service}.${method}:`, logData);
    
    // Store in sessionStorage for debugging
    try {
      const debugLogs = JSON.parse(sessionStorage.getItem('gary_debug_logs') || '[]');
      debugLogs.push(logData);
      // Keep only last 50 logs
      if (debugLogs.length > 50) {
        debugLogs.splice(0, debugLogs.length - 50);
      }
      sessionStorage.setItem('gary_debug_logs', JSON.stringify(debugLogs));
    } catch (e) {
      // Ignore storage errors
    }
  },

  /**
   * Get debug logs from session storage
   */
  getDebugLogs: () => {
    try {
      return JSON.parse(sessionStorage.getItem('gary_debug_logs') || '[]');
    } catch (e) {
      return [];
    }
  },

  /**
   * Clear debug logs
   */
  clearDebugLogs: () => {
    try {
      sessionStorage.removeItem('gary_debug_logs');
    } catch (e) {
      // Ignore storage errors
    }
  },

  /**
   * Log player stats issues specifically
   */
  logPlayerStatsIssue: (issue, context = {}) => {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      type: 'PLAYER_STATS_ISSUE',
      issue,
      context
    };
    
    console.warn(`[PLAYER STATS ISSUE ${timestamp}]:`, logData);
    
    // Store in sessionStorage for debugging
    try {
      const issuesLogs = JSON.parse(sessionStorage.getItem('gary_player_stats_issues') || '[]');
      issuesLogs.push(logData);
      // Keep only last 20 issues
      if (issuesLogs.length > 20) {
        issuesLogs.splice(0, issuesLogs.length - 20);
      }
      sessionStorage.setItem('gary_player_stats_issues', JSON.stringify(issuesLogs));
    } catch (e) {
      // Ignore storage errors
    }
  },

  /**
   * Get player stats issues from session storage
   */
  getPlayerStatsIssues: () => {
    try {
      return JSON.parse(sessionStorage.getItem('gary_player_stats_issues') || '[]');
    } catch (e) {
      return [];
    }
  },

  /**
   * Add debug info to console for easy access
   */
  addToWindow: () => {
    if (typeof window !== 'undefined') {
      window.garyDebug = {
        getLogs: debugUtils.getDebugLogs,
        clearLogs: debugUtils.clearDebugLogs,
        getPlayerStatsIssues: debugUtils.getPlayerStatsIssues,
        logPlayerStatsIssue: debugUtils.logPlayerStatsIssue
      };
      console.log('Gary debug utilities available at window.garyDebug');
    }
  }
};

// Auto-add to window in development
if (import.meta.env?.DEV) {
  debugUtils.addToWindow();
} 