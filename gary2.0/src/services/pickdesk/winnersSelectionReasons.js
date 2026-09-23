// "Why it made the board" comes from the selection itself (founder, Sep 23
// 2026: "if we're going to select what makes the board, we should be able to say
// the reasons why it made the board at the same time"). Each selector asks for
// the reasons in the same pass that admits the play; the separate reasons writer
// is retired. Stored in winners_reasons, the table the play page and the unveil read.

export const REASONS_SHAPE = '"reasons":[{"claim":"a short plain line","why":"one or two sentences"}]';

export const reasonsAsk = (scope) =>
  `Also write "reasons" for ${scope}: 3 or 4 reasons a fan reads on your Winners page for why this ticket belongs on the board, each a short plain claim and one or two sentences on why, drawn only from the original record. No internal labels, grades or field names.`;

/** Keep what parses: two to four objects with a claim and a why. */
export function selectionReasons(raw) {
  if (!Array.isArray(raw)) return null;
  const rows = raw
    .map((r) => ({ claim: String(r?.claim ?? '').trim(), why: String(r?.why ?? '').trim() }))
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
