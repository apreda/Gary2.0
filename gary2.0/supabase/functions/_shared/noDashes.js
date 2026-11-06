// No dashes as punctuation in anything a reader sees (Adam, Nov 6 2026). The models aren't told; this swaps the
// punctuation after they write. A dash between numbers becomes a hyphen; a hyphen in a word or a line ("Bills -3.5") stays.
const DASH = '[—–]+';
const GAP = '[ \\t]*';

export function noDashes(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(new RegExp(`(?<=\\d)${GAP}${DASH}${GAP}(?=\\d)`, 'g'), '-')
    .replace(/(?<=\d) - (?=\d)/g, '-')
    .replace(new RegExp(`(?<=[.,;:!?])${GAP}${DASH}${GAP}(?=\\S)`, 'g'), ' ')
    .replace(/(?<=[.,;:!?]) - (?=\S)/g, ' ')
    .replace(new RegExp(`(?<=\\S)${GAP}${DASH}${GAP}(?=\\S)`, 'g'), ', ')
    .replace(/(?<=\S) - (?=\S)/g, ', ')
    .replace(new RegExp(`^${GAP}${DASH}${GAP}`, 'gm'), '')
    .replace(new RegExp(`${GAP}${DASH}${GAP}$`, 'gm'), '');
}
