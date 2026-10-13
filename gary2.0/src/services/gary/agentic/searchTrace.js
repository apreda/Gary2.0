// Preserve provider tool receipts only. Generated assistant text, tool inputs,
// and a model's own citation list cannot prove that a source was retrieved.
export function retrievedSearchRecords(raw) {
  const records = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value.type === 'item.started' || value.type === 'assistant' || value.type === 'result' || value.type === 'agent_message') return;
    if (value.type === 'item.completed' && value.item?.type === 'mcp_tool_call') {
      const result = value.item.result;
      const url = result?._meta?.browser_use?.url;
      const content = (result?.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n');
      if (!result?.isError && /^https:\/\//.test(url || '') && content.trim()) {
        records.push({ type: 'web_fetch_tool_result', url, content });
      }
      return;
    }
    if (value.item?.type === 'web_search') {
      if (!value.type || value.type === 'item.completed') records.push(value);
      return;
    }
    if (['web_search', 'web_search_result', 'web_search_tool_result', 'web_fetch_tool_result', 'tool_result'].includes(value.type)) {
      if (!value.is_error) records.push(value);
      return;
    }
    // Claude stream-json carries tool results in user message content.
    if (value.type === 'user') { visit(value.message?.content); return; }
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  };
  if (typeof raw === 'string') {
    for (const line of raw.split('\n')) { try { visit(JSON.parse(line)); } catch { /* no receipt */ } }
  } else visit(raw);
  return records;
}
