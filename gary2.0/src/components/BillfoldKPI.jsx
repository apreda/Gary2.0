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

export default function BillfoldKPI({ stats = {} }) {
  // Define KPIs using the stats prop with fallbacks for missing data
  const kpis = [
    {
      label: "Current Bankroll",
      subLabel: "Starting: $10,000",
      value: typeof stats.bankroll === 'number' ? `$${stats.bankroll.toLocaleString()}` : '$0',
      icon: <DollarSignIcon />,
      bgColor: "#10B981",
      iconBg: "rgba(16, 185, 129, 0.15)",
      iconBorder: "rgba(16, 185, 129, 0.3)"
    },
    {
      label: "ROI",
      subLabel: "Monthly: +15.5%",
      value: typeof stats.roi === 'number' ? `${stats.roi.toFixed(1)}%` : '0%',
      icon: <TrendingUpIcon />,
      bgColor: "#3B82F6",
      iconBg: "rgba(59, 130, 246, 0.15)",
      iconBorder: "rgba(59, 130, 246, 0.3)"
    },
    {
      label: "Record",
      subLabel: "Wins - Losses",
      value: stats.record || '0-0',
      icon: <PieChartIcon />,
      bgColor: "#FACC15",
      iconBg: "rgba(250, 204, 21, 0.15)",
      iconBorder: "rgba(250, 204, 21, 0.3)"
    },
    {
      label: "Win Rate",
      subLabel: "Last 30 days",
      value: metrics[3] || '0%',
      icon: <TrendingUpIcon />,
      bgColor: "#F97316",
      iconBg: "rgba(249, 115, 22, 0.15)",
      iconBorder: "rgba(249, 115, 22, 0.3)",
      change: 0,
      period: "Last 30 days"
    },
  ];
  
  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
      {kpis.map((kpi, i) => (
        <motion.div
          key={kpi.label || i}
          className="relative overflow-hidden rounded-md border border-[#333333] bg-[#1a1a1a]"
          whileHover={{ scale: 1.005 }}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
        >
          <div className="px-3 py-3 relative">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-gray-400 font-medium truncate">{kpi.label}</p>
                <p className="text-xl font-bold text-white tracking-tight truncate mt-0.5">{kpi.value}</p>
              </div>
              <div className={`
                flex items-center justify-center w-7 h-7 rounded-md
                ${kpi.change > 0 ? 'bg-green-900/30 text-green-400' : kpi.change < 0 ? 'bg-red-900/30 text-red-400' : 'bg-gray-900/30 text-gray-400'}
              `}>
                {kpi.change > 0 ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 19V5M12 5L5 12M12 5L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : kpi.change < 0 ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5V19M12 19L5 12M12 19L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            </div>
            
            <div className="flex items-center mt-1.5">
              <span className={`
                text-xs font-medium mr-1.5
                ${kpi.change > 0 ? 'text-green-400' : kpi.change < 0 ? 'text-red-400' : 'text-gray-400'}
              `}>
                {kpi.change > 0 ? '+' : ''}{kpi.change}%
              </span>
              <span className="text-[10px] text-gray-500">{kpi.period}</span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
