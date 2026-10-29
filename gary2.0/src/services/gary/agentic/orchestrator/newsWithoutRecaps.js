/**
 * NEWS WITHOUT RECAPS OF GAMES THE READ ALREADY SHOWS (Oct 27 2026): the game-by-game read drops every recap of a past
 * game (its records hold them all); the live read drops the recaps of the games its log shows (data check, Oct
 * 24: Miami's Oct 21 lines sat under its Oct 23 heading, and Washington's Toronto box under its Milwaukee recap; the
 * numbers were real, the game was not). `finals` is the set of those games' scores, "121-113".
 */
// The news without its recaps of past games: sections headed as recent or last games, and every item
// (a paragraph or bullet with its indented lines) that gives one of the season's final scores, as "121-113" or as
// "Nuggets 141, Pelicans 135" (Oct 27 2026 test of 24 reads: the second form and an item's later paragraphs had
// stayed), and every item that tells how a past game went: a score with a lead, a run, a quarter or a result ("led
// 95-89 in the fourth", "won the second quarter 38-12"). The records hold those games, checked; a line that only
// gives a record ("Detroit enters 15-8") stays.
export function newsWithoutRecaps(news, finals) {
  const lines = String(news || '').split('\n');
  const heading = (l) => /^\s*#{1,6}\s|^\s*\*\*[^*]+\*\*\s*$/.test(l);
  const recapHeading = (l) => /\b(?:recent (?:regular-season )?games|last game|recent results|game recaps?)\b/i.test(l);
  // A football final can have a one-digit side ("lost 24-7"; Oct 29 2026 hunt).
  const isFinal = (l) => [...l.matchAll(/\b(\d{1,3})\s?[–-]\s?(\d{1,3})\b|\b[A-Z][\w.'’]+(?: [A-Z][\w.'’]+)? (\d{2,3}), [A-Z][\w.'’]+(?: [A-Z][\w.'’]+)? (\d{2,3})\b/g)]
    .some((m) => { const a = m[1] || m[3], b = m[2] || m[4]; return finals.has(`${a}-${b}`) || finals.has(`${b}-${a}`); });
  const inGame = (l) => /\b(\d{2,3})\s?[–-]\s?(\d{2,3})\b/.test(l)
    && /\b(?:led|lead|leading|trail(?:ed|ing)?|halftime|at the half|quarter|half\b|run\b|won|lost|beat|outscored|finished|ahead|behind|deficit|overtime)\b/i.test(l);
  // Items: a line that starts at the margin, with the indented or blank lines after it.
  const items = [];
  for (const l of lines) {
    if (items.length && (/^\s+\S/.test(l) || !l.trim())) items[items.length - 1].push(l); else items.push([l]);
  }
  // A last game's box as a table of players' minutes and points, with the line that introduces it (Oct 29 2026 hunt: two
  // tables, 21 rows, under MEM@POR's news; the log has those boxes, official).
  const boxTable = (l) => /^\s*\|/.test(l) && /\|\s*players?\s*\|/i.test(l)
    && (l.match(/\|\s*(?:min(?:utes)?|p(?:oin)?ts|reb(?:ounds)?|ast|assists)\s*(?=\|)/gi) || []).length >= 2;
  const out = []; let skip = false; let table = false;
  for (const item of items) {
    if (heading(item[0])) { skip = recapHeading(item[0]); if (skip) continue; }
    if (boxTable(item[0])) {
      table = true;
      while (out.length && !out[out.length - 1].trim()) out.pop();
      if (out.length && /:\s*$/.test(out[out.length - 1])) out.pop();
      continue;
    }
    if (table && /^\s*\|/.test(item[0])) continue;
    table = false;
    if (skip || item.some((l) => isFinal(l) || inGame(l))) continue;
    out.push(...item);
  }
  // Headings left with nothing under them, down to the next heading of the same or a higher level (Oct 29 2026 hunt:
  // "## Atlanta Hawks" went with its "### Last game" subsection, and two unnamed "### Current storylines" were left).
  const level = (l) => (l.match(/^\s*(#{1,6})\s/)?.[1].length ?? 7);
  const kept = out.filter((l, i) => {
    if (!heading(l)) return true;
    for (const x of out.slice(i + 1)) { if (!x.trim()) continue; if (heading(x)) { if (level(x) <= level(l)) return false; continue; } return true; }
    return false;
  });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

