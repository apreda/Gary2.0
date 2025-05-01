// Using styled divs instead of Card components
import { motion } from 'framer-motion';

// Inline SVG icons to avoid build dependency issues
const DollarSignIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="22"></line>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
  </svg>
);

const TrendingUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
    <polyline points="17 6 23 6 23 12"></polyline>
  </svg>
);

const PieChartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
    <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
  </svg>
);

export default function BillfoldKPI({ icon, metric, value, textColor = "text-gray-800" }) {
  // Determine which icon to use
  const getIcon = () => {
    switch(icon) {
      case 'dollar':
        return <DollarSignIcon />;
      case 'trending':
        return <TrendingUpIcon />;
      case 'pie':
      case 'scale':
        return <PieChartIcon />;
      default:
        return <DollarSignIcon />;
    }
  };
  
  return (
    <div className="flex items-center">
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#f8f8f8] mr-2">
        <span className="text-[#d4af37]">
          {getIcon()}
        </span>
      </span>
      <div>
        <p className="text-xs text-gray-500 leading-none">{metric}</p>
        <p className={`text-sm font-bold ${textColor}`}>{value}</p>
      </div>
    </div>
  );
}
