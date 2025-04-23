// Using styled divs instead of Card components
import { DollarSign, TrendingUp, PieChart as PieIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

export default function BillfoldKPI({ stats = {} }) {
  // Define KPIs using the stats prop with fallbacks for missing data
  const kpis = [
    {
      label: "Current Bankroll",
      value: stats.bankroll || '$0',
      icon: <DollarSign className="w-5 h-5" />,
      bg: "from-green-600/20 to-green-400/10",
      border: "border-green-500/20",
      textColor: "text-green-400"
    },
    {
      label: "ROI",
      value: stats.roi || '0%',
      icon: <TrendingUp className="w-5 h-5" />,
      bg: "from-blue-600/20 to-blue-400/10",
      border: "border-blue-500/20",
      textColor: "text-blue-400"
    },
    {
      label: "Ride vs Fade",
      value: stats.rideFade || '0-0',
      icon: <PieIcon className="w-5 h-5" />,
      bg: "from-purple-600/20 to-purple-400/10",
      border: "border-purple-500/20",
      textColor: "text-purple-400"
    },
    {
      label: "Win / Loss",
      value: stats.winLoss || '0-0',
      icon: <TrendingUp className="w-5 h-5" />,
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

// Prop type validation
BillfoldKPI.propTypes = {
  stats: PropTypes.shape({
    bankroll: PropTypes.string,
    roi: PropTypes.string,
    rideFade: PropTypes.string,
    winLoss: PropTypes.string
  })
};
