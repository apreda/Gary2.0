/**
 * The subscription bridges' tool protocol (founder, Sep 3 2026: "go from 12
 * cents a game to free"; Sep 9 2026: "full research assistant, full Gary with
 * tools on the bridge, just like the June system").
 *
 * Neither headless CLI has function calling, so a session created WITH tools
 * carries the catalog as a strict JSON call protocol: a reply that is a
 * {"tool_calls":[…]} object comes back to the caller in the chat-completions
 * toolCalls shape the API adapters return, and the caller's function responses
 * ride back on the same thread as one TOOL RESULTS turn. Shared by the Codex
 * and Claude bridges so both brains and both researchers speak one contract.
 *
 * Parsing reads what the model actually sent. Sep 7-8 2026: Luna answered a
 * factor with TWO tool_calls objects back to back; the old first-brace-to-
 * last-brace slice failed to parse, the text was filed as findings, and eight
 * of eighteen briefings reached Gary with raw JSON where the research should
 * have been. Every complete top-level object is read; every call in every
 * tool_calls object is honored once.
 */

/** The tool catalog as text: name, purpose, parameters (JSON schema). */
export function renderCliToolProtocol(tools = []) {
  const catalog = (tools || []).map((t) => {
    const f = t?.function || t;
    return `- ${f.name}: ${String(f.description || '').replace(/\s+/g, ' ').trim()}\n  parameters: ${JSON.stringify(f.parameters || {})}`;
  }).join('\n');
  return `## TOOLS (call protocol)
This is not a coding session: there is no shell, no file system and no repository here. The ONLY tools are the ones listed below, and they run outside this conversation. To call one or more, reply with ONLY a JSON object — no prose before or after, no code fence — shaped exactly like this:
{"tool_calls":[{"name":"fetch_stats","arguments":{"token":"EXAMPLE_TOKEN"}}]}
Each call names a tool and gives its arguments as an object. You may put several calls in one reply. The results come back in the next message under TOOL RESULTS. When you have what you need, reply with your normal answer as text (no "tool_calls" key).
RULE: whenever you are asked to investigate a factor, your FIRST reply is the tool_calls object fetching what that factor needs — never findings written from memory or from the report alone. Write the findings only after the TOOL RESULTS arrive.

${catalog}`;
}

/** Caller's function responses → one TOOL RESULTS turn on the thread. */
export function formatCliFunctionResponses(responses = []) {
  const blocks = (responses || []).map((r) => `### ${r.name}\n${typeof r.content === 'string' ? r.content : JSON.stringify(r.content)}`);
  return `TOOL RESULTS\n\n${blocks.join('\n\n')}\n\nContinue: reply with another JSON tool_calls object if you need more, or write your answer as text.`;
}

/**
 * Every complete top-level JSON object in a text, in order. String-aware:
 * braces inside JSON strings do not open or close an object. A candidate
 * that does not parse is skipped and scanning resumes after its opening
 * brace, so prose containing a stray "{" cannot hide a later real object.
 */
export function jsonObjectsIn(text) {
  const s = String(text || '');
  const objects = [];
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf('{', i);
    if (start < 0) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let j = start; j < s.length; j += 1) {
      const ch = s[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) { end = j; break; }
      }
    }
    if (end < 0) { i = start + 1; continue; } // an unclosed brace (prose, or a truncated object): keep looking past it
    try {
      objects.push(JSON.parse(s.slice(start, end + 1)));
      i = end + 1;
    } catch {
      i = start + 1;
    }
  }
  return objects;
}

/**
 * A reply carrying tool_calls objects → chat-completions toolCalls; else null.
 * Several objects in one reply are one call list; an identical call named
 * twice is honored once.
 */
export function parseCliToolCalls(text, { idPrefix = 'cli_call' } = {}) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const objects = jsonObjectsIn(raw).filter((o) => o && Array.isArray(o.tool_calls) && o.tool_calls.length > 0);
  if (!objects.length) return null;
  const seen = new Set();
  const calls = [];
  for (const obj of objects) {
    for (const c of obj.tool_calls) {
      if (!c || typeof c.name !== 'string' || !c.name.trim()) continue;
      const args = c.arguments && typeof c.arguments === 'object' ? c.arguments : (c.args && typeof c.args === 'object' ? c.args : {});
      const key = `${c.name.trim()}:${JSON.stringify(args)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      calls.push({
        id: `${idPrefix}_${Date.now()}_${calls.length}`,
        type: 'function',
        function: { name: c.name.trim(), arguments: JSON.stringify(args) },
      });
    }
  }
  return calls.length ? calls : null;
}

export default { renderCliToolProtocol, formatCliFunctionResponses, jsonObjectsIn, parseCliToolCalls };
