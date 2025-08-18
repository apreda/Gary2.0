import { createClient } from '@supabase/supabase-js';
import { probToAmerican } from '../src/lib/odds.js';

export default async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!process.env.SUPABASE_URL || !serviceKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or service role key' });
  }
  const supabase = createClient(process.env.SUPABASE_URL, serviceKey);
  try {
    const { data: best } = await supabase.from('v_best_price').select('*').eq('market', 'ML').limit(1000);
    if (!best?.length) return res.status(200).json({ inserted: 0 });

    const gameIds = [...new Set(best.map(r => r.game_id))];
    const { data: games } = await supabase.from('games').select('game_id,sport').in('game_id', gameIds);
    const sportByGame = new Map((games || []).map(g => [g.game_id, g.sport]));

    const shrink = (c) => Math.max(0.52, Math.min(0.72, 0.5 + (c - 0.5) * 0.8));
    const out = [];
    for (const r of best) {
      const sport = sportByGame.get(r.game_id) || 'unknown';
      const p = shrink(0.58);
      out.push({
        game_id: r.game_id, market: r.market, selection: r.selection,
        model_version: `${sport}_baseline_v1`, model_prob: p, fair_american: probToAmerican(p),
        top_features: [{ feature: 'baseline_conf', weight: 1.0 }]
      });
    }
    if (out.length) await supabase.from('model_outputs').insert(out);
    return res.status(200).json({ inserted: out.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}


