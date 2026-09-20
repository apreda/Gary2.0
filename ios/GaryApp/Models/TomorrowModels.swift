import Foundation
import CoreFoundation

// MARK: - Tomorrow Board (the look-ahead "TOMORROW" Home state — tomorrow_board)
//
// Server (writeTomorrowBoard / tomorrowService.js) precomputes everything the app
// renders: the earliest-game countdown + its sport, the full scoreboard with
// short abbrs + marquee flags, the big-games-to-watch list, and the by-sport
// probable-starters + key-returns rolls. The app does ZERO slate math — it just
// renders the strings and ticks the countdown.
struct TomorrowBoard: Decodable {
    let date: String
    let countdown_iso: String?      // ISO8601 of earliest game; nil => no slate yet
    let countdown_sport: String?    // "MLB"/"WC"/"NBA"/"NHL"/... -> hero term map
    let countdown_matchup: String?  // opening game(s), e.g. "BOS @ NYY" (names the kickoff)
    let game_count: Int
    let any_lines: Bool             // false => hero "lines open soon", board shows all "—"
    let board: [TomorrowBoardRow]
    let big_games: [TomorrowBigGame]
    let starters: [TomorrowPerson]
    let returns: [TomorrowPerson]
    // The tabbed look-ahead table's extra lanes (server-precomputed, grounded).
    // All optional — older rows without these fields still decode.
    let form: [TomorrowForm]?
    let run_profile: [TomorrowRunProfile]?
    let weather: [TomorrowWeather]?
    // Grounded league-average ERA (PA-weighted mean across tomorrow's
    // probable starters) — the baseline the Starters lane colors each pitcher's
    // ERA against (below avg = good/green, above = bad/red). Optional;
    // older rows without these still decode.
    let league_avg_era: Double?
}

struct TomorrowBoardRow: Decodable {   // mirrors DailySlateRow + presentation extras
    let league: String?
    let away_team: String?
    let home_team: String?
    let away_abbr: String?           // precomputed short codes (NYY @ BOS)
    let home_abbr: String?
    let commence_time: String?
    /// Explicit NCAAF kickoff contract. Date-only games carry scheduled_date,
    /// nil commence_time, and render TIME TBD rather than an invented hour.
    let scheduled_date: String?
    let kickoff_status: String?       // confirmed | date_only
    let game_status: String?          // scheduled | live | final | interruption state
    let status_detail: String?        // provider-authored render label
    /// BallDontLie game id (Jul 22 2026, doubleheader identity) — nil on
    /// rows written before the change.
    let bdl_game_id: Int?
    let venue: String?
    let spread: Double?
    let ml_home: Double?
    let ml_away: Double?
    let total: Double?
    let is_marquee: Bool?            // gold star + tinted row
    let park: TomorrowPark?          // tonight's venue factor
    // Rail ladder inputs (Aug 14): day-opening moneylines (stamped by the
    // day's first board write, carried through refreshes), the posted
    // 1st-inning-runs market, and each lineup's OPS vs the opposing
    // probable's hand.
    let ml_open_home: Double?
    let ml_open_away: Double?
    let nrfi: TomorrowNRFI?
    let vs_hand: TomorrowVsHand?
    /// Season series between the clubs (scout lane, Jul 7) — record from
    /// tonight's AWAY side's perspective, the leader's venue split, and the
    /// last three meetings. nil until the clubs have met this season.
    let series: TomorrowSeries?
    /// THE ARMS IN GARY'S VOICE (Aug 4) — two sentences on the game's two
    /// starters, generated at board-publish time. nil = the section stays out
    /// until both probables are posted and the completed board refresh lands.
    let arms_take: String?

    var isInterrupted: Bool {
        switch game_status?.lowercased() {
        case "delayed", "postponed", "suspended", "cancelled": true
        default: false
        }
    }

