import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasSheetAccess } from './auth.js';

test('absent, empty or whitespace-only configured tokens always fail closed', () => {
  for (const configured of [undefined, null, '', '   ']) {
    for (const supplied of [undefined, null, '', '   ', 'wrong']) assert.equal(hasSheetAccess(configured, supplied), false);
  }
});

test('only the exact configured private token grants access', () => {
  assert.equal(hasSheetAccess('private-fixture-token', 'private-fixture-token'), true);
  for (const wrong of [undefined, null, '', 'wrong', 'private-fixture-token ', 'PRIVATE-FIXTURE-TOKEN']) {
    assert.equal(hasSheetAccess('private-fixture-token', wrong), false);
  }
});

test('deployment preserves the private browser/cron auth contract that regressed', () => {
  const config = readFileSync(new URL('../../config.toml', import.meta.url), 'utf8');
  const section = config.split('[functions.engagement-sheet]')[1]?.split(/^\[/m)[0];
  assert.match(section ?? '', /^verify_jwt\s*=\s*false\s*$/m);
  const handler = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.ok(handler.indexOf('if (!hasSheetAccess(SHEET_TOKEN, token))') < handler.indexOf('if (url.searchParams.get("generate")'));
});
