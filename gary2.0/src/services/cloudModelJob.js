import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cascadeRead } from './agentic/orchestrator/modelCascade.js';
import { subscriptionSearch } from './agentic/orchestrator/subscriptionSearch.js';
import { subscriptionRoutes, BACKGROUND_GPT } from './agentic/orchestrator/subscriptionRoutes.js';
import { codexCliOneShot } from './agentic/orchestrator/providerAdapters/codexCliSession.js';

// A text-only route can answer a tool-shaped request in tool-call markup
// (<parameter name="x">...</parameter>) instead of JSON: Sonnet 5.5 did on
// Sep 29 2026 and the free pick failed to post. Read either form.
function parseToolOutput(text, schema) {
  const start = text.indexOf('{');
  if (start >= 0) return JSON.parse(text.slice(start, text.lastIndexOf('}') + 1));
  const input = {};
  for (const m of text.matchAll(/<parameter name="([^"]+)">([\s\S]*?)<\/parameter>/g)) {
    const type = schema?.properties?.[m[1]]?.type;
    input[m[1]] = type && type !== 'string' ? JSON.parse(m[2]) : m[2].trim();
  }
  if (!Object.keys(input).length) throw new Error(`Model output had no JSON or tool parameters: ${text.slice(0, 200)}`);
  return input;
}

export async function executeCloudModelJob(job) {
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
  if (schema) systemPrompt += `\nThis transport has no tools. Reply with only one JSON object matching this schema exactly: ${JSON.stringify(schema)}`;
  // A job's own effort ask wins (book-slip-scan sends low); unstated means low.
  const options = { model: request.model || BACKGROUND_GPT, systemPrompt, timeoutMs, effort: request.output_config?.effort || 'low', tier: 'light' };
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
  if(outputTool){const input=parseToolOutput(String(result.data).trim(), schema);content=[{type:'tool_use',id:`job_${job.id}`,name:outputTool.name,input}];stop_reason='tool_use';}
  return { response: { content,stop_reason,model:result.model || result.transport }, route: result.accountRoute || result.transport || result.model };
}
