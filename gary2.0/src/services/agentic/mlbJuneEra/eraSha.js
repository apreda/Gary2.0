import { createHash } from 'crypto';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
/** Every file of the June engine, hashed; the era stamp of an MLB pick. */
export function mlbJuneEraFiles() { return walk(here).map((p) => path.relative(here, p)); }
let _sha = null;
export function mlbJuneEraSha() {
  if (_sha) return _sha;
  const h = createHash('sha256');
  for (const rel of mlbJuneEraFiles()) { h.update(rel); h.update('\n'); h.update(readFileSync(path.join(here, rel))); h.update('\n⸻\n'); }
  _sha = h.digest('hex').slice(0, 12);
  return _sha;
}
