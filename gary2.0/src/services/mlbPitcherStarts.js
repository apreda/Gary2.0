import { getPitcherGameLogRaw } from './mlbStatsApiService.js';
import { MlbRequiredDataError } from './mlbDataReadiness.js';

// June's sample-size block expects actual starts with home/away identity.
// BDL's per-game stat rows supply neither; counting appearances and treating
// absent is_home as false manufactured "0 home starts" for established SPs.
export async function loadMlbPitcherStarts(personId, season, getLog = getPitcherGameLogRaw) {
  try {
    const rows = await getLog(personId, season);
    if (!Array.isArray(rows)) throw new Error('pitcher game log is not a collection');
    const regular = rows.filter(row => row.gameType === 'R' && Number(row.season) === Number(season));
    if (regular.some(row => ![0, 1].includes(row.stat?.gamesStarted))) {
      throw new Error('pitcher game log is missing the starts indicator');
    }
    return regular.filter(row => row.stat.gamesStarted === 1).map(row => {
      if (!row.team?.id || typeof row.isHome !== 'boolean') throw new Error('start missing team or home/away identity');
      return { team: { id: row.team.id }, is_home: row.isHome };
    });
  } catch (error) {
    throw new MlbRequiredDataError(`pitcher ${personId} starts: ${error.message}`);
  }
}
