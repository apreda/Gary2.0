import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Only NCAAF props consume this surface; MLB/NFL prop eras stay unchanged.
export const NCAAF_PROPS_EVIDENCE_SHA = createHash('sha256')
  .update(['./ncaafPropsAgenticContext.js', './scoutReport/sports/ncaafPlayerEvidence.js']
    .map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n'))
  .digest('hex').slice(0, 12);
