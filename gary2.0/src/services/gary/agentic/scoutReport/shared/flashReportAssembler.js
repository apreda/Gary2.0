/**
 * Flash Report Assembler
 *
 * Combines the base data report with investigation-ready extras
 * that ONLY the Flash research assistant (Gemini 3 Flash) should see.
 *
 * Changes here affect ONLY Flash's view. Gary's report is untouched.
 *
 * Currently adds:
 *   1. Stat token menu — reference for fetch_stats tool calls
 *
 * NOTE (Jun 29 2026): the Tale of Tape was removed from Flash's view. Every number in it (record,
 * SP/goalie line, team stats) is already in the structured scout report Flash also reads, so sending
 * the table too was a per-factor duplicate (Flash re-reads the report on each factor). The tape's
 * `rows` still power the UI pick-card back — only Flash's redundant copy is gone.
 */

export function assembleFlashReport(baseText, tokenMenu) {
  const sections = [baseText];

  // Stat token menu — Flash needs this to know what stats to fetch
  if (tokenMenu) {
    sections.push(`══════════════════════════════════════════════════════════════════════
AVAILABLE STAT CATEGORIES (use fetch_stats tool to request):
${tokenMenu}
══════════════════════════════════════════════════════════════════════`);
  }

  return sections.join('\n\n');
}
