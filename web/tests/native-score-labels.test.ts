import { expect, it } from "vitest";
import {
  nativeFinalScore,
  nativeTeamLabel,
} from "@/components/picks/score-labels";
const row = {
  game_date: "2026-09-07",
  league: "MLB",
  matchup: "Mets @ Marlins",
  pick_text: "Mets ML +108",
  result: "won",
  final_score: "9-4",
  confidence: null,
};
it("labels the real Mets receipt exactly as the app", () =>
  expect(nativeFinalScore(row)).toBe("NYM 9 · MIA 4"));
it("keeps the away-home orientation for a winning home pick", () =>
  expect(
    nativeFinalScore({
      ...row,
      matchup: "Guardians @ Orioles",
      pick_text: "Orioles ML -136",
      final_score: "4-6",
    }),
  ).toBe("CLE 4 · BAL 6"));
it("does not infer orientation from legacy NFL score text", () =>
  expect(
    nativeFinalScore({
      ...row,
      league: "NFL",
      matchup: "Chiefs @ Bills",
      final_score: "21-17",
    }),
  ).toBe("21-17"));
it("uses named NFL scores when supplied", () => {
  const r = {
    ...row,
    league: "NFL",
    matchup: "Chiefs @ Bills",
    away_score: 17,
    home_score: 21,
  };
  expect(nativeFinalScore(r)).toBe("KC 17 · BUF 21");
});
it("uses the same college codes and league-specific mascots as native", () => {
  expect(nativeTeamLabel("SMU Mustangs", "NCAAF")).toBe("SMU");
  expect(nativeTeamLabel("Florida State Seminoles", "NCAAF")).toBe("FSU");
  expect(nativeTeamLabel("Panthers", "NFL")).toBe("CAR");
  expect(nativeTeamLabel("Panthers", "NHL")).toBe("FLA");
});
