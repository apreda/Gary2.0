/** A YYYY-MM-DD storage key, never an instant. Calendar validity belongs to dateKeys.js. */
export type DateKey = `${number}-${number}-${number}`;
/** An ISO date-time input; parsers still reject invalid values at runtime. */
export type ISOInstant = `${DateKey}T${string}`;
export type InstantInput = Date | ISOInstant | number;
/** Stored game IDs retain their provider representation; no team-name fallback. */
export type StoredGameID = string | number;

/** Original ticket fields used by Winners accounting. Partial historical rows may be missing. */
export interface GameTicketFields {
  readonly game_date?: DateKey | null;
  readonly league?: string | null;
  readonly game_id?: StoredGameID | null;
  readonly pick_text?: string | null;
}
export interface PropTicketFields {
  readonly game_date?: DateKey | null;
  readonly sport?: string | null;
  readonly game_id?: StoredGameID | null;
  readonly player_name?: string | null;
  readonly prop_type?: string | null;
  readonly line_value?: number | string | null;
  readonly bet?: string | null;
}
/** Unparsed provider fields: missing and measured zero are different states. */
export interface SpreadMarket {
  readonly spread_home?: unknown;
  readonly spread_away?: unknown;
  readonly spread_home_odds?: unknown;
  readonly spread_away_odds?: unknown;
}
export interface PickRunResponse {
  readonly retryModel?: boolean;
  readonly code?: string;
  readonly error?: unknown;
  readonly pick?: unknown;
}
