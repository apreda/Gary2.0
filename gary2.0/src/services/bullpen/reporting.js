import { groundingSearch } from '../agentic/scoutReport/shared/grounding.js';

// Use Gary's existing search transport/account policy, without the general
// breaking-news wrapper's 48-hour exclusion. Ongoing restrictions and role
// announcements can be older; the query requires dates and later verification.
export function searchBullpenReporting(query) {
  return groundingSearch(null, query, new Date().toISOString());
}
