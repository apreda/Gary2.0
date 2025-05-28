import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { BetHistory } from "../components/BetHistory";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { useToast } from "../components/ui/ToastProvider";
import { useAuth } from "../contexts/AuthContext";
import { userPickResultsService } from "../services/userPickResultsService";
import { betTrackingService } from "../services/betTrackingService";
import { motion } from "framer-motion";

/**
 * BetCard - Displays user betting stats and history.
 * @param {object} props
 * @param {any} [props.reloadKey] - Optional key that forces BetCard to reload data when changed.
 */
export function BetCard({ reloadKey }) {
  const [stats, setStats] = useState(null);
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const showToast = useToast();

  useEffect(() => {
    console.log('[BetCard] useEffect triggered', { reloadKey, user });
    if (!user) {
      showToast('Please sign in to view your BetCard', 'info');
      setLoading(false);
      return;
    }

    async function fetchUserData() {
      try {
        // Fetch user picks from Supabase only
        const userPicks = await betTrackingService.getBetDecisions(user.id);
        
        if (!userPicks || userPicks.length === 0) {
          setStats({
            wins: 0,
            losses: 0,
            pushes: 0,
            bet: 0,
            fade: 0,
            winRate: 0,
            betRate: 0,
            fadeRate: 0,
            streak: { current_streak: 0, streak_type: null }
          });
          setPicks([]);
          setLoading(false);
          showToast('Welcome! Start by betting or fading Gary\'s picks', 'info');
          return;
        }

        // Also get user record from the service
        let serviceRecord = null;
        try {
          serviceRecord = await userPickResultsService.getUserRecord(user.id);
        } catch (error) {
          console.log('Could not fetch service record, using manual calculation:', error);
        }

        // Calculate stats from user_picks
        let wins = 0, losses = 0, pushes = 0, bet = 0, fade = 0;
        userPicks.forEach((pick) => {
          // Handle both old (ride/fade) and new (bet/fade) decision formats
          if (pick.decision === "bet" || pick.decision === "ride") bet++;
          else if (pick.decision === "fade") fade++;

          // Handle both old (win/loss) and new (won/lost/push) outcome formats
          if (pick.outcome === "won" || pick.outcome === "win") wins++;
          else if (pick.outcome === "lost" || pick.outcome === "loss") losses++;
          else if (pick.outcome === "push") pushes++;
        });

        const total = wins + losses; // Don't count pushes in win rate calculation
        const betFadeTotal = bet + fade;

        // Calculate streaks (only count wins and losses, not pushes)
        let currentStreak = 0;
        let streakType = null;

        // Sort picks by created_at descending to get most recent first
        const sortedPicks = [...userPicks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        for (let i = 0; i < sortedPicks.length; i++) {
          const outcome = sortedPicks[i].outcome;
          // Skip pushes when calculating streaks
          if (outcome === "push") continue;
          
          // Normalize outcome format
          const normalizedOutcome = (outcome === "won" || outcome === "win") ? "win" : "loss";
          
          if (streakType === null) {
            currentStreak = 1;
            streakType = normalizedOutcome;
          } else if (normalizedOutcome === streakType) {
            currentStreak++;
          } else {
            break;
          }
        }

        if (streakType === "loss") currentStreak = -currentStreak;

        // Use service record if available, otherwise use manual calculation
        const finalStats = serviceRecord ? {
          wins: parseInt(serviceRecord.record.split('-')[0]) || wins,
          losses: parseInt(serviceRecord.record.split('-')[1]) || losses,
          pushes: parseInt(serviceRecord.record.split('-')[2]) || pushes,
          bet,
          fade,
          winRate: serviceRecord.win_rate || (total ? ((wins / total) * 100).toFixed(1) : 0),
          betRate: betFadeTotal ? ((bet / betFadeTotal) * 100).toFixed(1) : 0,
          fadeRate: betFadeTotal ? ((fade / betFadeTotal) * 100).toFixed(1) : 0,
          streak: {
            current_streak: serviceRecord.current_streak || currentStreak || 0,
            streak_type: serviceRecord.current_streak > 0 ? "win" : serviceRecord.current_streak < 0 ? "loss" : streakType
          }
        } : {
          wins,
          losses,
          pushes,
          bet,
          fade,
          winRate: total ? ((wins / total) * 100).toFixed(1) : 0,
          betRate: betFadeTotal ? ((bet / betFadeTotal) * 100).toFixed(1) : 0,
          fadeRate: betFadeTotal ? ((fade / betFadeTotal) * 100).toFixed(1) : 0,
          streak: {
            current_streak: currentStreak || 0,
            streak_type: streakType
          }
        };

        // Show streak notification
        if (Math.abs(finalStats.streak.current_streak) >= 3) {
          const streakMessage = finalStats.streak.current_streak > 0
            ? `You're on a ${finalStats.streak.current_streak} win streak!`
            : `❄️ You're on a ${Math.abs(finalStats.streak.current_streak)} loss streak`;
          showToast(streakMessage, finalStats.streak.current_streak > 0 ? 'success' : 'warning');
        }

        setStats(finalStats);
        setPicks(userPicks);

      } catch (error) {
        console.error("Error fetching user data:", error);
        showToast('Failed to load your betting data', 'error');
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  }, [user, showToast, reloadKey]);

  if (loading) return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-center min-h-[300px]">
        <LoadingSpinner size="lg" />
      </div>
    </div>
  );

  if (!user) return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto p-4 sm:p-6 text-center"
    >
      <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-8 shadow-lg border border-gray-800">
        <h3 className="text-xl font-semibold text-gray-200 mb-2">Sign In Required</h3>
        <p className="text-gray-400">Please sign in to view your BetCard and track your picks.</p>
      </div>
    </motion.div>
  );

  if (!stats) return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto p-4 sm:p-6 text-center"
    >
      <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-8 shadow-lg border border-gray-800">
        <h3 className="text-xl font-semibold text-gray-200 mb-2">Welcome to Your BetCard!</h3>
        <p className="text-gray-400">Start your journey by betting or fading Gary's picks.</p>
      </div>
    </motion.div>
  );

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Stats Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-xl p-6 text-white border border-gray-700/50"
      >
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <span className="text-3xl">📇</span> Your BetCard
          </h2>
          <motion.div 
            className={`px-3 py-1 rounded-full text-sm font-medium ${stats.streak.current_streak > 0 ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <span className="flex items-center">
              {stats.streak.current_streak > 0 ? 
                <svg className="w-4 h-4 mr-1 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.177A7.547 7.547 0 016.648 6.61a.75.75 0 00-1.152.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 011.925-3.545 3.75 3.75 0 013.255 3.717z" clipRule="evenodd" />
                </svg> :
                <svg className="w-4 h-4 mr-1 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-2.625 6c-.54 0-.828.419-.936.634a1.96 1.96 0 00-.189.866c0 .298.059.605.189.866.108.215.395.634.936.634.54 0 .828-.419.936-.634.13-.26.189-.568.189-.866 0-.298-.059-.605-.189-.866-.108-.215-.395-.634-.936-.634zm4.314.634c.108-.215.395-.634.936-.634.54 0 .828.419.936.634.13.26.189.568.189.866 0 .298-.059.605-.189.866-.108.215-.395.634-.936.634-.54 0-.828-.419-.936-.634a1.96 1.96 0 01-.189-.866c0-.298.059-.605.189-.866zm-4.34 7.964a.75.75 0 01-1.061-1.06 5.236 5.236 0 013.73-1.538 5.236 5.236 0 013.695 1.538.75.75 0 11-1.061 1.06 3.736 3.736 0 00-2.639-1.098 3.736 3.736 0 00-2.664 1.098z" clipRule="evenodd" />
                </svg>
              }
              {Math.abs(stats.streak.current_streak)} {stats.streak.streak_type?.toUpperCase()}
            </span>
          </motion.div>
        </div>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700/30"
          >
            <div className="text-3xl font-bold text-yellow-400 mb-1 tabular-nums">
              {stats.winRate}%
            </div>
            <div className="text-sm text-gray-400 font-medium">Win Rate</div>
          </motion.div>
          
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700/30"
          >
            <div className="text-3xl font-bold mb-1 tabular-nums">
              <span className="text-green-400">{stats.wins}</span>
              <span className="text-gray-500 mx-1">-</span>
              <span className="text-red-400">{stats.losses}</span>
              {stats.pushes > 0 && (
                <>
                  <span className="text-gray-500 mx-1">-</span>
                  <span className="text-yellow-400">{stats.pushes}</span>
                </>
              )}
            </div>
            <div className="text-sm text-gray-400 font-medium">Record</div>
          </motion.div>
          
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700/30"
          >
            <div className="text-3xl font-bold text-blue-400 mb-1 tabular-nums">
              {stats.betRate}%
            </div>
            <div className="text-sm text-gray-400 font-medium">Bet Rate</div>
          </motion.div>
          
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700/30"
          >
            <div className="text-3xl font-bold text-purple-400 mb-1 tabular-nums">
              {stats.fadeRate}%
            </div>
            <div className="text-sm text-gray-400 font-medium">Fade Rate</div>
          </motion.div>
        </div>
      </motion.div>

      {/* Bet History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <BetHistory picks={picks} />
      </motion.div>
    </div>
  );
}