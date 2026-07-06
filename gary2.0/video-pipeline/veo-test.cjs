// Tier 2 probe: one Veo 3.1 generation of Gary the bear, image-referenced for character consistency.
// Usage: node veo-test.cjs "prompt text" out/veo-test.mp4 [--model veo-3.1-fast-generate-preview]
const fs = require('fs');
const path = require('path');

function env() {
  const txt = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const e = {};
  for (const line of txt.split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  return e;
}
const KEY = env().GEMINI_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [prompt, outFile] = process.argv.slice(2);
  const mIx = process.argv.indexOf('--model');
  const model = mIx > -1 ? process.argv[mIx + 1] : 'veo-3.1-fast-generate-preview';
  if (!prompt || !outFile) { console.error('usage: node veo-test.cjs "prompt" out.mp4'); process.exit(1); }

  const imageB64 = fs.readFileSync(path.join(__dirname, 'assets', 'GaryIconBG.png')).toString('base64');
  const start = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`, {
    method: 'POST',
    headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt, image: { bytesBase64Encoded: imageB64, mimeType: 'image/png' } }],
      parameters: { aspectRatio: '9:16', durationSeconds: 8 },
    }),
  });
  const op = await start.json();
  if (!start.ok) throw new Error(`start ${start.status}: ${JSON.stringify(op).slice(0, 500)}`);
  console.log('operation:', op.name);

  for (let i = 0; i < 60; i++) {
    await sleep(10000);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${op.name}`, { headers: { 'x-goog-api-key': KEY } });
    const j = await r.json();
    if (j.error) throw new Error('operation error: ' + JSON.stringify(j.error).slice(0, 400));
    if (j.done) {
      const vid = j.response?.generateVideoResponse?.generatedSamples?.[0]?.video
        ?? j.response?.generatedVideos?.[0]?.video ?? null;
      if (!vid) throw new Error('done but no video: ' + JSON.stringify(j.response ?? j).slice(0, 600));
      if (vid.bytesBase64Encoded) fs.writeFileSync(outFile, Buffer.from(vid.bytesBase64Encoded, 'base64'));
      else if (vid.uri) {
        const dl = await fetch(vid.uri.includes('key=') ? vid.uri : `${vid.uri}${vid.uri.includes('?') ? '&' : '?'}key=${KEY}`);
        fs.writeFileSync(outFile, Buffer.from(await dl.arrayBuffer()));
      } else throw new Error('unknown video shape: ' + JSON.stringify(vid).slice(0, 300));
      console.log(`done: ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB)`);
      return;
    }
    console.log(`  polling ${i + 1}...`);
  }
  throw new Error('timed out');
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
