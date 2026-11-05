import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { creditSweepOpen } from '../../../src/services/gary/agentic/orchestrator/apiCreditSweep.js';
import { subscriptionRoutes } from '../../../src/services/gary/agentic/orchestrator/subscriptionRoutes.js';

let dir;
let ledger;
const spend = (...rows) => writeFileSync(ledger, rows.map(([at, cost]) => JSON.stringify({ at, model: 'claude-api-opus-5-5', api_cost_usd: cost })).join('\n') + '\n');
const env = () => ({ ANTHROPIC_API_KEY: 'fixture', GARY_USAGE_LEDGER: ledger });
const claudeOrder = (now, tier = 'heavy') => subscriptionRoutes('claude-opus-5-5', { tier, env: env(), home: dir, now }).map(r => r.id).filter(id => id.startsWith('claude-'));
const IN_WINDOW = new Date('2026-12-10T17:00:00Z');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'credit-sweep-'));
  ledger = join(dir, 'model-usage.jsonl');
  spend(['2026-11-20T12:00:00Z', 50]);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the API credit sweep', () => {
  it('keeps the normal order until the last three days before the credit arrives', () => {
    expect(claudeOrder(new Date('2026-12-08T17:00:00Z'))).toEqual(['claude-subscription', 'claude-api']);
    expect(claudeOrder(new Date('2026-12-12T17:00:00Z'))).toEqual(['claude-subscription', 'claude-api']);
  });

  it('runs heavy work on what is left of the credit first in those days', () => {
    expect(claudeOrder(IN_WINDOW)).toEqual(['claude-api', 'claude-subscription']);
  });

  it('leaves the GPT logins behind Claude during the sweep', () => {
    const routes = subscriptionRoutes('claude-opus-5-5', { tier: 'heavy', env: env(), home: dir, now: IN_WINDOW });
    expect(routes.slice(2).every(r => r.model.startsWith('codex-'))).toBe(true);
  });

  it('never moves background work onto the credit', () => {
    const routes = subscriptionRoutes('claude-sonnet-5-5', { env: env(), home: dir, now: IN_WINDOW });
    expect(routes.map(r => r.id)).not.toContain('claude-api');
  });

  it('stays closed when the credit is already spent', () => {
    spend(['2026-11-20T12:00:00Z', 120], ['2026-12-01T12:00:00Z', 76]);
    expect(creditSweepOpen({ env: env(), now: IN_WINDOW })).toBe(false);
  });

  it('counts only this cycle, so last month\'s spending does not close it', () => {
    spend(['2026-11-11T12:00:00Z', 200], ['2026-11-13T12:00:00Z', 10]);
    expect(creditSweepOpen({ env: env(), now: IN_WINDOW })).toBe(true);
  });

  it('reads the cycle across the new year', () => {
    spend(['2026-12-20T12:00:00Z', 200]);
    expect(creditSweepOpen({ env: env(), now: new Date('2027-01-10T17:00:00Z') })).toBe(false);
  });

  it('goes by the Eastern calendar', () => {
    expect(creditSweepOpen({ env: env(), now: new Date('2026-12-12T03:00:00Z') })).toBe(true);
    expect(creditSweepOpen({ env: env(), now: new Date('2026-12-12T06:00:00Z') })).toBe(false);
  });

  it('keeps the normal order when the ledger cannot be read or the switch is off', () => {
    expect(creditSweepOpen({ env: { GARY_USAGE_LEDGER: join(dir, 'missing.jsonl') }, now: IN_WINDOW })).toBe(false);
    expect(creditSweepOpen({ env: { ...env(), GARY_CREDIT_SWEEP: 'off' }, now: IN_WINDOW })).toBe(false);
  });

  it('adds no credit route when the API route is switched off', () => {
    const routes = subscriptionRoutes('claude-opus-5-5', { tier: 'heavy', env: { ...env(), GARY_CLAUDE_API: 'off' }, home: dir, now: IN_WINDOW });
    expect(routes[0].id).toBe('claude-subscription');
    expect(routes.map(r => r.id)).not.toContain('claude-api');
  });
});
