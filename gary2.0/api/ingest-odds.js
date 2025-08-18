import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!process.env.SUPABASE_URL || !serviceKey) {
      return res.status(500).json({ error: 'Missing SUPABASE_URL or service role key' });
    }
    const supabase = createClient(process.env.SUPABASE_URL, serviceKey);
    const sports = ['basketball_nba', 'baseball_mlb', 'icehockey_nhl'];
    const markets = ['h2h', 'spreads', 'totals'];
    const books = ['fanduel','draftkings','betmgm','caesars','pointsbetus','superbook'];

    let inserted = 0;
    for (const sport of sports) {
      const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?regions=us&markets=${markets.join(',')}&oddsFormat=american&dateFormat=iso&bookmakers=${books.join(',')}&apiKey=${process.env.ODDS_API_KEY}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const games = await resp.json();

      for (const g of games) {
        await supabase.from('games').upsert({
          game_id: g.id, sport: g.sport_key, home_team: g.home_team, away_team: g.away_team,
          start_time: g.commence_time, venue: null, status: 'scheduled'
        });
        const rows = [];
        const nowIso = new Date().toISOString();
        for (const b of g.bookmakers || []) {
          for (const m of b.markets || []) {
            for (const o of m.outcomes || []) {
              rows.push({
                game_id: g.id,
                ts: nowIso,
                book: b.key,
                market: m.key === 'h2h' ? 'ML' : m.key.toUpperCase(),
                selection: (o.name || '').toUpperCase().includes('OVER') ? 'OVER'
                         : (o.name || '').toUpperCase().includes('UNDER') ? 'UNDER'
                         : (o.name || '').toUpperCase().includes((g.home_team||'').toUpperCase()) ? 'HOME'
                         : 'AWAY',
                price_american: Number(o.price),
                line: o.point ?? null
              });
            }
          }
        }
        if (rows.length) {
          const { error } = await supabase.from('odds_history').insert(rows);
          if (!error) inserted += rows.length;
        }
      }
    }
    return res.status(200).json({ inserted });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}


