"use client";
import { useState } from "react";
import type { Record_ } from "@/lib/gary/results";
export function RecordDashboard({
  allTime,
  recent,
}: {
  allTime: Record_;
  recent: Record_;
}) {
  const [period, setPeriod] = useState("all");
  const r = period === "all" ? allTime : recent;
  return (
    <section className="site-record-dashboard">
      <div className="site-board-controls">
        <div aria-label="Record period">
          <button
            aria-pressed={period === "all"}
            onClick={() => setPeriod("all")}
          >
            All Time
          </button>
          <button
            aria-pressed={period === "month"}
            onClick={() => setPeriod("month")}
          >
            Last 30 Days
          </button>
        </div>
        <span>GAME PICKS</span>
      </div>
      <div className="site-record-main">
        <div>
          <p className="site-eyebrow">
            {period === "all" ? "ALL-TIME GAME PICKS" : "LAST 30 DAYS"}
          </p>
          <p className="site-record-total">
            {r.wins.toLocaleString()}
            <span>—</span>
            {r.losses.toLocaleString()}
          </p>
          <p className="site-record-legend">
            Wins
            <span />
            Losses
          </p>
        </div>
        <div className="site-record-rate">
          <strong>
            {r.wins + r.losses ? r.pct : "—"}
            <span>%</span>
          </strong>
          <p>Win rate</p>
          <small>Excludes pushes</small>
        </div>
      </div>
      <div
        className="site-record-bar"
        role="img"
        aria-label={`${r.wins} wins, ${r.losses} losses, ${r.pushes} pushes`}
      >
        <span style={{ width: `${r.pct}%` }} />
      </div>
      <div className="site-record-fine">
        <span>
          {r.graded.toLocaleString()} graded · {r.pushes} pushes
        </span>
        <span>
          {r.netUnits >= 0 ? "+" : ""}
          {r.netUnits.toFixed(1)} units · Flat 1-unit stakes
        </span>
      </div>
    </section>
  );
}
