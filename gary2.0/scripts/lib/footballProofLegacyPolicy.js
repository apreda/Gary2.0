const LEGACY_AFTER_GARY_PICK_IDS = new Set([
  // These two calls were stored on Aug. 15 before published_at became part of
  // the immutable football-pick contract. They may retain score/thesis proof,
  // but cannot truthfully receive a published-vs-current market receipt.
  'agentic-americanfootball_nfl-1393562',
  'agentic-americanfootball_nfl-1393563',
]);

function validIso(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && Number.isFinite(Date.parse(value));
}

export function partitionFootballProofPicks(rawPicks) {
  if (!Array.isArray(rawPicks)) {
    throw new TypeError('Football proof picks must be an array');
  }

  const proofRecords = [];
  const afterGaryGameIds = new Set();
  const afterGaryPickIds = new Set();
  const legacyAfterGarySkipped = [];

  for (const pick of rawPicks) {
    const pickId = String(pick?.pick_id || '').trim();
    const gameId = pick?.bdl_game_id ?? pick?.game_id;
    if (!pickId || gameId == null) {
      throw new TypeError('Stored football pick lacks exact proof identity');
    }

    proofRecords.push({ pick, container: {} });
    if (validIso(pick?.published_at)) {
      afterGaryGameIds.add(String(gameId));
      afterGaryPickIds.add(pickId);
      continue;
    }
    if (LEGACY_AFTER_GARY_PICK_IDS.has(pickId)) {
      legacyAfterGarySkipped.push(pickId);
      continue;
    }
    throw new TypeError(
      `AFTER GARY pick ${pickId} requires an immutable pick.published_at timestamp`,
    );
  }

  return {
    proofRecords,
    afterGaryGameIds,
    afterGaryPickIds,
    legacyAfterGarySkipped,
  };
}

export function assertAfterGaryPickCoverage(expectedPickIds, publishedRecords) {
  const expected = expectedPickIds instanceof Set
    ? expectedPickIds
    : new Set([...(expectedPickIds || [])].map(String));
  const actual = new Set(
    (publishedRecords || []).map((record) => String(record?.pick?.pick_id || '').trim()),
  );
  const missing = [...expected].filter((pickId) => !actual.has(pickId));
  const unexpected = [...actual].filter((pickId) => !expected.has(pickId));
  if (missing.length || unexpected.length || actual.size !== (publishedRecords || []).length) {
    throw new Error(
      `AFTER GARY proof identity mismatch: ${missing.length} missing, ${unexpected.length} unexpected`,
    );
  }
}

export const footballProofLegacyPolicy = Object.freeze({
  legacyAfterGaryPickIds: Object.freeze([...LEGACY_AFTER_GARY_PICK_IDS]),
});
