// THE GAME LOG WITHOUT THE NOISE (founder GO, Sep 24 2026). A player's game
// log reached the research assistant and Gary as pretty-printed provider rows:
// every game repeated the player's whole bio and team record and carried the
// other role's stat fields as nulls (a hitter's 23 pitching fields), about
// 2,400 characters a game. Thirteen logs ran ~300,000 characters per game and
// pushed the research conversation past the fallback models' limits.
//
// Every field with a value stays, in every requested game (the Sep 19 rule).
// The bio and the team records are stated once; empty fields and the
// indentation go. One game per line, still valid JSON.

const present = (v) => v !== null && v !== undefined && v !== '';
const clean = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => present(v)));

export function renderMlbPlayerGameLogs(playerName, stats) {
  const rows = Array.isArray(stats) ? stats : [];
  const bio = rows.find((r) => r?.player && typeof r.player === 'object')?.player || null;
  const teams = [...new Map(rows.filter((r) => r?.team?.id != null).map((r) => [String(r.team.id), clean(r.team)])).values()];
  const games = rows.map((r) => {
    const { player: _player, team: _team, _game, ...line } = r || {};
    const out = clean(line);
    if (_game && typeof _game === 'object') out.game = clean(_game);
    return JSON.stringify(out);
  });
  const head = { player: playerName, ...(bio ? { bio: clean(bio) } : {}), ...(teams.length ? { teams } : {}) };
  const opening = JSON.stringify(head).slice(0, -1);
  return `MLB_PLAYER_GAME_LOGS:\n${opening},"games":[${games.length ? `\n${games.join(',\n')}\n` : ''}]}`;
}
