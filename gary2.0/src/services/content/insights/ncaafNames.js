// College name handling shared by the NCAAF-owned lanes (availability, the
// player packs): the wire spells "D.J. Uiagalelei" and "Mark Fletcher Jr."
// one way, BDL's roster another — one comparable key for both.

export function playerName(p) {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || p?.full_name || null;
}

/** "D.J. Uiagalelei" / "Mark Fletcher Jr." / "Emmett Mosley V" -> a comparable key. */
export function nameKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[.'’\-]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
