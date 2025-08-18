import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!process.env.SUPABASE_URL || !serviceKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or service role key' });
  }
  const supabase = createClient(process.env.SUPABASE_URL, serviceKey);
  try {
    const { data: games } = await supabase
      .from('games').select('game_id,start_time').gte('start_time', new Date().toISOString());

    let wrote = 0;
    for (const g of games || []) {
      const signals = {
        market_opp_steam: 0.25,
        news_risk: 0.2,
        outlier_books_only: false,
        schedule_spot_bad: 0.15,
        low_limits_best: false,
        public_vs_handle_skew: 0.1,
        red_flags: []
      };
      const { error } = await supabase.from('derived_signals').insert({ game_id: g.game_id, signals });
      if (!error) wrote++;
    }
    return res.status(200).json({ wrote });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}


