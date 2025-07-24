import React, { useState, useEffect } from 'react';
import { teamPropService } from '../services/teamPropService.js';
import { PickCard } from '../components/PickCard';

export default function TeamProps() {
  const [game, setGame] = useState('All Games');
  const [team, setTeam] = useState('All Teams');
  const [category, setCategory] = useState('All Categories');
  const [props, setProps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flippedCards, setFlippedCards] = useState({});

  useEffect(() => {
    const fetchProps = async () => {
      try {
        setLoading(true);
        setError(null);
        // For now, use mock data since the service might not be fully implemented
        const mockData = [
          {
            id: '1',
            team: 'Yankees',
            game: 'Yankees vs Red Sox',
            prop_type: 'home_run',
            player: 'Aaron Judge',
            rationale: 'Judge has been hot lately with 3 home runs in his last 5 games.',
            confidence: 0.75,
            game_opponent: 'Red Sox'
          },
          {
            id: '2',
            team: 'Yankees',
            game: 'Yankees vs Red Sox',
            prop_type: 'stolen_base',
            player: 'Gleyber Torres',
            rationale: 'Torres has good speed and the Red Sox catcher has been struggling.',
            confidence: 0.68,
            game_opponent: 'Red Sox'
          }
        ];
        setProps(mockData);
      } catch (err) {
        console.error('Error fetching team props:', err);
        setError(err.message || 'Failed to load team props');
      } finally {
        setLoading(false);
      }
    };

    fetchProps();
  }, []);

  const formatPropType = (propType) => {
    if (!propType) return '';
    return propType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getTeamNickname = (teamName) => {
    if (!teamName) return 'TBD';
    const words = teamName.trim().split(' ');
    return words[words.length - 1];
  };

  const toggleFlip = (pickId) => {
    setFlippedCards(prev => ({
      ...prev,
      [pickId]: !prev[pickId]
    }));
  };

  const handleDecision = (decision, pick) => {
    console.log(`User ${decision} on pick:`, pick);
    // Implement decision handling logic here
  };

  const filteredProps = props.filter(prop => {
    const gameMatch = game === 'All Games' || prop.game === game;
    const teamMatch = team === 'All Teams' || prop.team === team;
    const categoryMatch = category === 'All Categories' || prop.prop_type === category;
    return gameMatch && teamMatch && categoryMatch;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-white">Loading team props...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-[#b8953f]">
          Team-Specific Props
        </h1>
        
        {/* Filters */}
        <div className="flex gap-4 mb-8 justify-center">
          <select 
            value={game}
            onChange={(e) => setGame(e.target.value)}
            className="bg-gray-800 text-white p-2 rounded"
          >
            <option value="All Games">All Games</option>
            {[...new Set(props.map(p => p.game))].map(gameOption => (
              <option key={gameOption} value={gameOption}>{gameOption}</option>
            ))}
          </select>
          
          <select 
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="bg-gray-800 text-white p-2 rounded"
          >
            <option value="All Teams">All Teams</option>
            {[...new Set(props.map(p => p.team))].map(teamOption => (
              <option key={teamOption} value={teamOption}>{teamOption}</option>
            ))}
          </select>
          
          <select 
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-gray-800 text-white p-2 rounded"
          >
            <option value="All Categories">All Categories</option>
            {[...new Set(props.map(p => p.prop_type))].map(catOption => (
              <option key={catOption} value={catOption}>{formatPropType(catOption)}</option>
            ))}
          </select>
        </div>

        {/* Props Grid */}
        {filteredProps.length === 0 ? (
          <div className="text-center text-gray-400">
            No props found matching your criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProps.map(prop => (
              <PickCard
                key={prop.id}
                pick={prop}
                isFlipped={flippedCards[prop.id] || false}
                toggleFlip={() => toggleFlip(prop.id)}
                isMobile={window.innerWidth < 768}
                userDecision={null}
                handleDecision={handleDecision}
                processing={false}
                formatPropType={formatPropType}
                getTeamNickname={getTeamNickname}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 