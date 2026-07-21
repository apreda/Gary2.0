// Builds today's pick clip end-to-end from LIVE data: picks the day's highest-conviction play, asks the
// social pro-model for the two hook stats + caption + VO (grounded in the pick's real rationale), fetches
// the share card from prod, generates the voiceover, renders the MP4 into out/.
//   node make-pick-clip.cjs            -> out/pick-YYYY-MM-DD.mp4
//   node make-pick-clip.cjs --dry      -> prints the clip data, renders nothing
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function env() {
  const txt = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const e = {};
  for (const line of txt.split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  return e;
}
const E = env();
const MODEL = E.SOCIAL_GEMINI_MODEL || 'gemini-3.1-pro-preview';

function etDate() {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}
async function sbGet(q) {
  const r = await fetch(`${E.SUPABASE_URL}/rest/v1/${q}`, { headers: { apikey: E.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${E.SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!r.ok) throw new Error(`PostgREST ${r.status}`);
  return r.json();
}
async function llm(user) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': E.GEMINI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 8000, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const text = (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  return JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
}
const clean = (s) => String(s ?? '').replace(/\s*[—–]\s*/g, '. ').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();

async function main() {
  const dry = process.argv.includes('--dry');
  const today = etDate();
  const dp = await sbGet(`daily_picks?date=eq.${today}&select=picks`);
  const picks = (dp?.[0]?.picks ?? []).filter((p) => p.awayTeam && p.homeTeam);
  if (!picks.length) throw new Error('no picks for today yet');
  const chosen = [...picks].sort((a, b) => parseFloat(b.confidence ?? 0) - parseFloat(a.confidence ?? 0))[0];

  const out = await llm(`You are producing a 17-second vertical video for a sharp sports bettor character named Gary. From the REAL rationale below, extract the single strongest checkable stat AGAINST the opponent and the single strongest stat FOR the pick (or two contrasting real numbers). Return ONLY JSON:
{"s1":["LINE1","LINE2","NUMBER","LINE4"], "s2":["LINE1","LINE2","NUMBER"], "caption":"...", "vo":"..."}
s1 = hook against/setup: up to 3 short ALL-CAPS words per text line, the NUMBER alone on its own line (e.g. ["NORWAY","CONCEDES","2.0","GOALS A MATCH"]). s2 = the counter stat, same shape, NUMBER third (e.g. ["BRAZIL","GIVES UP","0.5"]). Numbers must be REAL numbers from the rationale, never invented.
caption = one casual first-person line stating the play ("I'm on the Brazil moneyline tonight.").
vo = 3 to 4 short spoken sentences, casual bettor talking to a friend, ending with EXACTLY these sentences: "The full read's free in the app. Win or lose, it's on my record." Use only facts from the rationale. No emojis, no dashes, no hashtags, no hype words, and never the words "graded", "model", or "data".
PICK: ${chosen.pick} (${chosen.odds ?? ''}) | ${chosen.awayTeam} @ ${chosen.homeTeam} | ${String(chosen.league ?? '').toUpperCase()}
RATIONALE (ground truth): ${String(chosen.rationale ?? '').slice(0, 4000)}`);

  // the share card straight from prod — same image the tweet carries
  const heroLines = String(chosen.pick).replace(/\s*\(?[+-]\d{3,}\)?\s*$/, '').split(/\s+/).map((w) => (/^ml$/i.test(w) ? 'MONEYLINE' : w.toUpperCase()));
  const league = String(chosen.league ?? 'MLB').toUpperCase();
  const cardUrl = `https://www.betwithgary.ai/api/share-card?hero=${encodeURIComponent(heroLines.join('|'))}&league=${encodeURIComponent(league)}&meta=${encodeURIComponent(`${chosen.awayTeam} @ ${chosen.homeTeam}`)}`;

  const clip = { s1: out.s1.map(clean), s2: out.s2.map(clean), caption: clean(out.caption), card: 'assets/card-today.png' };
  console.log(JSON.stringify({ pick: chosen.pick, clip, vo: clean(out.vo) }, null, 2));
  if (dry) return;

  const png = await fetch(cardUrl);
  fs.writeFileSync(path.join(__dirname, 'assets', 'card-today.png'), Buffer.from(await png.arrayBuffer()));

  // inject CLIP into a working copy of the template
  const html = fs.readFileSync(path.join(__dirname, 'clip-pick.html'), 'utf8')
    .replace(/window\.CLIP = window\.CLIP \|\| \{[\s\S]*?\};/, `window.CLIP = ${JSON.stringify(clip)};`);
  fs.writeFileSync(path.join(__dirname, 'clip-today.html'), html);

  execFileSync('node', ['voice.cjs', clean(out.vo), `out/vo-${today}.m4a`], { cwd: __dirname, stdio: 'inherit' });
  execFileSync('node', ['render.cjs', 'clip-today.html', `out/pick-${today}.mp4`, '--audio', `out/vo-${today}.m4a`], { cwd: __dirname, stdio: 'inherit' });
  console.log(`\nCLIP READY: out/pick-${today}.mp4`);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
