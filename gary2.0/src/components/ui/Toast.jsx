import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Toast({ message, type = 'info', duration = 3000, onClose }) {
  const [isVisible, setIsVisible] = useState(true);

  const types = {
    success: {
      bg: 'bg-green-500/90',
      icon: '✓',
      border: 'border-green-400/20'
    },
    error: {
      bg: 'bg-red-500/90',
      icon: '✕',
      border: 'border-red-400/20'
    },
    info: {
      bg: 'bg-blue-500/90',
      icon: 'ℹ',
      border: 'border-blue-400/20'
    },
    warning: {
      bg: 'bg-yellow-500/90',
      icon: '⚠',
      border: 'border-yellow-400/20'
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, duration - 300); // Account for exit animation

    return () => clearTimeout(timer);
  }, [duration]);

  useEffect(() => {
    if (!isVisible) {
      const timer = setTimeout(() => {
        onClose?.();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.9 }}
          transition={{ 
            type: "spring",
            stiffness: 400,
            damping: 30
          }}
          className={`
            fixed bottom-4 right-4 
            flex items-center gap-3
            px-6 py-3 
            rounded-lg 
            shadow-lg 
            backdrop-blur-sm 
            border 
            ${types[type].bg} 
            ${types[type].border}
          `}
        >
          <span className="text-lg">{types[type].icon}</span>
          <p className="text-white font-medium">{message}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
