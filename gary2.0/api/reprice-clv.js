import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!process.env.SUPABASE_URL || !serviceKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or service role key' });
  }
  const supabase = createClient(process.env.SUPABASE_URL, serviceKey);
  try {
    const { data: openPicks } = await supabase.from('smart_picks')
      .select('pick_id, game_id, price_american, status').eq('status', 'open');

    if (!openPicks?.length) return res.status(200).json({ updated: 0 });

    let updated = 0;
    for (const p of openPicks) {
      const { data: best } = await supabase.from('v_best_price')
        .select('best_price_american').eq('game_id', p.game_id)
        .eq('market', 'ML').limit(1).maybeSingle();
      if (!best) continue;

      const clvCents = Number(best.best_price_american) - Number(p.price_american);
      const { error } = await supabase.from('clv_log').insert({
        pick_id: p.pick_id, price_american: best.best_price_american, clv_cents: clvCents
      });
      if (!error) updated++;
    }
    return res.status(200).json({ updated });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}


