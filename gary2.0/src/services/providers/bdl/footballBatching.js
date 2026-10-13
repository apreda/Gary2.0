

// Shared BDL footballBatching; one module instance owns all associated state.
const footballGameBatchQueues = new Map();

const footballTeamSeasonBatchQueues = new Map();

function gameHasTeam(game, teamId) {
  const wanted = String(teamId);
  return [
    game?.home_team?.id,
    game?.visitor_team?.id,
    game?.away_team?.id,
    game?.home_team_id,
    game?.visitor_team_id,
    game?.away_team_id
  ].some(id => id !== null && id !== undefined && String(id) === wanted);
}

/** Coalesce same-window full-season reads into pairs, then restore each
 * caller's team filter. If a combined read fails, retry its original requests. */
function fetchFootballGamesBatched(sportKey, params, fetchCombined) {
  const teamIds = Array.isArray(params?.team_ids) ? params.team_ids.filter(Boolean) : [];
  const isFootball = sportKey === 'americanfootball_nfl' || sportKey === 'americanfootball_ncaaf';
  // Only full-season pages are safe to combine without changing either
  // caller's result window. NFL/NCAAF matchup totals are comfortably <100.
  if (!isFootball || teamIds.length !== 1 || Number(params?.per_page || 0) < 100) {
    return fetchCombined(params);
  }

  const baseParams = { ...params };
  delete baseParams.team_ids;
  const queueKey = `${sportKey}:${JSON.stringify(baseParams)}`;

  return new Promise((resolve, reject) => {
    let queue = footballGameBatchQueues.get(queueKey);
    if (!queue) {
      queue = [];
      footballGameBatchQueues.set(queueKey, queue);
      queueMicrotask(async () => {
        footballGameBatchQueues.delete(queueKey);
        const entries = [...queue];
        // Cap each combined page at the two teams from one matchup. This keeps
        // the result set below per_page=100 even if an unrelated caller starts
        // several football schedule reads in the same microtask.
        const pairs = [];
        for (let i = 0; i < entries.length; i += 2) pairs.push(entries.slice(i, i + 2));
        await Promise.all(pairs.map(async (pair) => {
          try {
            const combinedTeamIds = [...new Set(pair.flatMap(entry => entry.teamIds))];
            const combined = await pair[0].fetchCombined({
              ...baseParams,
              team_ids: combinedTeamIds
            });
            for (const entry of pair) {
              const requested = entry.teamIds[0];
              entry.resolve((combined || []).filter(game => gameHasTeam(game, requested)));
            }
          } catch (error) {
            if (pair.length === 1) {
              pair[0].reject(error);
              return;
            }
            // Preserve the old partial-success behavior if a multi-team query
            // is rejected by retrying each side with the original request.
            await Promise.all(pair.map(async (entry) => {
              try {
                entry.resolve(await entry.fetchCombined({
                  ...baseParams,
                  team_ids: entry.teamIds
                }));
              } catch (singleError) {
                entry.reject(singleError);
              }
            }));
          }
        }));
      });
    }
    queue.push({ teamIds, fetchCombined, resolve, reject });
  });
}

function teamIdFromStatRow(row) {
  return row?.team?.id ?? row?.team_id ?? row?.teamId ?? null;
}

/** Combine team-stat reads only when returned rows retain team identity.
 * Unlabelled responses fall back to the original per-team requests. */
function fetchFootballTeamSeasonStatsBatched(sportKey, teamId, season, postseason, fetchRows) {
  const isFootball = sportKey === 'americanfootball_nfl' || sportKey === 'americanfootball_ncaaf';
  if (!isFootball || !teamId || !season) return fetchRows([teamId]);

  const queueKey = `${sportKey}:${season}:${Boolean(postseason)}`;
  return new Promise((resolve, reject) => {
    let queue = footballTeamSeasonBatchQueues.get(queueKey);
    if (!queue) {
      queue = [];
      footballTeamSeasonBatchQueues.set(queueKey, queue);
      queueMicrotask(async () => {
        footballTeamSeasonBatchQueues.delete(queueKey);
        const entries = [...queue];
        const pairs = [];
        for (let i = 0; i < entries.length; i += 2) pairs.push(entries.slice(i, i + 2));

        await Promise.all(pairs.map(async (pair) => {
          try {
            const teamIds = [...new Set(pair.map(entry => entry.teamId))];
            const combined = await pair[0].fetchRows(teamIds);
            const rows = Array.isArray(combined) ? combined : [];
            const hasTeamIdentity = rows.some(row => teamIdFromStatRow(row) != null);

            if (pair.length === 1 || rows.length === 0 || hasTeamIdentity) {
              for (const entry of pair) {
                const selected = pair.length === 1
                  ? rows
                  : rows.filter(row => String(teamIdFromStatRow(row)) === String(entry.teamId));
                entry.resolve(selected);
              }
              return;
            }

            // Defensive compatibility path for an undocumented/unlabelled
            // response shape: preserve the original one-team behavior.
            await Promise.all(pair.map(async (entry) => {
              try {
                entry.resolve(await entry.fetchRows([entry.teamId]));
              } catch (error) {
                entry.reject(error);
              }
            }));
          } catch (error) {
            if (pair.length === 1) {
              pair[0].reject(error);
              return;
            }
            // Preserve the old partial-success behavior if a multi-team query
            // is rejected by retrying each side with the original request.
            await Promise.all(pair.map(async (entry) => {
              try {
                entry.resolve(await entry.fetchRows([entry.teamId]));
              } catch (singleError) {
                entry.reject(singleError);
              }
            }));
          }
        }));
      });
    }
    queue.push({ teamId, fetchRows, resolve, reject });
  });
}

export { fetchFootballGamesBatched, fetchFootballTeamSeasonStatsBatched };
