"use client";
import type { GaryPick } from "@/lib/gary/types";
import { NativePickCard, type CardFinish } from "./picks/native-card";
import { applyCardResult, cardDate, type CardResults } from "./picks/grade";
import { useCardResults } from "./picks/use-card-results";
import { gameCardPick } from "./picks/model";
export function PickCard({
  pick,
  analysisHref,
  finish = "dark",
  date,
  shareHref,
  initialResults,
  stakeUnits,
}: {
  pick: GaryPick;
  expanded?: boolean;
  analysisHref?: string | null;
  finish?: CardFinish;
  date?: string;
  shareHref?: string;
  initialResults?: CardResults;
  stakeUnits?: number | null;
}) {
  const result = useCardResults(cardDate(pick, date));
  const card = applyCardResult(
    gameCardPick(pick, analysisHref),
    pick,
    result ?? initialResults ?? null,
    undefined,
    stakeUnits,
  );
  return (
    <NativePickCard
      pick={{ ...card, shareHref }}
      finish={finish}
      anchorId={card.id}
    />
  );
}
