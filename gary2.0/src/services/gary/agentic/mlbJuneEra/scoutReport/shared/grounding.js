// ═══ THE JUNE ENGINE, VERBATIM (commit c27db5f0, Jun 15 2026) ═══
// ADAPTED (models only). Every other line is June's.
// June's grounding search ran on Gemini with Google Search. The same query,
// with the same { success, data } answer, now goes to today's search rung.
import { groundedWebSearch, getGroundedWeather } from '../../../scoutReport/shared/grounding.js';
export async function geminiGroundingSearch(query, options = {}) { return groundedWebSearch(query, options); }
export { getGroundedWeather };
