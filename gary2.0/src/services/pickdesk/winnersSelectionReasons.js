// "Why it made the board" comes from the selection itself (founder, Sep 23
// 2026: "if we're going to select what makes the board, we should be able to say
// the reasons why it made the board at the same time"). Each selector asks for
// the reasons in the same pass that admits the play; the separate reasons writer
// is retired. Stored in winners_reasons, the table the play page and the unveil read.
// Each reason also carries the one number behind it and a few words on what it
// counts (founder, Sep 24 2026: the unveil is Gary's scorebook, the number
// circled and his note beside it).

export const REASONS_SHAPE = '"reasons":[{"claim":"a short plain line","why":"one or two sentences","stat":"the one number behind it, or empty","note":"up to five words on what that number counts, or empty"}]';

export const reasonsAsk = (scope) =>
  `Also write "reasons" for ${scope}: 3 or 4 reasons a fan reads on your Winners page for why this ticket belongs on the board, each a short plain claim and one or two sentences on why, drawn only from the original record. Give each reason the one number from the record that shows it best, written exactly as the record has it ("7 of 8", "41.3%", ".229"), with up to five words on what it counts ("starts with 18+ outs"); leave both empty when the reason rests on no number. No internal labels, grades or field names.`;

/** Short enough to circle, and never a sentence. */
const STAT_MAX = 12;
const NOTE_MAX_WORDS = 6;

/** Keep what parses: two to four objects with a claim and a why, each with its
 *  number and note when both are there and fit. */
export function selectionReasons(raw) {
  if (!Array.isArray(raw)) return null;
  const rows = raw
    .map((r) => {
      const row = { claim: String(r?.claim ?? '').trim(), why: String(r?.why ?? '').trim() };
      const stat = String(r?.stat ?? '').trim();
      const note = String(r?.note ?? '').trim();
      if (stat && note && stat.length <= STAT_MAX && note.split(/\s+/).length <= NOTE_MAX_WORDS) Object.assign(row, { stat, note });
      return row;
    })
    .filter((r) => r.claim && r.why);
  return rows.length >= 2 ? rows.slice(0, 4) : null;
}

/** Store reasons for the selected tickets. Never fatal to the selection it follows. */
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
