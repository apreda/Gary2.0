import { mkdtemp, writeFile, rm, access, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { cascadeRead } from './agentic/orchestrator/modelCascade.js';
import { subscriptionSearch } from './agentic/orchestrator/subscriptionSearch.js';
import { subscriptionRoutes } from './agentic/orchestrator/subscriptionRoutes.js';
import { codexCliOneShot } from './agentic/orchestrator/providerAdapters/codexCliSession.js';

const execFileAsync = promisify(execFile);
// Gary's voice: scripts/gary-voice/say.py in its own uv venv (Qwen3-TTS via
// mlx-audio). Contract: exit 0 and a WAV at --out.
const VOICE_DIR = fileURLToPath(new URL('../../scripts/gary-voice/', import.meta.url));
const VOICE_PYTHON = join(VOICE_DIR, '.venv/bin/python');
const VOICE_SCRIPT = join(VOICE_DIR, 'say.py');
const VOICE_BUCKET = 'gary-voice';
const easternDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
let storageClient;
function storage() {
  if (!storageClient) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('gary-voice: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unavailable to the worker');
    storageClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return storageClient;
}

/** Lane 'gary-voice': render request.text with say.py, store the WAV, answer a one-hour signed URL. */
async function renderGaryVoice(job) {
  const text = String(job.request?.text ?? '').trim();
  if (!text) throw new Error('gary-voice: request.text is empty');
  const timeoutMs = Date.parse(job.expires_at) - Date.now();
  if (timeoutMs <= 0) throw new Error('Job expired before execution');
  await access(VOICE_SCRIPT).catch(() => { throw new Error(`gary-voice: say.py missing at ${VOICE_SCRIPT}`); });
  await access(VOICE_PYTHON).catch(() => { throw new Error(`gary-voice: renderer venv missing at ${VOICE_PYTHON}`); });
  const directory = await mkdtemp(join(tmpdir(), 'gary-voice-'));
  try {
    const out = join(directory, `${job.id}.wav`);
    try {
      await execFileAsync(VOICE_PYTHON, [VOICE_SCRIPT, '--text', text, '--out', out], {
        cwd: VOICE_DIR, timeout: Math.max(5000, timeoutMs - 3000), maxBuffer: 8 * 1024 * 1024, env: { ...process.env },
      });
    } catch (error) {
      const tail = String(error.stderr || error.message || '').trim().split('\n').slice(-3).join(' | ').slice(0, 600);
      throw new Error(error.killed ? `gary-voice: renderer timed out after ${Math.round(timeoutMs / 1000)}s` : `gary-voice: renderer failed: ${tail}`);
    }
    const wav = await readFile(out).catch(() => { throw new Error('gary-voice: renderer exited 0 but wrote no file at --out'); });
    if (wav.length < 64) throw new Error('gary-voice: renderer wrote an empty file');
    const path = `${easternDay.format(new Date())}/${job.id}.wav`;
    const bucket = storage().storage.from(VOICE_BUCKET);
    const { error: uploadError } = await bucket.upload(path, wav, { contentType: 'audio/wav', upsert: true });
    if (uploadError) throw new Error(`gary-voice: upload failed: ${uploadError.message}`);
    const { data, error: signError } = await bucket.createSignedUrl(path, 3600);
    if (signError || !data?.signedUrl) throw new Error(`gary-voice: signed URL failed: ${signError?.message || 'no url'}`);
    return { response: { audio_url: data.signedUrl, path, bytes: wav.length }, route: 'gary-voice' };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function executeCloudModelJob(job) {
  if (job.lane === 'gary-voice') return renderGaryVoice(job);
  const request = job.request;
  const timeoutMs = Date.parse(job.expires_at) - Date.now();
  if (timeoutMs <= 0) throw new Error('Job expired before execution');
  const images = [];
  const prompt = (request.messages || []).map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : (m.content || []).map(c => {
    if (c.type === 'image') { images.push(c.source); return '[Attached source image]'; }
    return c.text || '';
  }).join('\n')}`).join('\n');
  let systemPrompt = typeof request.system === 'string' ? request.system : (request.system || []).map(p => p.text || '').join('\n');
  const outputTool = (request.tools || []).find(t => t.name === request.tool_choice?.name);
  const schema = outputTool?.input_schema || request.output_config?.format?.schema;
  if (schema) systemPrompt += `\nReturn JSON matching this schema exactly: ${JSON.stringify(schema)}`;
  // A job's own effort ask wins (book-slip-scan sends low); unstated means low.
  const options = { model: request.model || 'claude-sonnet-5', systemPrompt, timeoutMs, effort: request.output_config?.effort || 'low', tier: 'light' };
  let result;
  if (images.length) {
    // Claude's current text bridge and DeepSeek's configured endpoint have no
    // verified image transport. Never silently treat this as a text-only job.
    const directory = await mkdtemp(join(tmpdir(), 'gary-slip-'));
    try {
      const paths = [];
      for (const [i, image] of images.entries()) {
        if (image.type !== 'base64' || !['image/jpeg','image/png','image/webp','image/gif'].includes(image.media_type)) throw new Error('Unsupported image source');
        const path = join(directory, `${i}.${image.media_type.split('/')[1]}`);
        await writeFile(path, Buffer.from(image.data, 'base64'), { mode: 0o600 }); paths.push(path);
      }
      const errors = ['Claude subscription: image input transport unavailable'];
      const routes = subscriptionRoutes('codex-gpt-5.6-sol', {tier:'light'}).filter(r=>r.model.startsWith('codex-'));
      const deadline = Date.now() + timeoutMs;
      for (const [i, route] of routes.entries()) {
        result = await codexCliOneShot(prompt, { ...options, ...route, model: route.model.replace(/^codex-/,''), imagePaths: paths, timeoutMs: Math.max(1,Math.floor((deadline-Date.now())/(routes.length-i))) });
        if (result.success) { result.accountRoute=route.id; result.model=route.model; break; }
        errors.push(`${route.id}: ${result.error}`);
      }
      if (!result?.success) throw new Error(errors.join('; ') + '; DeepSeek image transport unavailable');
    } finally { await rm(directory, { recursive:true, force:true }); }
  } else if ((request.tools || []).some(t => /web_search/.test(t.type || ''))) {
    // A job that supplies its own facts (the game story's box score) marks
    // retrieval optional, so a route with no search still answers. The first
    // route keeps most of the window rather than a four-way slice.
    result = await subscriptionSearch(`${systemPrompt}\n${prompt}`, { ...options, primaryTimeoutMs: Math.floor(timeoutMs * 0.6),
      ...(request.require_retrieval === false ? { requireRetrieval: false } : {}) });
  } else result = await cascadeRead(prompt, options);
  if (!result?.success) throw new Error(result?.error || 'No model result');
  let content=[{type:'text',text:result.data}], stop_reason='end_turn';
  if(outputTool){const text=String(result.data).trim();const input=JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1));content=[{type:'tool_use',id:`job_${job.id}`,name:outputTool.name,input}];stop_reason='tool_use';}
  return { response: { content,stop_reason,model:result.model || result.transport }, route: result.accountRoute || result.transport || result.model };
}
