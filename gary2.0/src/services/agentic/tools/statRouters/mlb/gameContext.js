/** MLB stat tools: the game preview, the park and the weather (split from mlbFetchers.js, Oct 13 2026). */
import { getProbablePitchers } from '../../../../mlbStatsApiService.js';
import { openaiWebSearch } from '../../../../pickdesk/webSearch.js';
import { findParkData } from './shared.js';

export const gameContextFetchers = {

  // ═══════════════════════════════════════════════════════════════════
  // MLB PREVIEW & NARRATIVE (Grounding for context APIs can't provide)
  // ═══════════════════════════════════════════════════════════════════

  // Jul 8 2026 rewrite (founder's fan-knowledge doctrine): grounding fills the
  // gap no API covers — storylines, clubhouse news, what the media is saying.
  // The old query actively solicited other people's picks and projections
  // (contradicting the ignore-picks rule the research assistant runs under)
  // and returned the raw result object instead of its text.
  MLB_GAME_PREVIEW: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    // Via the seam (Jul 30): bridge-first ($0), API chain fallback — never a
    // hardwired paid call, even on a currently-dormant token.
    const result = await openaiWebSearch(
      `${awayTeam} vs ${homeTeam} MLB today — the storylines and team news a fan following both teams would know: ` +
      `recent momentum and series context, player storylines and milestone watches, clubhouse and manager news, ` +
      `and what national and local media are saying about each team right now. ` +
      `Factual reporting and narrative context only — do NOT include expert picks, betting predictions, or projections.`
    );
    return {
      homeValue: result?.data || 'N/A',
      awayValue: result?.data || 'N/A',
      comparison: `Storylines and team news for ${awayTeam} @ ${homeTeam}`,
      source: 'grounded search',
    };
  },

  MLB_PARK_FACTORS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const venueName = options?.game?.venue || options?.game?.venueName;

    const parkData = findParkData(venueName, homeTeam);
    if (parkData) {
      const typeLabel = parkData.type === 'pitcher' ? 'Pitcher-Friendly' :
        parkData.type === 'hitter' ? 'Hitter-Friendly' :
        parkData.type === 'variable' ? 'Variable (Wind-Dependent)' : 'Neutral';
      return {
        // NO NUMERIC PARK FACTORS ON GARY'S DESK (founder, Aug 26: "we never
        // math out park factor, ever... I'm talking about what the average
        // everyday fan would know about a certain park" — the Padres rationale
        // cited "a 0.92 factor" the same day). The park reaches Gary as fan
        // knowledge in words: the character of the yard, which both lineups
        // share tonight. The numeric factor stays OUT of every Gary surface;
        // the user-facing board's +N% row (his Aug 14 pick) is untouched.
        homeValue: `${parkData.park} — ${typeLabel}. ${parkData.notes}`,
        awayValue: 'Shared venue — both lineups hit in the same park tonight.',
        comparison: `Venue profile for ${homeTeam} home stadium`,
        source: 'Static MLB Park Data (2024-2026)',
      };
    }

    // No match found — return generic message
    return {
      homeValue: `${homeTeam}: Park data not found for venue "${venueName || 'unknown'}". Check venue name mapping.`,
      awayValue: 'Shared venue — both lineups hit in the same park tonight.',
      comparison: `Venue profile for ${homeTeam} home stadium`,
      source: 'Static MLB Park Data (venue not matched)',
    };
  },

  MLB_WEATHER: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const gamePk = options?.game?.gamePk || options?.game?.id;

    if (gamePk) {
      try {
        const pitcherData = await getProbablePitchers(gamePk);
        const weather = pitcherData.weather;
        const venue = pitcherData.venue;

        if (weather || venue) {
          const lines = [];
          if (venue) {
            lines.push(`Venue: ${venue.name || venue.fieldInfo?.name || 'Unknown'}`);
          }
          if (weather) {
            const temp = weather.temp ? `${weather.temp}°F` : '—';
            const condition = weather.condition || '—';
            const wind = weather.wind || '—';
            lines.push(`Weather: ${condition}, ${temp}`);
            lines.push(`Wind: ${wind}`);
          }

          // Add park context from static data
          const venueName = venue?.name || options?.game?.venue;
          const parkData = findParkData(venueName, homeTeam);
          if (parkData) {
            const roofInfo = parkData.notes.toLowerCase().includes('retractable') ? 'Retractable roof' :
              parkData.notes.toLowerCase().includes('dome') || parkData.notes.toLowerCase().includes('indoor') ? 'Indoor/Dome' : 'Open-air';
            lines.push(`Venue Type: ${roofInfo}`);
          }

          return {
            homeValue: lines.join('\n'),
            awayValue: 'N/A (weather applies to game venue)',
            comparison: `Weather and venue conditions for tonight's game at ${homeTeam}`,
            source: 'MLB Stats API (game feed)',
          };
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] Weather fetch failed for gamePk ${gamePk}:`, e.message);
      }
    }

    // No gamePk — check if we can at least provide venue info from static data
    const parkData = findParkData(null, homeTeam);
    if (parkData) {
      const roofInfo = parkData.notes.toLowerCase().includes('retractable') ? 'Retractable roof' :
        parkData.notes.toLowerCase().includes('dome') || parkData.notes.toLowerCase().includes('indoor') ? 'Indoor/Dome' : 'Open-air';
      return {
        homeValue: `Venue: ${parkData.park} (${roofInfo})\nWeather data available closer to game time.`,
        awayValue: 'N/A (weather applies to game venue)',
        comparison: `Weather and venue conditions for tonight's game at ${homeTeam}`,
        source: 'Static MLB Park Data (weather pending)',
      };
    }

    return {
      homeValue: 'Weather data available closer to game time.',
      awayValue: 'N/A (weather applies to game venue)',
      comparison: `Weather and venue conditions for tonight's game at ${homeTeam}`,
      source: 'N/A (no gamePk)',
    };
  },
};
