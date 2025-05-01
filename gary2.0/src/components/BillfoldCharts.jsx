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

  return (
    // Horizontal layout on larger screens, vertical on mobile
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Sport Performance Chart */}
      <motion.div
        className="w-full rounded-xl overflow-hidden shadow-lg relative"
        whileHover={{ scale: 1.01, boxShadow: '0 8px 32px 0 rgba(212,175,55,0.18)' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {/* Background grid pattern */}
        <div className="absolute inset-0 bg-white" style={{ 
          backgroundImage: `
            linear-gradient(to right, ${garyColors.black}10 1px, transparent 1px),
            linear-gradient(to bottom, ${garyColors.black}10 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px'
        }}></div>
        
        {/* Gold accent line at top */}
        <div className="h-1 w-full bg-gradient-to-r from-[#d4af37] via-[#e5c349] to-[#d4af37]"></div>
        
        <div className="px-5 py-4 border-b border-[#d4af37]/20 bg-white relative z-10">
          <h3 className="text-lg font-bold text-[#0a0a0a] uppercase tracking-wider flex items-center">
            <span className="mr-2 text-[#d4af37]"><ChartIcon /></span>Performance by Sport
          </h3>
        </div>
        
        <div className="p-4 bg-white/95 relative z-10">
          {!hasSportData ? (
            <div className="h-60 flex items-center justify-center text-gray-400 border-2 border-dashed border-[#d4af37]/20 rounded-lg">
              <div className="text-center">
                <p className="font-medium">No sport data available</p>
                <p className="text-sm text-gray-500">Check back after picks are evaluated</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <BarChart
                layout="vertical"
                data={sportPerformance}
                margin={{ top: 20, right: 30, left: 75, bottom: 5 }}
              >
                <XAxis 
                  type="number" 
                  domain={[0, 'dataMax']} 
                  stroke="#333333"
                  tick={{ fill: '#333333' }}
                />
                <YAxis 
                  type="category" 
                  dataKey="sport" 
                  width={70} 
                  stroke="#333333"
                  tick={{ fill: '#333333' }}
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
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                  }}
                  labelStyle={{ color: '#0a0a0a', fontWeight: 'bold' }}
                />
                <Legend 
                  wrapperStyle={{ 
                    paddingTop: '10px'
                  }}
                />
                <Bar dataKey="wins" stackId="a" fill={garyColors.win} name="Wins">
                  <LabelList dataKey="wins" position="insideRight" fill="#fff" fontWeight="bold" />
                </Bar>
                <Bar dataKey="losses" stackId="a" fill={garyColors.loss} name="Losses">
                  <LabelList dataKey="losses" position="insideRight" fill="#fff" fontWeight="bold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* Bet Type Performance Chart */}
      <motion.div
        className="w-full rounded-xl overflow-hidden shadow-lg relative"
        whileHover={{ scale: 1.01, boxShadow: '0 8px 32px 0 rgba(212,175,55,0.18)' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {/* Background grid pattern */}
        <div className="absolute inset-0 bg-white" style={{ 
          backgroundImage: `
            linear-gradient(to right, ${garyColors.black}10 1px, transparent 1px),
            linear-gradient(to bottom, ${garyColors.black}10 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px'
        }}></div>
        
        {/* Gold accent line at top */}
        <div className="h-1 w-full bg-gradient-to-r from-[#d4af37] via-[#e5c349] to-[#d4af37]"></div>
        
        <div className="px-5 py-4 border-b border-[#d4af37]/20 bg-white relative z-10">
          <h3 className="text-lg font-bold text-[#0a0a0a] uppercase tracking-wider flex items-center">
            <span className="mr-2 text-[#d4af37]"><TagIcon /></span>Performance by Bet Type
          </h3>
        </div>
        
        <div className="p-4 bg-white/95 relative z-10">
          {!hasBetTypeData ? (
            <div className="h-60 flex items-center justify-center text-gray-400 border-2 border-dashed border-[#d4af37]/20 rounded-lg">
              <div className="text-center">
                <p className="font-medium">No bet type data available</p>
                <p className="text-sm text-gray-500">Check back after picks are evaluated</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <BarChart
                layout="vertical"
                data={betTypePerformance}
                margin={{ top: 20, right: 30, left: 95, bottom: 5 }}
              >
                <XAxis 
                  type="number" 
                  domain={[0, 'dataMax']} 
                  stroke="#333333"
                  tick={{ fill: '#333333' }}
                />
                <YAxis 
                  type="category" 
                  dataKey="betType" 
                  width={90} 
                  stroke="#333333"
                  tick={{ fill: '#333333' }}
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
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                  }}
                  labelStyle={{ color: '#0a0a0a', fontWeight: 'bold' }}
                />
                <Legend 
                  wrapperStyle={{ 
                    paddingTop: '10px'
                  }}
                />
                <Bar dataKey="wins" stackId="a" fill={garyColors.gold} name="Wins">
                  <LabelList dataKey="wins" position="insideRight" fill="#fff" fontWeight="bold" />
                </Bar>
                <Bar dataKey="losses" stackId="a" fill={garyColors.black} name="Losses">
                  <LabelList dataKey="losses" position="insideRight" fill="#fff" fontWeight="bold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>
    </div>
  );
}
