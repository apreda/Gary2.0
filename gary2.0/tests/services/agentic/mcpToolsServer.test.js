// GARY'S TOOLS OVER MCP (founder, Sep 9 2026: "do the MCP upgrade ASAP"). A
// CLI spawns this local stdio server and calls Gary's tools natively — no
// JSON-in-text protocol, no spawn per tool turn. The wire is newline-delimited
// JSON-RPC; stdout carries protocol messages only.
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GARY_MCP_SERVER_PATH, MCP_TOOL_NAMES, writeMcpContext, readMcpLog, serializableOptions } from '../../../src/services/agentic/tools/mcp/mcpContext.js';
import { parseCodexResetTime } from '../../../src/services/agentic/orchestrator/providerAdapters/codexHomes.js';

function rpc(messages, env, ms = 20000) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [GARY_MCP_SERVER_PATH], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', reject);
    p.on('close', () => resolve(out.split('\n').filter(Boolean).map((l) => JSON.parse(l))));
    for (const m of messages) p.stdin.write(`${JSON.stringify(m)}\n`);
    setTimeout(() => p.stdin.end(), ms);
  });
}

describe('the MCP tools server', () => {
  it('serves initialize, tools/list and a refused token over clean stdout, and logs the call', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gary-mcp-test-'));
    const contextPath = join(dir, 'ctx.json');
    const logPath = join(dir, 'calls.log');
    writeFileSync(contextPath, JSON.stringify({ sport: 'baseball_mlb', homeTeam: 'Detroit Tigers', awayTeam: 'Minnesota Twins', gameDate: '2026-09-09', options: {}, groundingCap: 0, tools: ['fetch_stats', 'fetch_narrative_context'] }));
    const replies = await rpc([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'vitest', version: '0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'fetch_stats', arguments: { token: 'NOT_A_TOKEN' } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'fetch_narrative_context', arguments: { query: 'anything' } } },
      { jsonrpc: '2.0', id: 5, method: 'nope' },
    ], { GARY_MCP_CONTEXT: contextPath, GARY_MCP_LOG: logPath }, 4000);
    const byId = Object.fromEntries(replies.map((r) => [r.id, r]));
    expect(byId[1].result.serverInfo.name).toBe('gary');
    expect(byId[1].result.capabilities.tools).toEqual({});
    expect(byId[2].result.tools.map((t) => t.name)).toEqual(['fetch_stats', 'fetch_narrative_context']);
    expect(byId[2].result.tools[0].inputSchema.type).toBe('object');
    expect(byId[3].result.content[0].text).toBe('NOT_A_TOKEN: Not available for MLB.');
    expect(byId[4].result.content[0].text).toContain('Grounding call limit reached (0)');
    expect(byId[5].error.code).toBe(-32601);
    expect(replies.find((r) => r.id === undefined)).toBeUndefined(); // notifications get no reply; nothing else leaks onto stdout
    expect(readMcpLog(logPath).map((e) => [e.tool, e.quality])).toEqual([['fetch_stats', 'refused'], ['fetch_narrative_context', 'capped']]);
  }, 30000);

  it('writes a context the routers can use and nothing they cannot serialize', () => {
    const ctx = writeMcpContext({ sport: 'americanfootball_nfl', homeTeam: 'Seattle Seahawks', awayTeam: 'New England Patriots', gameDate: '2026-09-09',
      options: { signal: new AbortController().signal, _costTracker: { addUsage() {} }, scoutReport: 'x'.repeat(30000), gameTime: '2026-09-10T00:20:00Z', spread: -2.5, fn: () => 1 } });
    expect(existsSync(ctx.contextPath)).toBe(true);
    const saved = JSON.parse(readFileSync(ctx.contextPath, 'utf8'));
    expect(saved.options).toEqual({ gameTime: '2026-09-10T00:20:00Z', spread: -2.5 });
    expect(saved.tools).toEqual([...MCP_TOOL_NAMES]);
    expect(serializableOptions({ a: 1, b: null })).toEqual({ a: 1, b: null });
  });

  it('reads the five-hour window reset ("try again at 7:30 PM") as today in ET', () => {
    const now = Date.parse('2026-09-09T19:31:00Z'); // 3:31 PM ET
    const reset = parseCodexResetTime("You've hit your usage limit. Upgrade to Pro, visit the usage page to purchase more credits or try again at 7:30 PM.", now);
    expect(new Date(reset).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })).toBe('7:30 PM');
    expect(reset - now).toBeLessThan(5 * 60 * 60 * 1000);
    const past = parseCodexResetTime('try again at 1:00 PM', now);
    expect(past).toBeGreaterThan(now);
  });
});
