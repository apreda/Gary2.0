import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../supabase/functions/grade-results/index.ts', import.meta.url),
  'utf8',
);

describe('grade-results keeps settlement synchronous and recaps off the response path', () => {
  it('bounds the recap model call and registers one sequential recap queue with EdgeRuntime (Anthropic-only since Aug 24 2026)', () => {
    expect(source).toContain('signal: AbortSignal.timeout(30_000)');
    expect(source).toContain('recapCallAnthropic(');
    expect(source).not.toMatch(/gemini-\d/); // vendor retired — founder, Aug 24 2026
    expect(source).toContain('recapTasks.push({');
    expect(source).toContain('queueSequentialBackgroundTasks(');
    expect(source).toContain('EdgeRuntime.waitUntil(');
    expect(source).toContain('recap_queued: 0');
  });

  it('writes results and settles user bets before background work is registered', () => {
    const resultWrite = source.indexOf('const outcome = await writeResult({');
    const userBetSettle = source.indexOf('userBets = await settleUserBetsForDates(');
    const backgroundRegistration = source.indexOf('EdgeRuntime.waitUntil(');
    const response = source.lastIndexOf('return new Response(JSON.stringify({ ok: true');

    expect(resultWrite).toBeGreaterThan(-1);
    expect(userBetSettle).toBeGreaterThan(resultWrite);
    expect(backgroundRegistration).toBeGreaterThan(userBetSettle);
    expect(response).toBeGreaterThan(backgroundRegistration);
  });
});
