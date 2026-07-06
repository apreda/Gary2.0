// Gary's voiceover via Gemini TTS (GEMINI_API_KEY from ../.env). Interim voice until the founder's
// ElevenLabs account exists — then this swaps to a cloned/designed character voice, same interface.
// Usage: node voice.cjs "script text" out/vo.m4a [voiceName]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FFMPEG = '/opt/homebrew/bin/ffmpeg';
function env() {
  const txt = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const e = {};
  for (const line of txt.split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  return e;
}

const STYLE = 'Read this in a low, slightly gravelly, unhurried voice, like a confident middle-aged sports bettor talking to a friend at a bar. Casual, dry, a little smug. Never announcer-like: ';

async function main() {
  const [script, outFile, voiceName] = process.argv.slice(2);
  if (!script || !outFile) { console.error('usage: node voice.cjs "script" out/vo.m4a [voice]'); process.exit(1); }
  const key = env().GEMINI_API_KEY;
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent', {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: STYLE + '\n\n' + script }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Charon' } } },
      },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini TTS ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  const part = (j.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!part) throw new Error('no audio in response: ' + JSON.stringify(j).slice(0, 300));
  const mime = part.inlineData.mimeType || '';
  const rate = mime.match(/rate=(\d+)/)?.[1] || '24000';
  const raw = path.join(__dirname, 'frames', 'vo.pcm');
  fs.mkdirSync(path.dirname(raw), { recursive: true });
  fs.writeFileSync(raw, Buffer.from(part.inlineData.data, 'base64'));
  execFileSync(FFMPEG, ['-y', '-f', 's16le', '-ar', rate, '-ac', '1', '-i', raw, '-c:a', 'aac', '-b:a', '128k', outFile], { stdio: 'inherit' });
  console.log(`done: ${outFile} (${mime})`);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
