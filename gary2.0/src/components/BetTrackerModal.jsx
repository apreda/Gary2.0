import React, { useState } from 'react';
import '../styles/BetTrackerModal.css';

/**
 * BetTrackerModal component
 * Modal for tracking bets
 */
const BetTrackerModal = ({ onClose, onSave, amount, onAmountChange, betType, odds }) => {
  const [decision, setDecision] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = () => {
    onSave(decision, notes);
    onClose();
  };

  return (
    <div className="bet-tracker-modal-overlay">
      <div className="bet-tracker-modal">
        <div className="bet-tracker-header">
          <h3>Track Your Bet</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="bet-tracker-form">
          <div className="form-group">
            <label>Bet Amount ($)</label>
            <input
              type="number"
              value={amount}
              onChange={onAmountChange}
              placeholder="Enter bet amount"
              min="1"
            />
          </div>
          
          <div className="form-group">
            <label>Bet Type</label>
            <input type="text" value={betType} readOnly />
          </div>
          
          <div className="form-group">
            <label>Odds</label>
            <input type="text" value={odds} readOnly />
          </div>
          
          <div className="form-group">
            <label>Decision</label>
            <div className="decision-buttons">
              <button
                className={`decision-button ${decision === 'bet' ? 'active' : ''}`}
                onClick={() => setDecision('bet')}
              >
                I Bet This
              </button>
              <button
                className={`decision-button ${decision === 'pass' ? 'active' : ''}`}
                onClick={() => setDecision('pass')}
              >
                I Passed
              </button>
            </div>
          </div>
          
          <div className="form-group">
            <label>Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this bet"
            ></textarea>
          </div>
          
          <div className="form-actions">
            <button
              className="save-button"
              disabled={!decision}
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BetTrackerModal;
