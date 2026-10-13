import { createHash } from 'node:crypto';

export const MLB_READINESS_VERSION = 'mlb-required-data-v1';
export class MlbRequiredDataError extends Error {
  constructor(message) {
    super(String(message).startsWith('MLB_REQUIRED_DATA:') ? message : `MLB_REQUIRED_DATA: ${message}`);
    this.code = 'required_data_unavailable';
    this.retryModel = false;
  }
}
export function mlbDataFailureResult(error) {
  const required = error?.code === 'required_data_unavailable'
    || /\[Scout Report\] HARD FAIL — MLB requires lineups \+ starting pitchers/.test(error?.message || '');
  return { error: error.message, code: required ? 'required_data_unavailable' : error.code,
    retryModel: required ? false : error.retryModel };
}
const fail = message => { throw new MlbRequiredDataError(message); };
const normalized = text => String(text || '').normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const validName = name => typeof name === 'string' && normalized(name).length > 2
  && !/\b(unknown|unavailable|tbd|tba|not yet|not posted|undefined|null)\b/i.test(name);
const gameId = game => {
  for (const value of [game.bdl_game_id, game.game_id, game.id]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
};
const teamName = (game, side) => game[`${side}Team`] || (typeof game[`${side}_team`] === 'string'
  ? game[`${side}_team`] : game[`${side}_team`]?.full_name || game[`${side}_team`]?.name);
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const iso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

function validateSide(side, label) {
  if (!side || !Array.isArray(side.roster) || !side.roster.length
    || side.roster.some(name => !validName(name))) fail(`${label}: named roster missing or malformed`);
  const names = side.roster.map(normalized);
  if (new Set(names).size !== names.length) fail(`${label}: duplicate roster player`);
  if (!Array.isArray(side.lineup) || side.lineup.length !== 9
    || side.lineup.some((batter, index) => batter.order !== index + 1 || !validName(batter.name))
    || new Set(side.lineup.map(batter => normalized(batter.name))).size !== 9) {
    fail(`${label}: requires nine distinct named hitters in batting order 1–9`);
  }
  if (!validName(side.starter)) fail(`${label}: named starting pitcher missing`);
  for (const player of [...side.lineup.map(batter => batter.name), side.starter]) {
    if (!names.includes(normalized(player))) fail(`${label}: ${player} is absent from the roster Gary can use`);
  }
}

function section(text, title) {
  const marker = `═══ ${title} ═══`;
  if (text.split(marker).length !== 2) fail(`missing or duplicate ${title} section`);
  return text.split(marker)[1].split(/\n═══ /)[0].trim();
}

/** Validate the exact report consumed by June, including reports loaded from cache.
 * This gate does not change the model's judgment or fill any missing data.
 */
export function assertMlbScoutReadiness(report, game, { checkedAt = new Date().toISOString() } = {}) {
  const text = typeof report === 'string' ? report : report?.garyText || report?.text;
  const home = teamName(game, 'home'), away = teamName(game, 'away');
  if (!gameId(game) || !iso(game.commence_time) || !home || !away || normalized(home) === normalized(away)) {
    fail('exact game identity, start time or distinct teams missing');
  }
  if (typeof text !== 'string' || !text.split('\n').some(line => line.trim() === `MATCHUP: ${away} @ ${home}`)) {
    fail('scout report missing or belongs to another matchup');
  }
  const lineups = section(text, 'CONFIRMED LINEUPS');
  const rosters = section(text, 'ROSTERS');
  const sides = {};
  for (const [side, name] of [['home', home], ['away', away]]) {
    const rosterMatch = rosters.match(new RegExp(`(?:^|\\n)${escape(name)} \\((\\d+) players\\)\\n([\\s\\S]*?)(?=\\n\\n|$)`));
    if (!rosterMatch) fail(`${name}: roster section unavailable`);
    const roster = [...rosterMatch[2].matchAll(/(?:^|,\s*|Players:\s*|Pitchers:\s*)([^,:\n]+?) \([^()\n]+\)(?=,|\n|$)/gm)]
      .map(match => match[1].trim());
    if (roster.length !== Number(rosterMatch[1])) fail(`${name}: roster count does not match named entries`);
    const lineupMatch = lineups.match(new RegExp(`(?:^|\\n)${escape(name)}:\\n([\\s\\S]*?)(?=\\n\\n|$)`));
    if (!lineupMatch) fail(`${name}: confirmed lineup missing`);
    const lineup = [...lineupMatch[1].matchAll(/^\s+(\d+)\. (.+?) \([^\n]+\) \[Bats: [^\]\n]+\]$/gm)]
      .map(match => ({ order: Number(match[1]), name: match[2].trim() }));
    const starters = [...lineupMatch[1].matchAll(/^\s+SP: (.+?) \(Throws: [^\n]+\)$/gm)];
    const starter = starters.length === 1 ? starters[0][1].trim() : null;
    sides[side] = { roster, lineup, starter };
    validateSide(sides[side], name);
  }
  const receipt = {
    version: MLB_READINESS_VERSION, game_id: gameId(game),
    home_team: home, away_team: away, commence_time: iso(game.commence_time),
    checked_at: iso(checkedAt), scout_sha256: createHash('sha256').update(text).digest('hex'), ...sides,
  };
  assertMlbPublicationReadiness({ ...game, league: 'MLB', input_readiness: receipt });
  return receipt;
}

/** New publications, including recovered outbox writes, need evidence of the gate.
 * Historical readers deliberately do not call this function.
 */
export function assertMlbPublicationReadiness(pick) {
  const mlb = [pick?.league, pick?.sport, pick?.sport_key].some(value =>
    /^(?:mlb|baseballmlb)$/.test(String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')));
  if (!mlb
    || [pick?.type, pick?.pickType].some(type => String(type).toLowerCase() === 'prop')) return;
  const receipt = pick.input_readiness;
  if (!receipt || receipt.version !== MLB_READINESS_VERSION) fail('publication requires a validated MLB scout receipt');
  if (!gameId(pick) || receipt.game_id !== gameId(pick)
    || receipt.home_team !== teamName(pick, 'home') || receipt.away_team !== teamName(pick, 'away')
    || !iso(pick.commence_time) || receipt.commence_time !== iso(pick.commence_time)) fail('readiness receipt belongs to another game');
  if (!iso(receipt.checked_at) || !/^[a-f0-9]{64}$/.test(receipt.scout_sha256 || '')) fail('readiness receipt lacks its source or check time');
  validateSide(receipt.home, receipt.home_team);
  validateSide(receipt.away, receipt.away_team);
}
