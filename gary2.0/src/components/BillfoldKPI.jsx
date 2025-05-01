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
      value: stats.winLoss || '0%',
      icon: <TrendingUpIcon />,
      bgColor: "#F97316",
      iconBg: "rgba(249, 115, 22, 0.15)",
      iconBorder: "rgba(249, 115, 22, 0.3)"
    },
  ];
  
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6 w-full">
      {/* Responsive: stack on mobile, 4-wide on md+ */}
      {kpis.map((kpi, i) => (
        <motion.div
          key={kpi.label}
          className="col-span-12 sm:col-span-6 lg:col-span-3"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1, duration: 0.4 }}
        >
          <div className="bg-[#1E293B]/80 backdrop-blur-sm border border-[#334155] p-5 md:p-6 rounded-xl shadow-lg hover:shadow-xl hover:translate-y-[-4px] hover:border-opacity-70 transition-all duration-300">
            {/* Card header with labeled icon */}
            <div className="flex items-center mb-4">
              <div 
                className="w-10 h-10 flex items-center justify-center rounded-full mr-3" 
                style={{
                  background: kpi.iconBg,
                  border: `1px solid ${kpi.iconBorder}`
                }}
              >
                <span style={{ color: kpi.bgColor }}>{kpi.icon}</span>
              </div>
              <div>
                <p className="text-[#94A3B8] text-sm font-medium uppercase tracking-wider">{kpi.label}</p>
                <p className="text-[#64748B] text-xs">{kpi.subLabel}</p>
              </div>
            </div>
            
            {/* Large value with dramatic styling */}
            <div className="mt-2">
              <p 
                className="text-3xl font-extrabold tracking-tight" 
                style={{ color: kpi.bgColor }}
              >
                {kpi.value}
              </p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
