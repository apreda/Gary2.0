import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// writing.md (Adam, Sep 21 2026): no dashes as punctuation in anything a fan
// reads. The computers write headlines and details straight into the Hub, so
// their template strings are reader copy. Comments, console lines, model
// asks and the bare "—" placeholder for an empty cell are not.
const root = new URL('../../../src/services/insights/', import.meta.url).pathname;
const files = [
  ...readdirSync(join(root, 'computers')).filter(f => f.endsWith('.js')).map(f => join('computers', f)),
  'playerInsightCards.js', 'footballPlayerInsightCards.js', 'ncaafPlayerInsightCards.js',
  'leaguePulse.js', 'footballLeaguePulse.js',
];
const readerCopyDashLines = (source) => source.split('\n').flatMap((line, i) => {
  const s = line.trim();
  if (!/—|\s–\s/.test(line)) return []; // an en dash between numbers is a range (12–3), not punctuation
  if (s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) return [];
  if (/console\.(log|warn|error)/.test(line) || /\bask\s*[:=]/.test(line) || /\bprompt = `|`\$\{i\}\. /.test(line)) return [];
  const before = line.slice(0, line.search(/—|\s–\s/));
  if (before.includes('//') && !before.slice(0, before.indexOf('//')).includes('`')) return []; // trailing comment
  const inString = before.includes('`') || (before.split(/['"]/).length - 1) % 2 === 1;
  if (!inString) return [];
  if (/['"`]\s*[—–]\s*['"`]/.test(line) && !/[A-Za-z]{3}[^'"`]*[—–]|[—–][^'"`]*[A-Za-z]{3}/.test(s)) return []; // bare placeholder
  return [`${i + 1}: ${s.slice(0, 100)}`];
});

describe('computed reader copy carries no dash', () => {
  it.each(files)('%s', (file) => {
    expect(readerCopyDashLines(readFileSync(join(root, file), 'utf8'))).toEqual([]);
  });
});
