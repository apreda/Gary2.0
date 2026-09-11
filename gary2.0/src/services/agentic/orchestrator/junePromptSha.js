/**
 * The June engine's era stamp (founder, Sep 11 2026: the MLB lane IS the
 * June 15 2026 tree, verbatim, models adapted). The stamp is a hash of every
 * file in src/services/agentic/mlbJuneEra — any edit there is a new era by
 * definition; the ledger reads it on every MLB pick.
 */
import { mlbJuneEraSha } from '../mlbJuneEra/eraSha.js';

/** 12-char sha of the June engine's files. Memoized per process. */
export function junePromptSha() { return mlbJuneEraSha(); }
export default junePromptSha;
