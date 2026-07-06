// Engine 1 Tier 1 renderer: steps a deterministic clip HTML frame-by-frame in headless Chrome and
// assembles the MP4 with ffmpeg. Usage:
//   node render.cjs clip-pick.html out/pick.mp4 [--audio out/vo.m4a] [--fps 30]
// The HTML must expose window.seek(tSeconds) and window.CLIP_DURATION.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

async function main() {
  const [htmlFile, outFile] = process.argv.slice(2);
  if (!htmlFile || !outFile) { console.error('usage: node render.cjs <clip.html> <out.mp4> [--audio vo.m4a] [--fps 30]'); process.exit(1); }
  const audioIx = process.argv.indexOf('--audio');
  const audio = audioIx > -1 ? process.argv[audioIx + 1] : null;
  const fpsIx = process.argv.indexOf('--fps');
  const fps = fpsIx > -1 ? parseInt(process.argv[fpsIx + 1]) : 30;

  const framesDir = path.join(__dirname, 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--force-device-scale-factor=1', '--hide-scrollbars'],
    defaultViewport: { width: 1080, height: 1920 },
  });
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(__dirname, htmlFile));
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate(() => window.CLIP_DURATION);
  const total = Math.ceil(duration * fps);
  console.log(`rendering ${total} frames @ ${fps}fps (${duration}s)`);

  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.seek(t), f / fps);
    await page.screenshot({ path: path.join(framesDir, `f_${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
    if (f % 60 === 0) console.log(`  frame ${f}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  await browser.close();

  const args = ['-y', '-framerate', String(fps), '-i', path.join(framesDir, 'f_%04d.jpg')];
  if (audio && fs.existsSync(audio)) args.push('-i', audio, '-c:a', 'aac', '-b:a', '128k');
  args.push('-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile);
  execFileSync(FFMPEG, args, { stdio: 'inherit' });
  console.log(`done: ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
