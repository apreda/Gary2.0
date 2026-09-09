#!/usr/bin/env node
/**
 * Gary's tools as a local MCP server over stdio (founder, Sep 9 2026: "do the
 * MCP upgrade ASAP").
 *
 * The Claude Code CLI and the Codex CLI both speak MCP natively. Each research
 * (or brain) process spawns THIS server as a child, calls tools/list once and
 * tools/call as the model asks, using the model's own trained tool calling —
 * no JSON-in-text protocol, no CLI spawn per tool turn. The tools answer from
 * the same routers the API brains use, so the evidence is byte-identical.
 *
 * Wire: newline-delimited JSON-RPC 2.0 on stdin/stdout. stdout carries
 * protocol messages ONLY; diagnostics go to stderr.
 *
 * Context: GARY_MCP_CONTEXT names a JSON file { sport, homeTeam, awayTeam,
 * gameDate, options, groundingCap, tools }. Every call is appended to
 * GARY_MCP_LOG (JSONL) so the caller can account for what was fetched.
 */
import { readFileSync, appendFileSync } from 'fs';
import { createInterface } from 'readline';

// stdout is the protocol channel. Every module below logs freely with
// console.log, so all console output moves to stderr BEFORE they load.
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...parts) => { try { process.stderr.write(`${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`); } catch { /* never throw from a log */ } };
}

const contextPath = process.env.GARY_MCP_CONTEXT;
if (!contextPath) { process.stderr.write('[gary-mcp] GARY_MCP_CONTEXT is required\n'); process.exit(2); }
const ctx = JSON.parse(readFileSync(contextPath, 'utf8'));
const logPath = process.env.GARY_MCP_LOG || null;

const { toolDefinitions, getTokensForSport } = await import('../toolDefinitions.js');
const { fetchStats } = await import('../statRouters/index.js');
const { summarizeStatForContext } = await import('../../orchestrator/orchestratorHelpers.js');

const sport = ctx.sport;
const sportLabel = String(sport || '').replace('basketball_', '').replace('americanfootball_', '').replace('icehockey_', '').replace('baseball_', '').toUpperCase();
const homeTeam = ctx.homeTeam;
const awayTeam = ctx.awayTeam;
const options = ctx.options || {};
const IMPLEMENTED = new Set(['fetch_stats', 'fetch_narrative_context', 'fetch_player_game_logs']);
const wanted = Array.isArray(ctx.tools) && ctx.tools.length ? new Set(ctx.tools) : null;
const tools = (toolDefinitions || [])
  .map((t) => t?.function || t)
  .filter((f) => f?.name && IMPLEMENTED.has(f.name) && (!wanted || wanted.has(f.name)))
  .map((f) => ({ name: f.name, description: String(f.description || ''), inputSchema: f.parameters || { type: 'object', properties: {} } }));

const statCache = new Map();
let groundingCalls = 0;
const groundingCap = Number.isFinite(Number(ctx.groundingCap)) ? Number(ctx.groundingCap) : 4;

