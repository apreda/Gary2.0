const PROOF_CATEGORIES = new Set(['the_sweat', 'after_gary']);

export function footballProofIdentity(row) {
  const category = String(row?.category ?? '').toLowerCase();
  if (!PROOF_CATEGORIES.has(category)) return null;
  const gameId = row?.game_id == null ? '' : String(row.game_id);
  const pickId = String(row?.meta?.pick_id ?? '');
  if (!gameId || !pickId) return null;
  if (category === 'the_sweat') {
    const factor = String(row?.meta?.factor_code ?? '');
    return factor ? `${category}|${gameId}|${pickId}|${factor}` : null;
  }
  return `${category}|${gameId}|${pickId}`;
}

export async function loadFootballProofIdentities({
  httpClient,
  restUrl,
  headers,
  date,
  league,
  category,
}) {
  const { data } = await httpClient.get(restUrl, {
    headers,
    params: {
      date: `eq.${date}`,
      league: `eq.${league}`,
      category: `eq.${category}`,
      select: 'category,game_id,meta',
      limit: 500,
    },
  });
  return new Set((Array.isArray(data) ? data : []).map(footballProofIdentity).filter(Boolean));
}

/**
 * Refresh exact football-proof identities without deleting last-good siblings.
 * Insert-before-delete preserves the prior receipt on a failed write. If a run
 * lacks one live factor or one same-book market, that older identity remains
 * available instead of disappearing on a transient provider gap.
 */
export async function replaceFootballProofRows({
  httpClient,
  restUrl,
  headers,
  date,
  league,
  category,
  rows,
}) {
  const fresh = (Array.isArray(rows) ? rows : [])
    .filter((row) => String(row?.category ?? '').toLowerCase() === category)
    .filter((row) => footballProofIdentity(row));
  if (!fresh.length) return { inserted: 0, removed: 0, identities: new Set() };

  const { data } = await httpClient.get(restUrl, {
    headers,
    params: {
      date: `eq.${date}`,
      league: `eq.${league}`,
      category: `eq.${category}`,
      select: 'id,category,game_id,meta',
      limit: 500,
    },
  });
  const identities = new Set(fresh.map(footballProofIdentity));
  const oldIds = (Array.isArray(data) ? data : [])
    .filter((row) => identities.has(footballProofIdentity(row)))
    .map((row) => row?.id)
    .filter((id) => id != null);

  await httpClient({
    method: 'POST',
    url: restUrl,
    data: JSON.parse(JSON.stringify(fresh)),
    headers: { ...headers, Prefer: 'return=minimal' },
  });
  if (oldIds.length) {
    await httpClient({
      method: 'DELETE',
      url: restUrl,
      headers: { ...headers, Prefer: 'return=minimal' },
      params: { id: `in.(${oldIds.join(',')})` },
    });
  }
  return { inserted: fresh.length, removed: oldIds.length, identities };
}

export default { footballProofIdentity, loadFootballProofIdentities, replaceFootballProofRows };
