import type { DateKey, ISOInstant, GameTicketFields, PropTicketFields } from '../../src/contracts/boundaries.js';
import { pickGameDate } from '../../scripts/lib/picks/calendar.js';
import { decodeBdlRows, decodeBdlSdkRows, decodeBdlSdkItem } from '../../src/services/bdlResponse.js';
import { finiteMarketNumber, spreadForSide, footballMarketUnavailable } from '../../src/services/marketTruth.js';
import { gameTicketIdentity, propTicketIdentity } from '../../src/services/pickdesk/ticketIdentity.js';

const date: DateKey = '2026-09-19';
const kickoff: ISOInstant = '2026-09-20T03:30:00Z';
const gameDate: DateKey | null = pickGameDate('NCAAF', kickoff);
pickGameDate('NFL', new Date());
pickGameDate('MLB', null);
// @ts-expect-error A storage date has no kickoff time or zone.
pickGameDate('NCAAF', date);
// @ts-expect-error A kickoff is not a storage date.
const wrongDate: DateKey = kickoff;

const game: GameTicketFields = { game_date: date, game_id: 123, league: 'MLB', pick_text: 'Away ML +120' };
const prop: PropTicketFields = { game_date: date, game_id: '123', sport: 'NFL', player_name: 'Player', prop_type: 'passing_yards', line_value: 0, bet: 'over' };
const gameIdentity: string | null = gameTicketIdentity(game);
const propIdentity: string | null = propTicketIdentity(prop);
// @ts-expect-error Published ticket fields are readonly.
game.pick_text = 'Home ML -150';
// @ts-expect-error Provider IDs are strings or numbers, never booleans.
gameTicketIdentity({ ...game, game_id: true });
// @ts-expect-error Ticket dates cannot receive kickoff instants.
propTicketIdentity({ ...prop, game_date: kickoff });

const payload: unknown = { data: [{ id: 1 }] };
const rows: unknown[] = decodeBdlRows(payload);
const sdkRows: unknown[] = decodeBdlSdkRows(payload);
const item: object | null = decodeBdlSdkItem(payload);
// @ts-expect-error An envelope is not a validated game schema.
const unvalidatedGameId: number = rows[0].id;
const measured: number | null = finiteMarketNumber(0);
const spread: number | null = spreadForSide({ spread_home: null, spread_away: '0' }, 'home');
// @ts-expect-error A missing measurement cannot silently become a number.
const inventedZero: number = finiteMarketNumber(null);
footballMarketUnavailable({ spread_home: -3, spread_home_odds: -110 }, 'NFL');
void [gameDate, wrongDate, gameIdentity, propIdentity, sdkRows, item, unvalidatedGameId, measured, spread, inventedZero];
