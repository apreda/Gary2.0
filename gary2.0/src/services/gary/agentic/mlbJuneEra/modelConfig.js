// ═══ THE JUNE ENGINE, VERBATIM (commit c27db5f0, Jun 15 2026) ═══
// ADAPTED (models only). Every other line is June's.
// June rotated between two Gemini API keys on a 429. There is no Gemini key
// to rotate to; a quota error falls straight to June's own fallback path.
export function rotateToBackupKey() { return false; }
export function isUsingBackupKey() { return false; }
export function resetToPrimaryKey() {}
