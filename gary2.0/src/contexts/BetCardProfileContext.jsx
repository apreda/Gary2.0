import React, { createContext, useState, useContext } from 'react';
import BetCardProfileOverlay from '../components/BetCardProfileOverlay';

// Create context
const BetCardProfileContext = createContext();

// Custom hook to use the BetCard Profile context
export const useBetCardProfile = () => {
  const context = useContext(BetCardProfileContext);
  if (!context) {
    throw new Error('useBetCardProfile must be used within a BetCardProfileProvider');
  }
  return context;
};

// Provider component
export const BetCardProfileProvider = ({ children }) => {
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  // Function to open the overlay
  const openBetCardProfile = () => {
    setIsOverlayOpen(true);
  };

  // Function to close the overlay
  const closeBetCardProfile = () => {
    setIsOverlayOpen(false);
  };

  // Provide the state and functions to children
  return (
    <BetCardProfileContext.Provider
      value={{
        openBetCardProfile,
        closeBetCardProfile,
      }}
    >
      {children}
      <BetCardProfileOverlay 
        isOpen={isOverlayOpen} 
        onClose={closeBetCardProfile} 
      />
    </BetCardProfileContext.Provider>
  );
};
