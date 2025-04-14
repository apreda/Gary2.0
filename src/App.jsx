import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar/Sidebar';
import { Home } from './pages/Home';
import { RealGaryPicks } from './pages/RealGaryPicks';
import { Pricing } from './pages/Pricing';
import { Billfold } from './pages/Billfold';
import { Leaderboard } from './pages/Leaderboard';
import { GaryLive } from './pages/GaryLive';
import { SignIn } from './pages/SignIn';
import { ParlayOfTheDayPage } from './pages/ParlayOfTheDay';

function App() {
  return (
    <Router>
      <Sidebar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/picks" element={<RealGaryPicks />} />
        <Route path="/billfold" element={<Billfold />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/gary-live" element={<GaryLive />} />
        <Route path="/parlay" element={<ParlayOfTheDayPage />} />
      </Routes>
    </Router>
  );
}

export default App; 