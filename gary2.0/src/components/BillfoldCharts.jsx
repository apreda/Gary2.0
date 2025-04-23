import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Legend } from 'recharts';
import { motion } from 'framer-motion';
import { PieChart as PieIcon } from 'lucide-react';

export default function BillfoldCharts({ equityHistory = [], confidenceBuckets = [], sportBreakdown = [] }) {
  // Ensure we have data to display
  const hasEquityData = equityHistory && equityHistory.length > 0;
  const hasSportData = sportBreakdown && sportBreakdown.length > 0;
  return (
    // Simple stacked layout, full width for both charts
    <div className="w-full mb-8 space-y-6">
      {/* Equity Curve Chart - Full Width */}
      <motion.div 
        className="w-full bg-surface rounded-xl shadow-lg overflow-hidden"
        initial={{ opacity: 0, y: 10 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.1 }} 
        whileHover={{ scale: 1.01 }}
      >
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-2xl font-bold text-white">Equity Curve</h3>
        </div>
        <div className="p-2">
          <div style={{ width: '100%', height: '280px' }}>
            {!hasEquityData ? (
              <div className="flex items-center justify-center h-full w-full text-gray-400">
                No equity data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityHistory} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <XAxis 
                  dataKey="date" 
                  stroke="#9CA3AF" 
                  tick={{ fontSize: 12, fontWeight: 600 }}
                  height={30}
                />
                <YAxis 
                  domain={['auto', 'auto']} 
                  stroke="#9CA3AF" 
                  tick={{ fontSize: 12, fontWeight: 600 }} 
                  width={40}
                />
                <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }} />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  name="Bankroll" 
                  stroke="#2563EB" 
                  strokeWidth={3} 
                  dot={false} 
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={30} 
                  iconSize={14} 
                  wrapperStyle={{ fontSize: 14, color: '#fff', paddingTop: 10 }} 
                />
              </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </motion.div>

      {/* Sport Breakdown Chart - Full Width */}
      <motion.div 
        className="w-full bg-surface rounded-xl shadow-lg overflow-hidden"
        initial={{ opacity: 0, y: 10 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.2 }} 
        whileHover={{ scale: 1.01 }}
      >
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-2xl font-bold text-white flex items-center">
            <PieIcon className="mr-2 text-primary"/>Sport Breakdown
          </h3>
        </div>
        <div className="p-2">
          <div style={{ width: '100%', height: '280px' }}>
            {!hasSportData ? (
              <div className="flex items-center justify-center h-full w-full text-gray-400">
                No sports breakdown data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
                <Pie 
                  data={sportBreakdown} 
                  dataKey="count" 
                  nameKey="sport" 
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={0}
                  labelLine={false}
                  label={false}
                >
                  {sportBreakdown.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color || '#2563EB'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }}/>
                <Legend 
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  iconSize={14}
                  iconType="circle"
                  formatter={(value) => <span style={{color: '#fff', fontSize: '14px', fontWeight: 600}}>{value}</span>}
                  wrapperStyle={{ fontSize: 14, color: '#fff', paddingTop: 5 }}
                />
              </RechartsPieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
