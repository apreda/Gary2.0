import React, { useState, useEffect } from 'react';
import { teamPropService } from '../services/teamPropService.js';
import { PickCard } from '../components/PickCard'; // Reuse existing card

export default function TeamProps() {
  // State for teams, filters, props
  // Fetch from service, render cards grouped by team/game/category
  const [game, setGame] = useState('All Games');
  const [team, setTeam] = useState('All Teams');
  const [category, setCategory] = useState('All Categories');
  const [props, setProps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProps = async () => {
      try {
        setLoading(true);
        const data = await teamPropService.getAllProps();
        setProps(data);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProps();
  }, []);

  const filteredProps = props.filter(prop => {
    const gameMatch = game === 'All Games' || prop.game === game;
    const teamMatch = team === 'All Teams' || prop.team === team;
    const categoryMatch = category === 'All Categories' || prop.category === category;
    return gameMatch && teamMatch && categoryMatch;
  });

  const groupedProps = filteredProps.reduce((acc, prop) => {
    const key = `${prop.team}-${prop.game}-${prop.category}`;
    if (!acc[key]) {
      acc[key] = {
        team: prop.team,
        game: prop.game,
        category: prop.category,
        picks: [],
      };
    }
    acc[key].picks.push(prop);
    return acc;
  }, {});

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  if (filteredProps.length === 0) return <p>No props found matching your criteria.</p>;

  return (
    <div>
      {/* Filters */}
      <select onChange={(e) => setGame(e.target.value)}> {/* games */}
        <option value="All Games">All Games</option>
        <option value="Game A">Game A</option>
        <option value="Game B">Game B</option>
      </select>
      <select onChange={(e) => setTeam(e.target.value)}> {/* Similar for team, category */}
        <option value="All Teams">All Teams</option>
        <option value="Team 1">Team 1</option>
        <option value="Team 2">Team 2</option>
      </select>
      <select onChange={(e) => setCategory(e.target.value)}>
        <option value="All Categories">All Categories</option>
        <option value="Category X">Category X</option>
        <option value="Category Y">Category Y</option>
      </select>
      {/* Grouped cards */}
      {Object.values(groupedProps).map(group => (
        <div key={`${group.team}-${group.game}-${group.category}`}>
          <h2>{group.team} - {group.category}</h2>
          <PickCard pick={group.picks} />
        </div>
      ))}
    </div>
  );
} 