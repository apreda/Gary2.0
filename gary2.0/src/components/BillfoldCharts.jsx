import { useState } from 'react';
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
  sportPerformance = [], 
  betTypePerformance = [] 
}) {
  // Add state for time range filter
  const [timeRange, setTimeRange] = useState('all');
  
  // Ensure we have data to display
  const hasSportData = sportPerformance && sportPerformance.length > 0;
  const hasBetTypeData = betTypePerformance && betTypePerformance.length > 0;
  
  // Gary brand colors
  const garyColors = {
    gold: '#d4af37',
    goldLight: '#e5c349',
    goldDark: '#b08d1d',
    black: '#0a0a0a',
    white: '#ffffff',
    navy: '#111111',
    win: '#10b981',
    loss: '#ef4444'
  };

  // In a real implementation, we would filter data by timeRange here
  // const filteredSportData = filterDataByTimeRange(sportPerformance, timeRange);
  // const filteredBetTypeData = filterDataByTimeRange(betTypePerformance, timeRange);

  return (
    // Horizontal layout on larger screens, vertical on mobile
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6"> 
      {/* Sport Performance Chart */}
      <motion.div
        className="w-full overflow-hidden rounded-md border border-[#d4af37]/20 bg-white shadow-md hover:shadow-lg transition-all duration-300"
        whileHover={{ scale: 1.005 }}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="px-4 py-3 border-b border-[#d4af37]/20 bg-gradient-to-r from-transparent via-[#f9f9f9] to-transparent">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800 flex items-center">
            <span className="mr-2 text-[#d4af37]">📈</span>Sport Performance
          </h3>
        </div>
        
        <div className="p-4 relative">
          {!hasSportData ? (
            <div className="h-40 flex items-center justify-center text-gray-500 border border-dashed border-gray-200 rounded-md bg-gray-50">
              <div className="text-center">
                <img src="/coin2.png" alt="Gary Coin" className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="font-medium text-sm">No sport data available</p>
              </div>
            </div>
          ) : (
            <>
              {/* Time Period Selector */}
              <div className="flex justify-center space-x-2 mb-4 p-1 bg-[#f9f9f9] rounded-lg border border-[#d4af37]/10 shadow-inner">
                <button 
                  onClick={() => setTimeRange('all')} 
                  className={`px-4 py-1.5 rounded-md text-sm transition-all duration-200 ${timeRange === 'all' 
                    ? 'bg-white text-[#d4af37] font-medium shadow-sm border border-[#d4af37]/20' 
                    : 'text-gray-600 hover:bg-white/50'}`}
                >
                  All Time
                </button>
                <button 
                  onClick={() => setTimeRange('month')} 
                  className={`px-4 py-1.5 rounded-md text-sm transition-all duration-200 ${timeRange === 'month' 
                    ? 'bg-white text-[#d4af37] font-medium shadow-sm border border-[#d4af37]/20' 
                    : 'text-gray-600 hover:bg-white/50'}`}
                >
                  Month
                </button>
                <button 
                  onClick={() => setTimeRange('week')} 
                  className={`px-4 py-1.5 rounded-md text-sm transition-all duration-200 ${timeRange === 'week' 
                    ? 'bg-white text-[#d4af37] font-medium shadow-sm border border-[#d4af37]/20' 
                    : 'text-gray-600 hover:bg-white/50'}`}
                >
                  Week
                </button>
              </div>
              
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  layout="vertical"
                  data={sportPerformance} 
                  margin={{ top: 10, right: 20, left: 60, bottom: 0 }}
                >
                  <XAxis 
                    type="number" 
                    domain={[0, 'dataMax']} 
                    stroke="#666666"
                    tick={{ fill: '#333333' }}
                    axisLine={{ stroke: '#cccccc' }}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="sport" 
                    width={60} 
                    stroke="#666666"
                    tick={{ fill: '#333333' }}
                    axisLine={{ stroke: '#cccccc' }}
                  />
                  <Tooltip 
                    formatter={(value, name) => [
                      name === 'wins' ? `${value} wins` : `${value} losses`, 
                      name === 'wins' ? 'Wins' : 'Losses'
                    ]}
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      borderColor: garyColors.gold,
                      borderWidth: '1px',
                      color: '#333333',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}
                    labelStyle={{ color: '#333333', fontWeight: 'bold' }}
                  />
                  <Legend 
                    wrapperStyle={{ 
                      paddingTop: '5px',
                      fontSize: '12px',
                      color: '#333333'
                    }}
                  />
                  <Bar dataKey="wins" stackId="a" fill={garyColors.gold} name="Wins">
                    <LabelList dataKey="wins" position="insideRight" fill="#333" fontWeight="bold" fontSize="11" />
                  </Bar>
                  <Bar dataKey="losses" stackId="a" fill="#999999" name="Losses">
                    <LabelList dataKey="losses" position="insideRight" fill="#fff" fontWeight="bold" fontSize="11" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </motion.div>

      {/* Bet Type Performance Chart */}
      <motion.div
        className="w-full overflow-hidden rounded-md border border-[#d4af37]/20 bg-white shadow-md hover:shadow-lg transition-all duration-300"
        whileHover={{ scale: 1.005 }}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="px-4 py-3 border-b border-[#d4af37]/20 bg-gradient-to-r from-transparent via-[#f9f9f9] to-transparent">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800 flex items-center">
            <span className="mr-2 text-[#d4af37]">💰</span>Bet Type Performance
          </h3>
        </div>
        
        <div className="p-4 relative">
          {!hasBetTypeData ? (
            <div className="h-40 flex items-center justify-center text-gray-500 border border-dashed border-gray-200 rounded-md bg-gray-50">
              <div className="text-center">
                <img src="/coin2.png" alt="Gary Coin" className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="font-medium text-sm">No bet type data available</p>
              </div>
            </div>
          ) : (
            <>
              {/* Using the same time range filter as sport chart, no need to repeat UI */}
              <div className="h-[46px] mb-4"></div> 
              
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  layout="vertical"
                  data={betTypePerformance} 
                  margin={{ top: 10, right: 20, left: 70, bottom: 0 }}
                >
                  <XAxis 
                    type="number" 
                    domain={[0, 'dataMax']} 
                    stroke="#666666"
                    tick={{ fill: '#333333' }}
                    axisLine={{ stroke: '#cccccc' }}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="betType" 
                    width={70} 
                    stroke="#666666"
                    tick={{ fill: '#333333' }}
                    axisLine={{ stroke: '#cccccc' }}
                  />
                  <Tooltip 
                    formatter={(value, name) => [
                      name === 'wins' ? `${value} wins` : `${value} losses`, 
                      name === 'wins' ? 'Wins' : 'Losses'
                    ]}
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      borderColor: garyColors.gold,
                      borderWidth: '1px',
                      color: '#333333',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}
                    labelStyle={{ color: '#333333', fontWeight: 'bold' }}
                  />
                  <Legend 
                    wrapperStyle={{ 
                      paddingTop: '5px',
                      fontSize: '12px',
                      color: '#333333'
                    }}
                  />
                  <Bar dataKey="wins" stackId="a" fill={garyColors.gold} name="Wins">
                    <LabelList dataKey="wins" position="insideRight" fill="#333" fontWeight="bold" fontSize="11" />
                  </Bar>
                  <Bar dataKey="losses" stackId="a" fill="#999999" name="Losses">
                    <LabelList dataKey="losses" position="insideRight" fill="#fff" fontWeight="bold" fontSize="11" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
