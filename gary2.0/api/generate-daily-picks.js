import { createClient } from '@supabase/supabase-js';
import { picksService } from '../src/services/picksService.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ success: false, message: 'Missing SUPABASE_URL or service role key' });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // EST date for today in YYYY-MM-DD
  const now = new Date();
  const est = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' }).split('/');
  const today = `${est[2]}-${est[0].padStart(2,'0')}-${est[1].padStart(2,'0')}`;

  try {
    // Call existing generator (may attempt its own storage using anon key)
    let generated = [];
    try {
      generated = await picksService.generateDailyPicks();
    } catch (genErr) {
      // Proceed to manual storage path
      console.warn('[generate-daily-picks] picksService.generateDailyPicks error:', genErr?.message || genErr);
    }

    // Check if daily_picks already populated
    const { data: existing, error: readErr } = await supabase
      .from('daily_picks')
      .select('picks, date')
      .eq('date', today)
      .maybeSingle();

    if (!readErr && existing?.picks && Array.isArray(existing.picks) ? existing.picks.length : (existing?.picks ? JSON.parse(existing.picks || '[]').length : 0)) {
      const count = Array.isArray(existing.picks) ? existing.picks.length : JSON.parse(existing.picks).length;
      return res.status(200).json({ success: true, message: 'Picks already present', generatedCount: count });
    }

    // Build minimal picks payload from generated output if storage above didn't happen
    const array = Array.isArray(generated) ? generated : [];
    const minimal = array.map((pick, idx) => {
      const raw = pick?.rawAnalysis || pick || {};
      const idStr = `pick-${today}-${raw.league || 'sport'}-${(raw.pick || '').toString().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'') || idx}`;
      return {
        id: pick?.pick_id || pick?.id || idStr,
        pick_id: pick?.pick_id || pick?.id || idStr,
        pick: raw.pick || pick.pick || '',
        type: raw.type || pick.type || 'moneyline',
        league: raw.league || pick.league || '',
        confidence: raw.confidence || pick.confidence || 0,
        rationale: raw.rationale || pick.rationale || '',
        trapAlert: raw.trapAlert || false,
        revenge: raw.revenge || false,
        momentum: raw.momentum || 0,
        homeTeam: raw.homeTeam || pick.homeTeam || '',
        awayTeam: raw.awayTeam || pick.awayTeam || '',
        time: raw.time || pick.time || ''
      };
    }).filter(p => p.pick && p.rationale);

    // Upsert daily row
    try {
      await supabase.from('daily_picks').delete().eq('date', today);
    } catch {}

    if (minimal.length) {
      const { error: insErr } = await supabase
        .from('daily_picks')
        .insert({ date: today, picks: minimal });
      if (insErr) {
        return res.status(500).json({ success: false, message: `Insert failed: ${insErr.message}` });
      }
      return res.status(200).json({ success: true, generatedCount: minimal.length, message: 'Generated and stored' });
    }

    return res.status(200).json({ success: true, generatedCount: 0, message: 'No picks generated' });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Unknown error' });
  }
}


