import { sanitizeTokenRequests } from './agenticTokens.js';

/**
 * Build the payload that Stage 2 sees for the requested tokens.
 * @param {string[]} requestedTokens
 * @param {object} tokenData
 * @param {string} sportKey
 * @returns {object}
 */
export function buildTokenPayload(requestedTokens = [], tokenData = {}, sportKey = 'basketball_nba') {
  const clean = sanitizeTokenRequests(requestedTokens, sportKey, 4);
  const payload = {};
  clean.forEach((token) => {
    if (Object.prototype.hasOwnProperty.call(tokenData, token)) {
      payload[token] = { fulfilled: true, data: tokenData[token] };
    } else {
      payload[token] = { fulfilled: false, data: null };
    }
  });
  return payload;
}

