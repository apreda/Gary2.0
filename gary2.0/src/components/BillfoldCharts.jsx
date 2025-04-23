import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend, LabelList } from 'recharts';
import { motion } from 'framer-motion';

// Inline SVG icons to avoid build dependency issues
const ChartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3 9h18"/>
    <path d="M9 21V9"/>
  </svg>
);

const TagIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/>
    <path d="M7 7h.01"/>
  </svg>
);

export default function BillfoldCharts({ 
  equityHistory = [], 
  sportPerformance = [], 
  betTypePerformance = [] 
}) {
  // Ensure we have data to display
  const hasEquityData = equityHistory && equityHistory.length > 0;
  const hasSportData = sportPerformance && sportPerformance.length > 0;
  const hasBetTypeData = betTypePerformance && betTypePerformance.length > 0;
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

      {/* Sport Performance Chart */}
      <motion.div
        className="w-full bg-surface rounded-xl overflow-hidden shadow-lg"
        whileHover={{ scale: 1.01, boxShadow: '0 8px 32px 0 rgba(31,38,135,0.18)' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-2xl font-bold text-white flex items-center">
            <span className="mr-2 text-primary"><ChartIcon /></span>Performance by Sport
          </h3>
        </div>
        <div className="p-2">
          {!hasSportData ? (
            <div className="h-60 flex items-center justify-center text-gray-400">
              No sport data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                layout="vertical"
                data={sportPerformance}
                margin={{ top: 20, right: 30, left: 75, bottom: 5 }}
              >
                <XAxis type="number" domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="sport" width={70} />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'wins' ? `${value} wins` : `${value} losses`, 
                    name === 'wins' ? 'Wins' : 'Losses'
                  ]}
                />
                <Legend />
                <Bar dataKey="wins" stackId="a" fill="#38b2ac" name="Wins">
                  <LabelList dataKey="wins" position="insideRight" fill="#fff" />
                </Bar>
                <Bar dataKey="losses" stackId="a" fill="#e53e3e" name="Losses">
                  <LabelList dataKey="losses" position="insideRight" fill="#fff" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* Bet Type Performance Chart */}
      <motion.div
        className="w-full bg-surface rounded-xl overflow-hidden shadow-lg mt-6"
        whileHover={{ scale: 1.01, boxShadow: '0 8px 32px 0 rgba(31,38,135,0.18)' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-2xl font-bold text-white flex items-center">
            <span className="mr-2 text-primary"><TagIcon /></span>Performance by Bet Type
          </h3>
        </div>
        <div className="p-2">
          {!hasBetTypeData ? (
            <div className="h-60 flex items-center justify-center text-gray-400">
              No bet type data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                layout="vertical"
                data={betTypePerformance}
                margin={{ top: 20, right: 30, left: 95, bottom: 5 }}
              >
                <XAxis type="number" domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="betType" width={90} />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'wins' ? `${value} wins` : `${value} losses`, 
                    name === 'wins' ? 'Wins' : 'Losses'
                  ]}
                />
                <Legend />
                <Bar dataKey="wins" stackId="a" fill="#4299e1" name="Wins">
                  <LabelList dataKey="wins" position="insideRight" fill="#fff" />
                </Bar>
                <Bar dataKey="losses" stackId="a" fill="#e53e3e" name="Losses">
                  <LabelList dataKey="losses" position="insideRight" fill="#fff" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>
    </div>
  );
}
