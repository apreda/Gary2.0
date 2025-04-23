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
      value: stats.bankroll || '$0',
      icon: <DollarSignIcon />,
      bg: "from-green-600/20 to-green-400/10",
      border: "border-green-500/20",
      textColor: "text-green-400"
    },
    {
      label: "ROI",
      value: stats.roi || '0%',
      icon: <TrendingUpIcon />,
      bg: "from-blue-600/20 to-blue-400/10",
      border: "border-blue-500/20",
      textColor: "text-blue-400"
    },
    {
      label: "Ride vs Fade",
      value: stats.rideFade || '0-0',
      icon: <PieChartIcon />,
      bg: "from-purple-600/20 to-purple-400/10",
      border: "border-purple-500/20",
      textColor: "text-purple-400"
    },
    {
      label: "Win / Loss",
      value: stats.winLoss || '0-0',
      icon: <TrendingUpIcon />,
      bg: "from-amber-600/20 to-amber-400/10",
      border: "border-amber-500/20",
      textColor: "text-amber-400"
    },
  ];
  return (
    <div className="grid grid-cols-12 gap-3 sm:gap-4 md:gap-6 mb-8 w-full">
      {/* Responsive: stack on mobile, 4-wide on md+ */}
      {kpis.map((kpi, i) => (
        <motion.div
          key={kpi.label}
          className="col-span-12 sm:col-span-6 md:col-span-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
        >
          <div className="bg-surface p-4 md:p-6 flex items-center space-x-3 md:space-x-4 rounded-xl shadow-lg hover:shadow-2xl hover:scale-[1.03] transition-all duration-200 cursor-pointer">
            <div className={`p-2 bg-primary/20 rounded-full flex items-center justify-center ${kpi.textColor}`}>
              {kpi.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm md:text-base text-gray-300 font-medium truncate">{kpi.label}</p>
              <p className="text-xl md:text-3xl font-extrabold text-white tracking-tight truncate">{kpi.value}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
