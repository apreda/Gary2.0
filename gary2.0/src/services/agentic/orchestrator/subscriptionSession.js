import { createClaudeCliSession, sendToClaudeCliSession, resetClaudeCliSessionChat } from './providerAdapters/claudeCliSession.js';
import { createCodexCliSession, sendToCodexCliSession, resetCodexCliSessionChat } from './providerAdapters/codexCliSession.js';
import { deepseekOneShot } from './providerAdapters/deepseekSession.js';
import { formatCliFunctionResponses, renderCliToolProtocol, parseCliToolCalls } from './providerAdapters/cliToolProtocol.js';
import { subscriptionRoutes } from './subscriptionRoutes.js';
import { availableCodexHomes, restrictCodexHomes } from './providerAdapters/codexHomes.js';

// A GPT login capped until its reset fails in a millisecond, so it holds no
// share of the turn's time. Sep 22 2026: with both logins capped, the Claude
// rung got a quarter of the deadline (150 s of 600) and timed out on long
// props and darts calls while half the deadline sat reserved for nothing.
function routeCanAnswer(route) {
  if (route.model === 'deepseek' || route.model.startsWith('claude-')) return true;
  const homes = availableCodexHomes(route.codexHomes ? { homes: route.codexHomes } : {});
  return restrictCodexHomes(homes, { allowPersonalAccount: route.allowPersonalAccount === true }).length > 0;
}

export function createSubscriptionSession(options = {}) {
  return { provider: 'subscription-cascade', modelName: options.modelName, options,
    routes: options.subscriptionRoutes || subscriptionRoutes(options.modelName, { tier: options.breakerLane === 'research' || options.breakerLane === 'content' ? 'light' : 'heavy' }),
    routeIndex: 0, current: null, history: [], signal: options.signal, errors: [] };
}
export function resetSubscriptionSession(session, history = []) {
  session.current = null;
  session.history = [...history];
}
export async function sendToSubscriptionSession(session, message, options = {}) {
  const signal = options.signal || session.signal;
  const text = options.isFunctionResponse && Array.isArray(message) ? formatCliFunctionResponses(message) : typeof message === 'string' ? message : JSON.stringify(message);
  const deadline = Date.now() + (options.timeoutMs || session.options.timeoutMs || 600000);
  for (; session.routeIndex < session.routes.length; session.routeIndex++) {
    signal?.throwIfAborted();
    const route = session.routes[session.routeIndex];
    const remaining = deadline - Date.now();
    if (remaining <= 0) { session.errors.push('Turn deadline exhausted'); break; }
    const live = session.routes.slice(session.routeIndex).filter(routeCanAnswer).length;
    const budget = Math.max(1, Math.floor(remaining / Math.max(1, live)));
    const timer = AbortSignal.timeout(budget);
    const routeSignal = signal ? AbortSignal.any([signal, timer]) : timer;
    try {
      const common = { ...session.options, ...route, modelName: route.model, signal: routeSignal, timeoutMs: budget };
      let response;
      if (route.model === 'deepseek') {
        if (session.options.browse && !session.options.tools?.length) throw new Error('DeepSeek has no configured search transport');
        const history = session.history.map(h => `${h.role}: ${(h.parts || []).map(p => p.text || '').join('\n')}`).join('\n');
        const result = await deepseekOneShot(`${history}\nUSER:\n${text}`, { ...common,
          systemPrompt: `${common.systemPrompt || ''}\n${renderCliToolProtocol(common.tools || [])}` });
        if (!result.success) throw new Error(result.error);
        const calls = common.tools?.length ? parseCliToolCalls(result.data) : null;
        response = { content: calls?.length ? null : result.data, toolCalls: calls || [], transcriptText: result.data, usage: result.usage, finishReason: calls?.length ? 'tool_calls' : 'stop' };
      } else {
        const claude = route.model.startsWith('claude-');
        if (!session.current) {
          session.current = await (claude ? createClaudeCliSession : createCodexCliSession)(common);
          if (session.history.length) (claude ? resetClaudeCliSessionChat : resetCodexCliSessionChat)(session.current, session.history);
        }
        session.current.signal = routeSignal;
        response = await (claude ? sendToClaudeCliSession : sendToCodexCliSession)(session.current, message, { ...options, signal: routeSignal });
      }
      if (!response?.content && !response?.toolCalls?.length) throw new Error('Empty model response');
      session.modelName = route.model;
      session.history.push({ role: 'user', parts: [{ text }] }, { role: 'model', parts: [{ text: response.transcriptText ?? response.content ?? '' }] });
      return { ...response, model: route.model, accountRoute: route.id };
    } catch (error) {
      signal?.throwIfAborted();
      if (error.code === 'required_data_unavailable') throw error;
      session.errors.push(`${route.id}: ${error.message}`);
      session.current = null;
      console.warn(`[Subscription cascade] ${route.id} failed: ${error.message}`);
    }
  }
  throw Object.assign(new Error(`All authorized model routes failed: ${session.errors.join('; ')}`), { code: 'MODEL_ROUTES_EXHAUSTED', isQuotaError: true });
}