    var interruptionLabel: String? {
        guard isInterrupted else { return nil }
        if let provider = status_detail?.trimmingCharacters(in: .whitespacesAndNewlines),
           !provider.isEmpty { return provider.uppercased() }
        return game_status?.uppercased()
    }

    var hasConfirmedKickoff: Bool {
        kickoff_status != "date_only" && commence_time?.isEmpty == false
    }

    var kickoffTimeLabel: String? {
        kickoff_status == "date_only" ? "TIME TBD" : nil
    }
}

// SEASON SERIES — this season's finished meetings between tonight's clubs.
struct TomorrowNRFI: Decodable {
    let over: Int?                   // american odds, YRFI side (over 0.5)
    let under: Int?                  // american odds, NRFI side (under 0.5)
    let vendor: String?
}

struct TomorrowVsHand: Decodable {
    let away: TomorrowVsHandSide?
    let home: TomorrowVsHandSide?
}
struct TomorrowVsHandSide: Decodable {
    let faces: String?               // opposing probable's hand: "L" | "R"
    let ops_vs: Double?              // this lineup's season OPS vs that hand
    let ops_other: Double?           // ...and vs the other hand (gap check)
}

struct TomorrowPark: Decodable {
    let name: String?                // "Wrigley Field"
    let pct: Int?                    // runs factor vs league, signed percent (+3, -12, 0)
    let type: String?                // "hitter" | "pitcher" | "neutral" | "variable"
}

struct TomorrowSeries: Decodable {
    let away_w: Int?
    let home_w: Int?
    let leader: String?              // "away" | "home"
    let split_line: String?          // "2-1 AT BUSCH · 3-0 AT AMFAM" (leader's record)
    let meetings: [TomorrowMeeting]?
}
struct TomorrowMeeting: Decodable {
    let d: String?                   // "JUL 6"
    let line: String?                // "MIL 4 · STL 3"
    let venue: String?               // "at Busch"
    let won: String?                 // "away" | "home" — tonight's away side's result
}

struct TomorrowBigGame: Decodable {
    let rank: Int                    // 1,2,3
    let league: String?
    let matchup: String?            // "Yankees @ Red Sox" (full names, mock style)
    // The current divisional standing as PLAIN TEXT (no chip), e.g.
    // "Yankees 1st · Red Sox 5th, AL East" — replaces the old `reason` chip.
    let standing: String?
    let context: String?            // "AL East · Cole vs Crochet"
    let commence_time: String?      // for the right-aligned time "7:10"
    let bdl_game_id: Int?           // exact provider identity for Home joins
    // Probable starters (MLB only) — last names; "Undecided" when unposted.
    // WC big games leave these nil → no pitcher line rendered.
    let awayPitcher: String?
    let homePitcher: String?
    // Backend mirror of the same two values; kept optional / unused by the row.
    let pitchers: TomorrowBigGamePitchers?
}

struct TomorrowBigGamePitchers: Decodable {
    let away: String?
    let home: String?
}

struct TomorrowPerson: Decodable {   // starters AND returns share this
    let league: String?             // groups by sport sub-header
    let name: String?               // "G. Cole" / "Brazil XI"
    let team: String?
    let detail: String?             // legacy "NYY 2.41" string (kept for back-compat / returns status)
    // Structured starter fields (server-grounded). All optional — returns rows
    // and older board rows leave them nil.
    let abbr: String?               // team abbreviation (gold in the Starters lane)
    let era: Double?                // Savant season ERA | nil when unavailable
    let game: String?               // the game this starter is in, e.g. "HOU @ DET"
    let opponent: String?           // opposing team abbr | nil
    let home: Bool?                 // pitching at home?
    let full_name: String?          // un-abbreviated (backend id resolution)
    /// His most recent regular-season START (scout lane) — "5 IP · 1 ER vs CIN".
    let last_outing: TomorrowOuting?
    /// This season's starts vs TONIGHT's opponent. nil = hasn't faced them.
    let vs_opp: TomorrowVsOpp?
    /// Quality-start form (name-row tag: "3 STRAIGHT QS" / "1 QS IN LAST 4").
    let qs_form: TomorrowQsForm?
    /// Days of rest before this start. nil when no prior start this season.
    let rest: TomorrowRest?
    /// Last 2-3 starts aggregated. nil with fewer than 2 starts.
    let l3: TomorrowL3?
    /// Which GAME this arm starts (Jul 22 2026, doubleheader identity): ISO
    /// first pitch + 1/2 ordinal. Readers select starters BY GAME, never by
    /// team alone — two same-team arms share a date on doubleheader days.
    let game_time: String?
    let game_number: Int?
    /// Zero MLB data for this starter (no season ERA, no starts) — render the
    /// honest empty state instead of a blank plate. Never fake zeros.
    let no_mlb_starts: Bool?
    /// His labeled minor-league season line (AAA/AA) when StatsAPI has one.
    let milb: TomorrowMilb?
}

