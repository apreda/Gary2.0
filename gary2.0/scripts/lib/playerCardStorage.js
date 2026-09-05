// Card publication is additive within a date. A partial source response must
// not erase an already-grounded pack, and a failed write must leave it intact.
// The table's identity PK is distinct from the natural card conflict key.
export async function upsertPlayerCards({ rows, client, url, headers, now = () => new Date() }) {
  const byKey = new Map();
  for (const row of rows || []) {
    if (!row?.date || !row?.league || row.player_id == null || !row.payload) {
      throw new Error('Refusing a player card without date, league, player identity or payload');
    }
    const key = `${row.date}|${row.league}|${row.player_id}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  if (!byKey.size) return 0;
  const writtenAt = now().toISOString();
  const data = JSON.parse(JSON.stringify([...byKey.values()].map((row) => ({
    ...row,
    // This table has no updated_at. Its prior delete/insert writer advanced
    // created_at on every refresh; retain that existing freshness contract.
    created_at: writtenAt,
  }))));
  await client({
    method: 'POST', url, data,
    params: { on_conflict: 'date,league,player_id' },
    headers: { ...headers, Prefer: 'return=minimal,resolution=merge-duplicates' },
  });
  return data.length;
}

// One pack is not proof of a complete game. Failed/empty roster sides remain
// eligible next pass. Legacy rows are rebuilt once to establish this marker.
export function completedPlayerCardGameIds(rows, { requiredPlayers = [] } = {}) {
  const groups = new Map();
  for (const row of rows || []) {
    if (row?.game_id == null) continue;
    const id = String(row.game_id);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  const complete = new Set([...groups].filter(([, cards]) => {
    // A partial newer checkpoint invalidates any older complete marker.
    const marked = cards.filter((card) => card.payload?.card_build?.version === 1);
    if (!marked.length) return false;
    const latestAt = marked.map((card) => card.payload.card_build.built_at).filter(Boolean).sort().at(-1);
    if (!latestAt) return false;
    const latest = marked.filter((card) => card.payload.card_build.built_at === latestAt);
    return latest.every((card) => card.payload.card_build.game_complete === true)
      && new Set(latest.map((card) => card.payload.card_build.team_id).filter(Boolean)).size === 2;
  }).map(([id]) => id));
  // A later insight pass can introduce new subjects after the base leaders
  // were packed. Reopen only those games, checking the exact player+game.
  const packedPlayers = new Set((rows || [])
    .filter((row) => row?.game_id != null && row?.player_id != null)
    .map((row) => `${row.game_id}|${row.player_id}`));
  for (const subject of requiredPlayers) {
    if (subject?.game_id == null || subject?.player_id == null) continue;
    if (!packedPlayers.has(`${subject.game_id}|${subject.player_id}`)) {
      complete.delete(String(subject.game_id));
    }
  }
  return complete;
}
