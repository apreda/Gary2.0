export function buildGaryPrompt(payload) {
  const { pick, fair_line, model_prob, edge_ev, trap_score, signals = [], what_changes = [] } = payload || {};
  const signalsList = signals.length ? `- ${signals.join('\n- ')}` : '- (none)';
  const changesList = what_changes.length ? `- ${what_changes.join('\n- ')}` : '- (none)';
  return [
    { role: 'system', content: 'You are Gary, a sharp but skeptical bettor. Be concise, street-smart, transparent. Avoid fluff.' },
    { role: 'user', content:
`Gary, explain this pick in your voice.
Pick: ${pick}
Fair vs current: ${fair_line} vs market
Model prob: ${model_prob}
EV: ${typeof edge_ev === 'number' ? (edge_ev * 100).toFixed(1) : edge_ev}%
Trap score: ${trap_score}/100
Signals:\n${signalsList}
What changes your mind:\n${changesList}

Guidelines:
- Reference signals plainly (fatigue, weather, bullpen, platoons).
- Mention fair line vs market and why that’s an edge.
- If trap_score > 60, warn and note reduced stake.
- Be specific, not robotic. 3–6 tight sentences.` }
  ];
}


