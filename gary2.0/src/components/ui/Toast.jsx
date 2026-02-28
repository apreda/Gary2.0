import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const TOAST_TYPES = {
  success: { bg: 'bg-green-500/90', icon: '\u2713', border: 'border-green-400/20' },
  error:   { bg: 'bg-red-500/90',   icon: '\u2715', border: 'border-red-400/20' },
  info:    { bg: 'bg-blue-500/90',  icon: '\u2139', border: 'border-blue-400/20' },
  warning: { bg: 'bg-yellow-500/90', icon: '\u26A0', border: 'border-yellow-400/20' }
};

/**
 * Unified toast component.
 *
 * Set `isGary` to render the themed Gary variant (avatar + dark gradient).
 */
export function Toast({ message, type = 'info', duration = 3000, onClose, isGary = false }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(false), duration - 300);
    return () => clearTimeout(timer);
  }, [duration]);

  useEffect(() => {
    if (!isVisible) {
      const timer = setTimeout(() => onClose?.(), 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (isGary) {
    const borderColor = type === 'error' ? 'border-red-600' : 'border-[#b8953f]';
    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`flex items-center p-2 pr-4 rounded-lg shadow-lg border-l-4 ${borderColor} bg-gradient-to-r from-[#1a1a1a] to-[#222222] text-white min-w-[300px] max-w-md`}
            role="alert"
          >
            <div className="mr-3 flex-shrink-0">
              <img src="/garymoney.png" alt="Gary" className="w-12 h-12 object-cover rounded-full" />
            </div>
            <p className="flex-grow text-sm font-medium">{message}</p>
            <button onClick={onClose} className="ml-2 text-gray-400 hover:text-white focus:outline-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  const style = TOAST_TYPES[type] || TOAST_TYPES.info;
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className={`flex items-center gap-3 px-6 py-3 rounded-lg shadow-lg backdrop-blur-sm border ${style.bg} ${style.border}`}
        >
          <span className="text-lg">{style.icon}</span>
          <p className="text-white font-medium">{message}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