function log(entry) {
  if (!logPath) return;
  try { appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`); } catch { /* accounting is best-effort */ }
}

async function runTool(name, args = {}) {
  const startedAt = Date.now();
  if (name === 'fetch_stats') {
    const token = args.token || args.stat_type;
    if (!token) return { text: 'Error: fetch_stats called without a "token" argument. Re-issue the call with a valid token name.', quality: 'unavailable' };
    const allowed = getTokensForSport(sportLabel);
    if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(token)) {
      log({ tool: name, token, quality: 'refused', ms: Date.now() - startedAt });
      return { text: `${token}: Not available for ${sportLabel}.`, quality: 'refused' };
    }
    if (statCache.has(token)) {
      log({ tool: name, token, quality: 'cached', ms: 0 });
      return { text: statCache.get(token), quality: 'cached' };
    }
    try {
      const result = await fetchStats(sport, token, homeTeam, awayTeam, options);
      const text = summarizeStatForContext(result, token, homeTeam, awayTeam, sport);
      const quality = result?.error ? 'unavailable' : 'available';
      if (quality === 'available') statCache.set(token, text);
      log({ tool: name, token, quality, chars: text.length, ms: Date.now() - startedAt });
      return { text, quality };
    } catch (error) {
      log({ tool: name, token, quality: 'unavailable', error: error.message, ms: Date.now() - startedAt });
      return { text: `Error fetching ${token}: ${error.message}`, quality: 'unavailable' };
    }
  }
  if (name === 'fetch_narrative_context') {
    const query = String(args.query || '');
    if (groundingCalls >= groundingCap) {
      log({ tool: name, query, quality: 'capped' });
      return { text: `Grounding call limit reached (${groundingCap}). Use available stat tokens and scout report data instead.`, quality: 'capped' };
    }
    groundingCalls += 1;
    try {
      const { openaiWebSearch } = await import('../../../pickdesk/webSearch.js');
      const result = await openaiWebSearch(query, { freshnessHours: 48 });
      const text = typeof result === 'string' ? result : (result?.data || result?.text || 'No results');
      log({ tool: name, query, quality: text && text !== 'No results' ? 'available' : 'unavailable', chars: text.length, ms: Date.now() - startedAt });
      return { text, quality: 'available' };
    } catch (error) {
      log({ tool: name, query, quality: 'unavailable', error: error.message, ms: Date.now() - startedAt });
      return { text: `Search error: ${error.message}`, quality: 'unavailable' };
    }
  }
  if (name === 'fetch_player_game_logs') {
    try {
      const { fetchPlayerGameLogEvidence } = await import('../playerGameLogTool.js');
      const evidence = await fetchPlayerGameLogEvidence({
        sport, player: args.player_name, homeTeam, awayTeam, numGames: args.num_games,
        season: options.researchSeason != null && options.researchSeason !== '' ? Number(options.researchSeason) : options.season,
        dataWindow: options.researchSeasonLabel,
      });
      log({ tool: name, token: `PLAYER_GAME_LOGS:${args.player_name}`, quality: evidence.quality, chars: String(evidence.content || '').length, ms: Date.now() - startedAt });
      return { text: evidence.content, quality: evidence.quality };
    } catch (error) {
      log({ tool: name, token: `PLAYER_GAME_LOGS:${args.player_name}`, quality: 'unavailable', error: error.message, ms: Date.now() - startedAt });
      return { text: JSON.stringify({ error: error.message, quality: 'unavailable' }), quality: 'unavailable' };
    }
  }
  return { text: `Unknown tool: ${name}`, quality: 'unavailable' };
}

function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg) {
  const { id, method, params = {} } = msg;
  if (method === 'initialize') {
    return reply(id, { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'gary', version: '1.0.0' } });
  }
  if (method === 'notifications/initialized' || String(method || '').startsWith('notifications/')) return; // no reply to notifications
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools });
  if (method === 'tools/call') {
    const name = params.name;
    const args = params.arguments || {};
    if (!tools.some((t) => t.name === name)) return reply(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true });
    const { text } = await runTool(name, args);
    return reply(id, { content: [{ type: 'text', text: String(text ?? '') }], isError: false });
  }
  if (id !== undefined) fail(id, -32601, `Method not found: ${method}`);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const t = line.trim();
  if (!t) return;
  let msg;
  try { msg = JSON.parse(t); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  handle(msg).catch((error) => { if (msg?.id !== undefined) fail(msg.id, -32603, error?.message || 'internal error'); });
});
rl.on('close', () => process.exit(0));
process.stdin.on('end', () => process.exit(0));
process.stderr.write(`[gary-mcp] ready: ${sportLabel} ${awayTeam} @ ${homeTeam}, tools ${tools.map((t) => t.name).join(', ')}\n`);
