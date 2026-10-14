// "Why it made the board" comes from the selection itself (founder, Sep 23
// 2026: "if we're going to select what makes the board, we should be able to say
// the reasons why it made the board at the same time"). Each selector asks for
// the reasons in the same pass that admits the play; the separate reasons writer
// is retired. Stored in winners_reasons, the table the play page and the unveil read.
// Each reason also carries the one number behind it and a few words on what it
// counts (founder, Sep 24 2026: the unveil is Gary's scorebook, the number
// circled and his note beside it). Every reason has both: "Two walks is his
// normal night" circled a bare "1" because its number was left out.
// THE NUMBER ALONE (founder, Oct 11 2026, the Jefferson under 6.5 card: three of
// four numbers came back with words on them, "13/13 rec 119 yds", "5.7 targets
// per game", and the 12-character limit threw them out, so the rows circled a
// bare place number with no note). The ask now says the number alone, and a
// number that still arrives with words is split: the number stays in the circle,
// the words lead the note.

export const REASONS_SHAPE = '"reasons":[{"claim":"a short plain line","why":"one or two sentences","stat":"the number alone","note":"up to five words on what that number counts"}]';

export const reasonsAsk = (scope) =>
  `Also write "reasons" for ${scope}: 3 or 4 reasons a fan reads on your Winners page for why this ticket belongs on the board, each a short plain claim and one or two sentences on why, drawn only from the original record. Give every reason the one number from the record that shows it best, the number alone, written exactly as the record has it ("7 of 8", "41.3%", ".229"); the words on what it counts go in the note ("starts with 18+ outs"), never in the number. Every reason rests on a number from the record; a claim with none is not one of the reasons. No internal labels, grades or field names.`;

/** Short enough to circle, and never a sentence. */
const STAT_MAX = 12;
const NOTE_MAX_WORDS = 6;

/** A number token: "7", "4.3", ".229", "41.3%", "13/13", "42:45", "0-for-12", "+6", "-0.34", "3-17". */
const NUMBER = /^[+\-−]?(?:\.\d+|\d[\d.,:/%x\-–]*)(?:-for-\d+)?$/i;
const JOINERS = new Set(['of', 'for', 'to', 'in']);
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);

/** "5.7 targets per game" -> ["5.7", "targets per game"]; "7 of 58 snaps" -> ["7 of 58", "snaps"];
 *  "7 of 8" -> ["7 of 8", ""]; a stat with no leading number is returned whole. */
export function splitStat(stat) {
  const w = words(stat);
  let n = 0;
  while (n < w.length) {
    if (NUMBER.test(w[n])) n += 1;
    else if (n > 0 && JOINERS.has(w[n].toLowerCase()) && n + 1 < w.length && NUMBER.test(w[n + 1])) n += 2;
    else break;
  }
  if (!n) return [w.join(' '), ''];
  return [w.slice(0, n).join(' '), w.slice(n).join(' ')];
}

/** The note under the circle: the words that came on the number, then Gary's note, while they fit. */
function noteFor(rest, note) {
  const fits = (s) => Boolean(s) && words(s).length <= NOTE_MAX_WORDS;
  const joined = [rest, note].filter(Boolean).join(', ');
  if (fits(joined)) return joined;
  if (fits(note)) return note;
  if (fits(rest)) return rest;
  return '';
}

/** Keep what parses: three to four objects with a claim and a why, each with its
 *  number and note when both are there and fit. A reason without them is
 *  dropped while three complete ones remain; with fewer it stays in Gary's order
 *  and circles its place number, because three is the floor (founder, Oct 14
 *  2026: "3 is a min so that it always has at least three ... it doesn't really
 *  work with 2 or 1 reason"; the Dodgers NLCS Game 3 card showed two). Fewer
 *  than three is no set, and the app reads the brief instead. */
export function selectionReasons(raw) {
  if (!Array.isArray(raw)) return null;
  const rows = raw
    .map((r) => {
      const row = { claim: String(r?.claim ?? '').trim(), why: String(r?.why ?? '').trim() };
      const [stat, rest] = splitStat(r?.stat);
      const note = noteFor(rest, String(r?.note ?? '').trim());
      if (stat && note && stat.length <= STAT_MAX) Object.assign(row, { stat, note });
      return row;
    })
    .filter((r) => r.claim && r.why);
  const complete = rows.filter((r) => r.stat);
  const kept = complete.length >= 3 ? complete : rows;
  return kept.length >= 3 ? kept.slice(0, 4) : null;
}

/** The props selection's reasons for the props it admitted (restored Oct 8 2026 with daily-props-v1). */
export async function writeSelectionReasons(client, selection, model, log = console) {
  const rows = (selection?.ranked_candidates || [])
    .filter((c) => c.selected)
    .map((c) => ({ candidate_id: c.candidate_id, reasons: selectionReasons(c.reasons), model: model || null }))
    .filter((row) => row.reasons);
  if (!rows.length) return 0;
  try {
    const { error } = await client.from('winners_reasons').upsert(rows, { onConflict: 'candidate_id', ignoreDuplicates: true });
    if (error) throw error;
    return rows.length;
  } catch (error) {
    log.warn(`[Winners] reasons not stored: ${error.message}`);
    return 0;
  }
}
