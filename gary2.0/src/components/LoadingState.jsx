import React from 'react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import '../styles/LoadingState.css';

/**
 * LoadingState component
 * Shows a loading spinner with optional message
 */
const LoadingState = ({ message = "Loading Gary's picks..." }) => {
  return (
    <div className="loading-state">
      <LoadingSpinner />
      <p className="loading-message">{message}</p>
    </div>
  );
};

export default LoadingState;
