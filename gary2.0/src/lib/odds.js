export const americanToProb = (am) => (am > 0 ? 100 / (am + 100) : (-am) / ((-am) + 100));

export const probToAmerican = (p) => (p >= 0.5
  ? Math.round(-(p / (1 - p)) * 100)
  : Math.round(((1 - p) / p) * 100));

export const expectedValue = (p, am) => {
  const b = am > 0 ? am / 100 : 100 / Math.abs(am);
  return p * b - (1 - p);
};

export const kellyFraction = (p, am) => {
  const b = am > 0 ? am / 100 : 100 / Math.abs(am);
  return Math.max(0, (p * (b + 1) - 1) / b);
};


