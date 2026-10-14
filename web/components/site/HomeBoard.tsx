"use client";
import { useState } from "react";
import { PickCard } from "@/components/PickCard";
import type { GaryPick } from "@/lib/gary/types";
/** Each pick with the board date it was published on. */
export interface HomeBoardItem {
  pick: GaryPick;
  date: string;
}
export function HomeBoard({ items }: { items: HomeBoardItem[] }) {
  const [sport, setSport] = useState("all");
  const sports = [
    "all",
    ...new Set(
      items
        .map(({ pick: p }) => (p.league || p.sport || "").toUpperCase())
        .filter(Boolean),
    ),
  ];
  return (
    <>
      {sports.length > 2 && (
        <div className="app-tabs" role="group" aria-label="Filter picks by sport">
          {sports.map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={sport === s}
              onClick={() => setSport(s)}
            >
              {s === "all" ? "All" : s === "NCAAF" ? "College" : s}
            </button>
          ))}
        </div>
      )}
      <div className="site-pick-grid">
        {items
          .filter(
            ({ pick: p }) =>
              sport === "all" ||
              (p.league || p.sport || "").toUpperCase() === sport,
          )
          .slice(0, 3)
          .map(({ pick: p, date }, i) => (
            <PickCard
              key={String(p.pick_id || p.game_id || i) + p.pick}
              pick={p}
              date={date}
              shareHref={`/archive/${date}`}
            />
          ))}
      </div>
    </>
  );
}
