// Using styled divs instead of Card components
import React from 'react';

const BillfoldKPI = ({ icon, metric, value, textColor = 'text-gray-300', iconBgColor = 'bg-gray-800' }) => {
  const getIcon = () => {
    switch (icon) {
      case 'dollar':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"
              stroke="#b8953f"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      case 'scale':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" stroke="#b8953f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M15 2H9a1 1 0 00-1 1v2a1 1 0 001 1h6a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="#b8953f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      case 'trending':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 8c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zM3 12h1m8-9v1m8 8h1m-9 8v1M5.6 5.6l.7.7m12.1-.7l-.7.7m0 11.4l.7.7m-12.1-.7l-.7.7" stroke="#b8953f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      case 'check':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6L9 17l-5-5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center bg-gray-800/80 hover:bg-gray-800 rounded-lg px-3 py-2 transition-all duration-200 border border-[#b8953f]/20 shadow-sm hover:shadow-md">
      <span className={`flex items-center justify-center w-8 h-8 rounded-full ${iconBgColor} border border-[#b8953f]/30 mr-3`}>
        {getIcon()}
      </span>
      <div>
        <p className="text-xs text-gray-400 font-medium leading-tight uppercase tracking-wide">{metric}</p>
        <p className={`text-md font-bold leading-tight ${textColor}`}>{value}</p>
      </div>
    </div>
  );
};

export default BillfoldKPI;
