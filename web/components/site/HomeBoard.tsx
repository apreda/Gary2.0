"use client";
import { useState } from "react";
import { AppStoreButton } from "@/components/AppStoreButton";
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
  const shown = items
    .filter(
      ({ pick: p }) =>
        sport === "all" ||
        (p.league || p.sport || "").toUpperCase() === sport,
    )
    .slice(0, 3);
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
        {shown.map(({ pick: p, date }, i) => (
          <PickCard
            key={String(p.pick_id || p.game_id || i) + p.pick}
            pick={p}
            date={date}
            shareHref={`/archive/${date}`}
          />
        ))}
        {/* A short day keeps the row full: the rest of the row is the way into the app. */}
        {shown.length < 3 && (
          <div className="home-more">
            {/* eslint-disable-next-line @next/next/no-img-element -- a fixed pose */}
            <img src="/site/hero/gary-base.webp" alt="" width={568} height={900} />
            <div>
              <b>More in the app</b>
              <span>Props, Darts and Winners</span>
              <AppStoreButton surface="home_picks" label="Get the app" />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
