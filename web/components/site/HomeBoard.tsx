"use client";
import { useState } from "react";
import { PickCard } from "@/components/PickCard";
import type { GaryPick } from "@/lib/gary/types";
export function HomeBoard({
  picks,
  date,
}: {
  picks: GaryPick[];
  date?: string;
}) {
  const [sport, setSport] = useState("all");
  const sports = [
    "all",
    ...new Set(
      picks
        .map((p) => (p.league || p.sport || "").toUpperCase())
        .filter(Boolean),
    ),
  ];
  return (
    <>
      <div className="site-board-controls">
        <div aria-label="Filter picks by sport">
          {sports.map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={sport === s}
              onClick={() => setSport(s)}
            >
              {s === "all" ? "All Sports" : s === "NCAAF" ? "College" : s}
            </button>
          ))}
        </div>
        <span>TAP A CARD TO FLIP</span>
      </div>
      <div className="site-pick-grid">
        {picks
          .filter(
            (p) =>
              sport === "all" ||
              (p.league || p.sport || "").toUpperCase() === sport,
          )
          .slice(0, 3)
          .map((p, i) => (
            <PickCard
              key={String(p.pick_id || p.game_id || i) + p.pick}
              pick={p}
              date={date}
              shareHref={date ? `/archive/${date}` : undefined}
            />
          ))}
      </div>
    </>
  );
}
