import React, { useState } from 'react';
import { BetResultsService } from '../services/BetResultsService';
import { useAuth } from '../contexts/AuthContext';
import { useUserStats } from '../hooks/useUserStats';
import { toast } from 'react-hot-toast';

/**
 * Component for handling bet/fade decisions on a pick card
 */
const BetDecisionButtons = ({ gameId, isDisabled = false, onDecisionMade = () => {} }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuth();
  const { updateStats } = useUserStats();

  // Handle bet/fade button clicks
  const handleDecision = async (decisionType) => {
    if (!user) {
      toast.error('Please sign in to track your picks');
      return;
    }

    if (isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      // Record the decision using our updated useUserStats hook
      const success = await updateStats(decisionType, gameId);
      
      if (success) {
        // Show success message and notify parent component
        toast.success(`You've decided to ${decisionType === 'ride' ? 'bet with Gary' : 'fade the bear'}!`);
        onDecisionMade(decisionType);
      } else {
        toast.error('Unable to record your decision. Please try again.');
      }
    } catch (error) {
      console.error('Error handling decision:', error);
      toast.error('Something went wrong. Please try again later.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bet-decision-buttons flex flex-col sm:flex-row gap-2 mt-4">
      <button
        onClick={() => handleDecision('ride')}
        disabled={isDisabled || isProcessing}
        className="px-6 py-2 bg-[#1f1f1f] text-[#B8953F] border border-[#B8953F] rounded-lg hover:bg-[#B8953F] hover:text-black transition-all duration-300 flex-1 font-semibold"
      >
        {isProcessing ? 'Processing...' : 'Bet with Gary'}
      </button>
      <button
        onClick={() => handleDecision('fade')}
        disabled={isDisabled || isProcessing}
        className="px-6 py-2 bg-[#1f1f1f] text-white border border-gray-600 rounded-lg hover:bg-gray-700 transition-all duration-300 flex-1 font-semibold"
      >
        {isProcessing ? 'Processing...' : 'Fade the Bear'}
      </button>
    </div>
  );
};

export default BetDecisionButtons;
