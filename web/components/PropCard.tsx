"use client";
import type { PropPick } from "@/lib/gary/types";
import { NativePickCard, type CardFinish } from "./picks/native-card";
import { applyCardResult, cardDate, type CardResults } from "./picks/grade";
import { useCardResults } from "./picks/use-card-results";
import { propCardPick } from "./picks/model";
export function PropCard({
  prop,
  finish = "dark",
  date,
  shareHref,
  initialResults,
  stakeUnits,
}: {
  prop: PropPick;
  expanded?: boolean;
  finish?: CardFinish;
  date?: string;
  shareHref?: string;
  initialResults?: CardResults;
  stakeUnits?: number | null;
}) {
  const result = useCardResults(cardDate(prop, date));
  const card = applyCardResult(
    propCardPick(prop),
    prop,
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
