// Pure exact-result identity helpers shared by the existing game and prop
// settlement Edge Functions. Keeping these free of Deno/network dependencies
// makes the production identity contract directly unit-testable under Node.

function cleanScalar(value: unknown): string | null {
  if (value == null || typeof value === "object") return null;
  const normalized = String(value).trim();
  if (!normalized || /^(?:null|undefined)$/i.test(normalized)) return null;
  return normalized;
}

/** Exact upstream game id already sealed into the immutable stored pick. */
export function storedExactGameId(pick: unknown): string | null {
  if (!pick || typeof pick !== "object" || Array.isArray(pick)) return null;
  const row = pick as Record<string, unknown>;
  return cleanScalar(row.game_id) ?? cleanScalar(row.bdl_game_id);
}

/** Canonical persisted league/sport label. */
export function normalizedResultSport(value: unknown): string | null {
  const normalized = cleanScalar(value)?.toUpperCase() ?? null;
  return normalized || null;
}

/**
 * Require the stored pick identity to agree with the exact provider game that
 * was just matched. A mismatch remains pending instead of writing a result to
 * the wrong game or silently manufacturing a replacement identity.
 */
export function matchedStoredGameId(pick: unknown, providerGameId: unknown): string {
  const stored = storedExactGameId(pick);
  const provider = cleanScalar(providerGameId);
  if (!stored) throw new TypeError("Stored pick is missing an exact game id");
  if (!provider) throw new TypeError("Matched provider game is missing an exact game id");
  if (stored !== provider) {
    throw new TypeError(`Stored game id ${stored} does not match provider game id ${provider}`);
  }
  return stored;
}

export type PropResultIdentity = {
  gameDate: unknown;
  sport: unknown;
  gameId: unknown;
  playerName: unknown;
  propType: unknown;
  bet: unknown;
  line: unknown;
};

/** Exact key mirrored by prop_results_exact_identity_idx. */
export function propResultIdentityKey(identity: PropResultIdentity): string | null {
  const gameDate = cleanScalar(identity?.gameDate);
  const sport = normalizedResultSport(identity?.sport);
  const gameId = cleanScalar(identity?.gameId);
  const playerName = cleanScalar(identity?.playerName)?.toLowerCase() ?? null;
  const propType = cleanScalar(identity?.propType)?.toLowerCase() ?? null;
  const bet = cleanScalar(identity?.bet)?.toLowerCase() ?? null;
  const lineScalar = cleanScalar(identity?.line);
  const line = lineScalar == null ? Number.NaN : Number(lineScalar);
  if (!gameDate || !sport || !gameId || !playerName || !propType || !bet || !Number.isFinite(line)) {
    return null;
  }
  return JSON.stringify([gameDate, sport, gameId, playerName, propType, bet, line]);
}
