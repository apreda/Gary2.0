import React, { useEffect } from 'react';
import '../styles/Toast.css';

/**
 * Toast component
 * Displays a temporary notification message
 */
const Toast = ({ message, duration = 3000, onClose }) => {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        if (onClose) onClose();
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [message, duration, onClose]);
  
  if (!message) return null;
  
  return (
    <div className="toast">
      {message}
    </div>
  );
};

export default Toast;
