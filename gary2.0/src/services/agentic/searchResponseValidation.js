/** Recognize explicit non-answers; this does not judge factual accuracy. */
export function searchResponseProblem(text) {
  const value = String(text || '').trim();
  if (!value) return 'empty search answer';
  // Cached bridge responses may include a progress paragraph before the
  // terminal answer. A request for the task is not research about that task.
  const terminal = value.split(/\n\s*\n/).at(-1).trim();
  if (/^what would you like me to (?:research|do|search|look up)\b/i.test(terminal) ||
      /^(?:please|could you|can you) (?:provide|specify|share) (?:the|a|your) (?:topic|task|question|team|company|file)\b/i.test(terminal)) {
    return 'clarification instead of the requested research';
  }
  const direct = terminal.replace(/^(?:(?:i['’]m|i am) sorry|sorry)[,!.\s—-]*(?:but\s+)?/i, '');
  if (/^i (?:cannot|can['’]t|am unable to) (?:browse\b|search (?:the )?(?:web|internet)\b|access (?:live|current|real[- ]time) (?:web|internet|information|data)\b)/i.test(direct) ||
      /^i (?:do not|don['’]t) have (?:access to |live |real[- ]time )*(?:web|internet|browsing) access\b/i.test(direct) ||
      /^i (?:cannot|can['’]t|am unable to) (?:complete|fulfi[ll]+|provide) (?:this|your|the requested) (?:research|request|task)\b/i.test(direct)) {
    return 'search refusal instead of factual research';
  }
  return null;
}
