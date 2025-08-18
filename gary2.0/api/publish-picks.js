import { createClient } from '@supabase/supabase-js';
import { decidePick } from '../src/lib/pickGate.js';

export default async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!process.env.SUPABASE_URL || !serviceKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or service role key' });
  }
  const supabase = createClient(process.env.SUPABASE_URL, serviceKey);
  try {
    const { data, error } = await supabase.rpc('get_candidate_picks');
    if (error) return res.status(500).json({ error: error.message });

    const toInsert = [];
    for (const c of data || []) {
      const decision = decidePick({
        modelProb: Number(c.model_prob),
        bestPriceAmerican: Number(c.best_price_american),
        trapInputs: {
          marketOppSteam: Number(c.market_opp_steam || 0),
          newsRisk: Number(c.news_risk || 0),
          outlierBooksOnly: Boolean(c.outlier_books_only),
          scheduleSpotBad: Number(c.schedule_spot_bad || 0),
          lowLimitsAtBest: Boolean(c.low_limits_best),
          publicVsHandleSkew: Number(c.public_vs_handle_skew || 0)
        },
        bankrollUnits: 10
      });
      if (decision.take) {
        toInsert.push({
          game_id: c.game_id, market: c.market, selection: c.selection,
          best_book: c.best_book, price_american: c.best_price_american,
          model_prob: c.model_prob, fair_american: c.fair_american,
          edge_ev: Number(decision.ev.toFixed(4)),
          kelly_fraction: Number((decision.stakeUnits/10).toFixed(3)),
          stake_units: decision.stakeUnits,
          trap_score: decision.trap,
          reasons: c.top_features ?? [],
          what_changes: c.red_flags ?? []
        });
      }
    }

    if (toInsert.length) {
      const { error: insErr } = await supabase.from('smart_picks').insert(toInsert);
      if (insErr) return res.status(500).json({ error: insErr.message });

      try {
        const est = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }).split('/');
        const dateStr = `${est[2]}-${est[0].padStart(2,'0')}-${est[1].padStart(2,'0')}`;

        const uiPicks = toInsert.map((p, i) => ({
          pick_id: `pick-${dateStr}-${p.game_id}-${i}`,
          pick: `${p.selection} ${p.market} @ ${p.price_american}`,
          time: 'TBD',
          type: p.market === 'ML' ? 'moneyline' : p.market.toLowerCase(),
          league: 'AUTO',
          awayTeam: '', homeTeam: '',
          confidence: Math.round(Number(p.model_prob) * 100) / 100,
          trapAlert: p.trap_score >= 60,
          rationale: (p.reasons || []).map(r => r.feature || r).join('; ')
        }));

        await supabase.from('daily_picks').delete().eq('date', dateStr);
        await supabase.from('daily_picks').insert({ date: dateStr, picks: uiPicks });
      } catch {}
    }

    return res.status(200).json({ published: toInsert.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}


