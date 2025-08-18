import { expectedValue, kellyFraction } from './odds.js';
import { trapScore } from './trapScore.js';

export function decidePick({
  modelProb,
  bestPriceAmerican,
  trapInputs,
  bankrollUnits,
  kellyClip = 0.35,
  minEV = 0.015,
  maxPerPickUnits = 1.5,
  passTrapAt = 80
}) {
  const ev = expectedValue(modelProb, bestPriceAmerican);
  const t = trapScore(trapInputs);
  if (t >= passTrapAt) return { take: false, reason: 'High trap score', trap: t };
  if (ev < minEV) return { take: false, reason: 'Low EV', trap: t };
  let k = kellyFraction(modelProb, bestPriceAmerican) * kellyClip;
  if (t >= 60) k *= 0.5;
  const stake = Math.min(k * bankrollUnits, maxPerPickUnits);
  if (stake < 0.1) return { take: false, reason: 'Tiny stake', trap: t };
  return { take: true, stakeUnits: +stake.toFixed(2), ev, trap: t };
}


