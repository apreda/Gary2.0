// TWO CHATGPT LOGINS ON THE CODEX BRIDGE (founder, Sep 9 2026): the Pro login
// capped until Sep 15 and a second account was created. Each login is its own
// CODEX_HOME; a capped login is skipped for new work until the reset the CLI
// names; a thread stays on the login that started it.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverCodexHomes, parseCodexResetTime, markCodexHomeCapped, isCodexHomeCapped, availableCodexHomes, codexHomeLabel, _resetCodexHomeCaps } from '../../../src/services/agentic/orchestrator/providerAdapters/codexHomes.js';

describe('Codex logins', () => {
  beforeEach(() => _resetCodexHomeCaps());

  it('discovers the default home first, then every ~/.codex-* login, and honors GARY_CODEX_HOMES', () => {
    const home = mkdtempSync(join(tmpdir(), 'gary-homes-'));
    for (const name of ['.codex', '.codex-plus', '.codex-empty']) mkdirSync(join(home, name));
    writeFileSync(join(home, '.codex', 'auth.json'), '{}');
    writeFileSync(join(home, '.codex-plus', 'auth.json'), '{}');
    expect(discoverCodexHomes({ env: {}, home })).toEqual([join(home, '.codex'), join(home, '.codex-plus')]);
    expect(discoverCodexHomes({ env: { GARY_CODEX_HOMES: '/a, /b,/a' }, home })).toEqual(['/a', '/b']);
    expect(codexHomeLabel(join(home, '.codex-plus'))).toBe('codex-plus');
    expect(codexHomeLabel(join(home, '.codex'))).toBe('codex');
  });

  it("reads the reset time from the CLI's own message and caps for an hour without one", () => {
    const now = Date.parse('2026-09-09T18:00:00Z');
    const reset = parseCodexResetTime("You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Sep 15th, 2026 11:17 AM.", now);
    expect(new Date(reset).getMonth()).toBe(8);
    expect(new Date(reset).getDate()).toBe(15);
    expect(parseCodexResetTime('usage limit reached', now)).toBeNull();
    expect(markCodexHomeCapped('/h1', 'usage limit reached', now)).toBe(now + 60 * 60 * 1000);
    expect(isCodexHomeCapped('/h1', now)).toBe(true);
    expect(isCodexHomeCapped('/h1', now + 61 * 60 * 1000)).toBe(false);
  });

  it('new work skips a capped login and prefers the login a thread already used', () => {
    const homes = ['/pro', '/plus'];
    expect(availableCodexHomes({ homes })).toEqual(['/pro', '/plus']);
    markCodexHomeCapped('/pro', 'try again at Sep 15th, 2026 11:17 AM', Date.parse('2026-09-09T18:00:00Z'));
    expect(availableCodexHomes({ homes, now: Date.parse('2026-09-09T18:00:00Z') })).toEqual(['/plus']);
    expect(availableCodexHomes({ homes, preferred: '/plus', now: Date.parse('2026-09-16T18:00:00Z') })).toEqual(['/plus', '/pro']);
  });
});