/// Minor-league season line for a debut starter — labeled by level so it can
/// never pass as an MLB number.
struct TomorrowMilb: Decodable {
    let level: String?              // "AAA" | "AA"
    let era: Double?
    let ip: String?                 // "89.0" (thirds notation)
    let k: Int?
}

struct TomorrowOuting: Decodable {
    let ip: String?                 // "5.0" (thirds notation)
    let er: Int?
    let k: Int?
    let opp: String?                // opposing abbr that day
    let at: String?                 // "vs" (home) | "at" (road)
    let date: String?               // "JUL 2"
}
struct TomorrowVsOpp: Decodable {
    let gs: Int?
    let ip: String?
    let er: Int?
    let era: Double?
}
/// Quality-start form over his last (up to) 5 starts — 6+ IP, ≤3 ER.
struct TomorrowQsForm: Decodable {
    let streak: Int?
    let qs: Int?
    let window: Int?
}
/// Days of rest before THIS start (pitched Jul 2, starts Jul 7 = 4 days).
struct TomorrowRest: Decodable {
    let days: Int?
}
/// His last 2-3 starts aggregated (thirds-notation IP).
struct TomorrowL3: Decodable {
    let gs: Int?
    let ip: String?
    let er: Int?
    let k: Int?
}

// FORM — per-team last-10 + current streak (grounded from standings).
struct TomorrowForm: Decodable {
    let league: String?
    let team: String?
    let abbr: String?
    let l10: String?                // "7-3"
    let streak: String?             // "W3" / "L1" / nil
    let home: Bool?                 // plays at home tomorrow
}

// RUN PROFILE — season scoring / run-prevention shape (grounded from standings).
struct TomorrowRunProfile: Decodable {
    let league: String?
    let team: String?
    let abbr: String?
    let runs_scored: Int?
    let runs_allowed: Int?
    let run_diff: Int?
    let rs_per_game: Double?
    let ra_per_game: Double?
    let home: Bool?
    // Stable pregame windows for THE BIG NUMBERS. Every window ends before
    // this board's slate date, so a card cannot change after users see it.
    let home_runs_l5: Int?
    let bullpen_era_l14: Double?
    let run_diff_l10: Int?
    let first_inning_scored_l10: Int?
    let streak_l: String?            // live streak, "W9" / "L4"
    let streak_longest: Bool?        // longest live streak in baseball (its sign)
    let runs_pg_l10: Double?         // runs scored per game, exact last 10
}

// WEATHER — outdoor-MLB first-pitch forecast (grounded; roofed parks omitted).
struct TomorrowWeather: Decodable {
    let league: String?
    let matchup: String?            // "Yankees @ Red Sox"
    let away_abbr: String?
    let home_abbr: String?
    let venue: String?
    let temp_f: Int?
    let wind_mph: Int?
    let precip_pct: Int?
    let note: String?               // "82° — ball carries" / "40% rain" / nil
    let commence_time: String?
}
