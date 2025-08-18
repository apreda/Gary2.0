import { createClient } from '@supabase/supabase-js';
import { buildGaryPrompt } from '../src/lib/storyPrompt.js';

export default async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!process.env.SUPABASE_URL || !serviceKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or service role key' });
  }
  const supabase = createClient(process.env.SUPABASE_URL, serviceKey);
  try {
    const { data: picks } = await supabase
      .from('smart_picks')
      .select('pick_id, market, selection, price_american, fair_american, model_prob, edge_ev, trap_score, reasons, what_changes')
      .is('narrative', null)
      .gte('created_at', new Date(Date.now() - 36e5).toISOString())
      .limit(8);

    if (!picks?.length) return res.status(200).json({ wrote: 0 });

    let wrote = 0;
    for (const p of picks) {
      const payload = {
        pick: `${p.selection} ${p.market} @ ${p.price_american}`,
        fair_line: p.fair_american,
        model_prob: Number(p.model_prob).toFixed(3),
        edge_ev: Number(p.edge_ev),
        trap_score: p.trap_score,
        signals: (p.reasons || []).map(r => r.feature || r),
        what_changes: (p.what_changes || []).map(r => r.feature || r)
      };
      const messages = buildGaryPrompt(payload);

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, temperature: 0.6 })
      });
      if (!resp.ok) continue;
      const json = await resp.json();
      const text = json?.choices?.[0]?.message?.content?.trim() || null;

      if (text) {
        const { error } = await supabase.from('smart_picks')
          .update({ narrative: text })
          .eq('pick_id', p.pick_id);
        if (!error) wrote++;
      }
    }
    res.status(200).json({ wrote });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}


