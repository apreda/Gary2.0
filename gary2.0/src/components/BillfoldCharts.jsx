import { useState } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend, LabelList, PieChart, Pie } from 'recharts';
import { motion } from 'framer-motion';

export default function BillfoldCharts({ 
  sportPerformance = [], 
  betTypePerformance = [] 
}) {
  // Add state for time range filter
  const [timeRange, setTimeRange] = useState('all');
  
  // Ensure we have data to display
  const hasSportData = sportPerformance && sportPerformance.length > 0;
  const hasBetTypeData = betTypePerformance && betTypePerformance.length > 0;
  
  // Gary brand colors - updated to match new dark theme
  const garyColors = {
    gold: '#b8953f',
    goldLight: '#cda94d',
    goldDark: '#a07a2d',
    black: '#121212',
    white: '#ffffff',
    win: '#10b981',
    loss: '#ef4444'
  };

  // Format data for the pie chart
  const prepareBetTypeData = () => {
    if (!betTypePerformance || !Array.isArray(betTypePerformance) || betTypePerformance.length === 0) {
      return [];
    }
    
    return betTypePerformance.map((item, index) => ({
      name: item.betType,
      value: item.count,
      fill: [garyColors.gold, garyColors.goldLight, '#3b82f6', '#8b5cf6'][index % 4]
    }));
  };

  const betTypePieData = prepareBetTypeData();

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900 p-2 border border-gray-700 shadow-md rounded-md">
          <p className="font-medium text-xs text-gray-300 mb-1">
            {payload[0].payload.sport}
          </p>
          <p className="font-medium text-xs text-green-400">
            Wins: {payload[0].value}
          </p>
          <p className="font-medium text-xs text-red-400">
            Losses: {payload[1].value}
          </p>
        </div>
      );
    }
    return null;
  };

  const renderCustomizedLabel = ({ percent, x, y, payload }) => {
    return (
      <text x={x} y={y} fill="white" textAnchor={x > 50 ? 'start' : 'end'} dominantBaseline="central">
        {`${payload.name} ${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

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
                    ? 'bg-gray-800 text-[#b8953f] font-medium shadow-sm border border-[#b8953f]/40' 
                    : 'text-gray-400 hover:bg-gray-800/50'}`}
                >
                  All Time
                </button>
                <button 
                  onClick={() => setTimeRange('month')} 
                  className={`px-4 py-1.5 rounded-md text-sm transition-all duration-200 ${timeRange === 'month' 
                    ? 'bg-gray-800 text-[#b8953f] font-medium shadow-sm border border-[#b8953f]/40' 
                    : 'text-gray-400 hover:bg-gray-800/50'}`}
                >
                  Month
                </button>
                <button 
                  onClick={() => setTimeRange('week')} 
                  className={`px-4 py-1.5 rounded-md text-sm transition-all duration-200 ${timeRange === 'week' 
                    ? 'bg-gray-800 text-[#b8953f] font-medium shadow-sm border border-[#b8953f]/40' 
                    : 'text-gray-400 hover:bg-gray-800/50'}`}
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
                    stroke="#555555"
                    tick={{ fill: '#aaaaaa' }}
                    axisLine={{ stroke: '#444444' }}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="sport" 
                    width={60} 
                    stroke="#555555"
                    tick={{ fill: '#aaaaaa' }}
                    axisLine={{ stroke: '#444444' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    wrapperStyle={{ 
                      paddingTop: '5px',
                      fontSize: '12px',
                      color: '#aaaaaa'
                    }}
                  />
                  <Bar dataKey="wins" stackId="a" fill={garyColors.gold} name="Wins">
                    <LabelList dataKey="wins" position="insideRight" fill="#ffffff" fontWeight="bold" fontSize="11" />
                  </Bar>
                  <Bar dataKey="losses" stackId="a" fill="#555555" name="Losses">
                    <LabelList dataKey="losses" position="insideRight" fill="#ffffff" fontWeight="bold" fontSize="11" />
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
            <span className="mr-2 text-[#d4af37]">💰</span>Bet Type Distribution
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
              {/* Using the same time filter as sport chart */}
              <div className="flex justify-center space-x-2 mb-4 p-1 bg-[#f9f9f9] rounded-lg border border-[#d4af37]/10 shadow-inner opacity-0 pointer-events-none">
                <button className="px-4 py-1.5 rounded-md text-sm">Placeholder</button>
              </div>
              
              <div className="flex items-center justify-center h-60 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={betTypePieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="name"
                      label={renderCustomizedLabel}
                    >
                      {betTypePieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Legend
                      layout="vertical"
                      verticalAlign="middle"
                      align="right"
                      wrapperStyle={{ fontSize: '12px', color: '#aaaaaa' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
