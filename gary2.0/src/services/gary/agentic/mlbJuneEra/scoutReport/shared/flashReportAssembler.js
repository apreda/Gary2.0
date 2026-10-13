/**
 * Flash Report Assembler
 *
 * Combines the base data report with investigation-ready extras
 * that ONLY the Flash research assistant (Gemini 3 Flash) should see.
 *
 * Changes here affect ONLY Flash's view. Gary's report is untouched.
 *
 * Currently adds:
 *   1. Tale of Tape — structured comparison table for systematic investigation
 *   2. Stat token menu — reference for fetch_stats tool calls
 */

export function assembleFlashReport(baseText, verifiedTaleOfTape, tokenMenu) {
  const sections = [baseText];

  // Tale of Tape — structured stat comparison for Flash's investigation
  if (verifiedTaleOfTape?.text) {
    sections.push(verifiedTaleOfTape.text);
  }

  // Stat token menu — Flash needs this to know what stats to fetch
  if (tokenMenu) {
    sections.push(`══════════════════════════════════════════════════════════════════════
AVAILABLE STAT CATEGORIES (use fetch_stats tool to request):
${tokenMenu}
══════════════════════════════════════════════════════════════════════`);
  }

  return sections.join('\n\n');
}
