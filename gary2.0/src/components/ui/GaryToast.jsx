import React from 'react';
import gary1 from '../../assets/images/gary1.svg';

/**
 * Special toast notification with Gary's personality and avatar
 */
export const GaryToast = ({ message, type, onClose }) => {
  const bgColor = type === 'success' 
    ? 'bg-gradient-to-r from-[#1a1a1a] to-[#222222]' 
    : type === 'error' 
      ? 'bg-gradient-to-r from-[#1a1a1a] to-[#222222]' 
      : 'bg-gradient-to-r from-[#1a1a1a] to-[#222222]';
  
  const borderColor = type === 'success' 
    ? 'border-[#b8953f]' 
    : type === 'error' 
      ? 'border-red-600' 
      : 'border-[#b8953f]';
  
  return (
    <div 
      className={`flex items-center p-2 pr-4 rounded-lg shadow-lg border-l-4 ${borderColor} ${bgColor} text-white min-w-[300px] max-w-md transform transition-all duration-300 ease-in-out animate-slideIn`}
      role="alert"
    >
      <div className="mr-3 flex-shrink-0">
        <img src={gary1} alt="Gary" className="w-12 h-12" />
      </div>
      <div className="flex-grow">
        <p className="text-sm font-medium">{message}</p>
      </div>
      <button 
        onClick={onClose} 
        className="ml-2 text-gray-400 hover:text-white focus:outline-none"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
  );
};
