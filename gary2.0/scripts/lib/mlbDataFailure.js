import { mkdirSync, writeFileSync, readFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const directory = fileURLToPath(new URL('../../logs/data-readiness-failures/', import.meta.url));
/** Durable incident read by the ordinary operational email collector. */
export function recordMlbDataFailure(game, error, { incidentDirectory = directory, now = new Date(), league = 'MLB', kind = 'game' } = {}) {
  const id = String(game.bdl_game_id ?? game.game_id ?? game.id ?? 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const date = now.toISOString().slice(0, 10);
  mkdirSync(incidentDirectory, { recursive: true });
  const file = join(incidentDirectory, `${date}__${league}__${kind === 'props' ? 'props__' : ''}${id}.json`);
  let previous;
  try { previous = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first failure */ }
  const incident = { game_id: id, league, kind, home_team: game.home_team || game.homeTeam,
    away_team: game.away_team || game.awayTeam, commence_time: game.commence_time,
    code: error.code || 'pick_failed', error: error.error || error.message, failures: error.failures || [],
    first_failed_at: previous?.first_failed_at || now.toISOString(), last_failed_at: now.toISOString(),
    attempts: (previous?.attempts || 0) + 1, publication_blocked: true };
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(incident, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, file);
  console.error(`[${league} ${kind} Required Data] Publication blocked; incident: ${file}`);
  return incident;
}
