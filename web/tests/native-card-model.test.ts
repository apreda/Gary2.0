import { describe, expect, it } from "vitest";
import { cardTeamName, gameCardPick, propCardPick } from "@/components/picks/model";
import { applyCardResult, type CardResults } from "@/components/picks/grade";
const pick = {
  league: "MLB",
  pick: "Mets ML +108",
  awayTeam: "New York Mets",
  homeTeam: "Miami Marlins",
  commence_time: "2026-09-07T23:00:00Z",
  rationale: "Original reasoning.\n\nOriginal second paragraph.",
  rationale_plain: "Different old plain tier.",
};
const result = {
  game_date: "2026-09-07",
  league: "MLB",
  matchup: "Mets at Marlins",
  pick_text: "Mets ML +108",
  result: "won",
  final_score: "NYM 9 · MIA 4",
  confidence: null,
};
const data: CardResults = {
  date: "2026-09-07",
  games: [result],
  props: [],
  live: [],
  slate: [],
};
describe("shared native card data", () => {
  it("preserves the original reasoning and app headline", () => {
    const c = gameCardPick(pick);
    expect(c).toMatchObject({
      team: "Mets",
      market: "Moneyline",
      opponent: "Marlins",
      away: true,
      odds: "+108",
      summary: "Original reasoning.",
      case: ["Original second paragraph."],
    });
  });
  it.each(["Ohio State", "North Carolina", "Texas A&M"])(
    "keeps unknown/college name %s intact",
    (name) => {
      expect(
        gameCardPick({
          ...pick,
          league: "NCAAF",
          pick: `${name} ML -110`,
          awayTeam: name,
        }).team,
      ).toBe(name);
    },
  );
  it.each(["Red Sox", "White Sox", "Blue Jays"])(
    "preserves multiword team %s",
    (name) => {
      expect(
        gameCardPick({
          ...pick,
          pick: `${name} ML -110`,
          awayTeam: `City ${name}`,
        }).team,
      ).toBe(name);
    },
  );
  it("uses school names for the NCAAF headline and opponent without changing the pick", () => {
    const p = {
      ...pick,
      league: "NCAAF",
      pick: "Coastal Carolina Chanticleers +4.5 -105",
      awayTeam: "Coastal Carolina Chanticleers",
      homeTeam: "Delaware Blue Hens",
    };
    expect(gameCardPick(p)).toMatchObject({
      team: "Coastal Carolina", market: "+4.5", opponent: "Delaware",
      away: true, odds: "-105",
    });
    expect(gameCardPick({ ...p, pick: "Delaware Blue Hens ML -120" })).toMatchObject({
      team: "Delaware", market: "Moneyline", opponent: "Coastal Carolina", away: false,
    });
    expect(gameCardPick({ ...p, pick: "Over 51.5 -110" })).toMatchObject({
      team: "Over 51.5", market: "Total Points",
      opponent: "Coastal Carolina @ Delaware", meta: "Coastal Carolina @ Delaware",
    });
    expect(p.pick).toBe("Coastal Carolina Chanticleers +4.5 -105");
    expect(p.awayTeam).toBe("Coastal Carolina Chanticleers");
  });
  it.each([
    ["Ohio State Buckeyes", "Ohio State"],
    ["NC State Wolfpack", "NC State"],
    ["Texas A&M Aggies", "Texas A&M"],
    ["Delaware State Hornets", "Delaware State"],
    ["Miami (OH) RedHawks", "Miami (OH)"],
    ["San José State Spartans", "San José State"],
    ["Unknown College Wildcats", "Unknown College Wildcats"],
  ])("keeps the correct NCAAF school identity for %s", (name, school) => {
    expect(cardTeamName(name, "NCAAF")).toBe(school);
  });
  it("formats NCAAF school-only calls and prop team labels through the same table", () => {
    expect(gameCardPick({ league: "NCAAF", pick: "Coastal Carolina Chanticleers ML -110" }))
      .toMatchObject({ team: "Coastal Carolina", market: "Moneyline" });
    expect(propCardPick({ league: "NCAAF", player: "Player", team: "Delaware Blue Hens" }))
      .toMatchObject({ team: "Player", opponent: "Delaware" });
    expect(cardTeamName("Carolina Panthers", "NFL")).toBe("Panthers");
    expect(cardTeamName("Coastal Carolina Chanticleers", "NCAAB")).toBe("Coastal Carolina Chanticleers");
  });
  it("resolves a unique city selection without choosing an ambiguous city", () => {
    expect(
      gameCardPick({
        ...pick,
        pick: "Colorado ML -110",
        awayTeam: "Colorado Rockies",
      }),
    ).toMatchObject({ team: "Rockies", opponent: "Marlins", away: true });
    expect(
      gameCardPick({
        ...pick,
        pick: "New York ML -110",
        awayTeam: "New York Mets",
        homeTeam: "New York Yankees",
      }).meta,
    ).toBe("Mets @ Yankees");
  });
  it.each([
    ["MLB", "Total Runs"],
    ["NFL", "Total Points"],
    ["WC", "Total Goals"],
  ])("uses the correct total label for %s", (league, market) => {
    expect(
      gameCardPick({ ...pick, league, pick: "Under 8.5 -110" }),
    ).toMatchObject({ team: "Under 8.5", market });
  });
  it("keeps zero prop lines and native market order", () => {
    expect(
      propCardPick({
        player: "Player",
        prop: "hits",
        bet: "over",
        line: 0,
        odds: 110,
      }),
    ).toMatchObject({ market: "Hits over 0", odds: "+110" });
  });
  it("does not fabricate odds or call a Winners selection a win", () => {
    expect(gameCardPick({ pick: "Draw" })).toMatchObject({
      odds: "",
      market: "",
    });
    expect(gameCardPick(pick).result).toBeUndefined();
  });
  it("shows exact grade and flat $100 profit only on an actual win", () => {
    expect(
      applyCardResult(
        gameCardPick(pick),
        pick,
        data,
        Date.parse("2026-09-08T10:00:00Z"),
      ),
    ).toMatchObject({
      result: "won",
      resultLine: "CASHED · NYM 9 · MIA 4",
      payout: "+$108",
    });
  });
  it("never borrows a prior result for an upcoming game or different date", () => {
    const p = { ...pick, commence_time: "2026-09-08T23:00:00Z" };
    expect(
      applyCardResult(
        gameCardPick(p),
        p,
        data,
        Date.parse("2026-09-08T10:00:00Z"),
      ).result,
    ).toBeUndefined();
  });
  it("rejects ambiguous grades and doubleheader matchup-only grades", () => {
    expect(
      applyCardResult(gameCardPick(pick), pick, {
        ...data,
        games: [result, result],
      }).result,
    ).toBeUndefined();
    const row = {
      league: "MLB",
      away_team: pick.awayTeam,
      home_team: pick.homeTeam,
      commence_time: pick.commence_time,
    };
    expect(
      applyCardResult(gameCardPick(pick), pick, { ...data, slate: [row, row] })
        .result,
    ).toBeUndefined();
  });
  it("does not match a prop to a different side, line, or sport", () => {
    const p = {
      league: "MLB",
      player: "Player",
      prop: "hits",
      bet: "over",
      line: 1.5,
      matchup: "Mets @ Marlins",
      commence_time: pick.commence_time,
    };
    const r = {
      game_date: data.date,
      player_name: "Player",
      prop_type: "hits",
      line_value: 1.5,
      actual_value: 2,
      result: "won",
      odds: "+110",
      pick_text: null,
      matchup: "Mets at Marlins",
      bet: "under",
      sport: "MLB",
    };
    expect(
      applyCardResult(propCardPick(p), p, { ...data, props: [r] }).result,
    ).toBeUndefined();
    expect(
      applyCardResult(propCardPick(p), p, {
        ...data,
        props: [{ ...r, bet: "over", sport: "NFL" }],
      }).result,
    ).toBeUndefined();
    expect(
      applyCardResult(propCardPick(p), p, {
        ...data,
        props: [{ ...r, bet: "over" }],
      }).result,
    ).toBe("won");
  });
  it.each(["suspended", "postponed", "cancelled", "delayed"])(
    "suppresses stale settlement for an interrupted %s game",
    (status) => {
      const p = { ...pick, bdl_game_id: "42" };
      const slate = [
        {
          league: "MLB",
          away_team: p.awayTeam,
          home_team: p.homeTeam,
          commence_time: p.commence_time,
          bdl_game_id: "42",
          game_status: status,
          status_detail: "Provider interruption",
        },
      ];
      const d = { ...data, slate };
      expect(applyCardResult(gameCardPick(p), p, d)).toMatchObject({
        resultLine: "Provider interruption",
      });
      expect(applyCardResult(gameCardPick(p), p, d).result).toBeUndefined();
      expect(
        applyCardResult(gameCardPick(p), p, {
          ...d,
          live: [
            {
              date: data.date,
              league: "MLB",
              game_id: "42",
              away_abbr: "NYM",
              home_abbr: "MIA",
              away_score: 9,
              home_score: 4,
              status: "final",
              detail: null,
            },
          ],
        }).result,
      ).toBeUndefined();
    },
  );
  it("never presents scheduled zero scores as a live score", () => {
    const p = { ...pick, bdl_game_id: "42" };
    expect(
      applyCardResult(gameCardPick(p), p, {
        ...data,
        live: [
          {
            date: data.date,
            league: "MLB",
            game_id: "42",
            away_abbr: "NYM",
            home_abbr: "MIA",
            away_score: 0,
            home_score: 0,
            status: "scheduled",
            detail: null,
          },
        ],
      }),
    ).toMatchObject({ resultLine: "SCHEDULED" });
  });
});
