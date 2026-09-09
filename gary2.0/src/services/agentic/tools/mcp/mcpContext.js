/**
 * The hand-off between a Gary process and the MCP tools server it spawns
 * through a CLI (Sep 9 2026): a context file the server reads at startup and
 * a JSONL log the caller reads back to account for what was fetched.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

export const GARY_MCP_SERVER_PATH = fileURLToPath(new URL('./garyToolsServer.js', import.meta.url));
export const MCP_TOOL_NAMES = Object.freeze(['fetch_stats', 'fetch_narrative_context', 'fetch_player_game_logs']);

const DROP = new Set(['signal', '_costTracker', 'scoutReport', 'prebuiltScoutReport', 'prebuiltResearchBriefing', 'mlbExpectationMemory', 'game', 'messages']);

export function mcpDir() {
  const dir = join(tmpdir(), 'gary-mcp');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Only what the routers need travels: no signals, no trackers, no desk. */
export function serializableOptions(options = {}) {
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(options, (key, value) => {
    if (DROP.has(key) || typeof value === 'function') return undefined;
    if (typeof value === 'string' && value.length > 20000) return undefined;
    if (value && typeof value === 'object') {
      if (seen.has(value)) return undefined;
      seen.add(value);
    }
    return value;
  }) || '{}');
}

export function writeMcpContext({ sport, homeTeam, awayTeam, gameDate = null, options = {}, groundingCap = 4, tools = MCP_TOOL_NAMES, label = 'research' }) {
  const id = `${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const contextPath = join(mcpDir(), `${id}.json`);
  const logPath = join(mcpDir(), `${id}.log`);
  writeFileSync(contextPath, JSON.stringify({ sport, homeTeam, awayTeam, gameDate, options: serializableOptions(options), groundingCap, tools: [...tools] }));
  return { contextPath, logPath, tools: [...tools] };
}

export function readMcpLog(logPath) {
  if (!logPath || !existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function removeMcpFiles(...paths) {
  for (const p of paths) { try { if (p && existsSync(p)) unlinkSync(p); } catch { /* best effort */ } }
}

export default { GARY_MCP_SERVER_PATH, MCP_TOOL_NAMES, writeMcpContext, readMcpLog, removeMcpFiles, serializableOptions };
