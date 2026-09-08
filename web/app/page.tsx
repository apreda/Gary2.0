import Link from "next/link";
import { BoardDateNotice } from "@/components/BoardDateNotice";
import {
  Hero,
  SportsStrip,
  Method,
  Journal,
  AppSection,
} from "@/components/site/Sections";
import { HomeBoard } from "@/components/site/HomeBoard";
import { Icon } from "@/components/site/Icon";
import { fetchDailySlate } from "@/lib/gary/board";
import { fetchTodayGamePicks } from "@/lib/gary/picks";
import {
  fetchAllGameResults,
  computeRecord,
  sinceDate,
} from "@/lib/gary/results";
import { todayEST, daysAgoEST } from "@/lib/gary/dates";
import { pageMetadata } from "@/lib/seo/metadata";
export const revalidate = 600;
export const metadata = pageMetadata({
  canonical: "/",
  title: "Gary AI — Your Game. Gary’s Take.",
  description:
    "Free sports picks with written reasoning and a public record. Explore the board, follow the results, and take Gary to every game with the free iPhone app.",
});
export default async function Home() {
  const date = todayEST();
  const [picks, results, slate] = await Promise.all([
    fetchTodayGamePicks(),
    fetchAllGameResults().catch(() => null),
    fetchDailySlate(date),
  ]);
  const all = results ? computeRecord(results) : null;
  const recent = results
    ? computeRecord(sinceDate(results, daysAgoEST(30)))
    : null;
  return (
    <main>
      <Hero />
      <SportsStrip />
      <section className="site-wrap site-section" id="board">
        <div className="site-section-heading">
          <div>
            <p className="site-eyebrow">PULL UP A SEAT.</p>
            <h2>Get a feel for the board.</h2>
          </div>
          <Link href="/picks" className="site-text-link">
            All Picks
            <Icon />
          </Link>
        </div>
        <BoardDateNotice date={date} className="mb-6" />
        {slate.length > 0 && (
          <p className="site-board-note mb-5">
            {slate.length} {slate.length === 1 ? "game" : "games"} on today’s
            board · {picks?.length || 0}{" "}
            {picks?.length === 1 ? "call" : "calls"} posted
          </p>
        )}
        {picks?.length ? (
          <HomeBoard picks={picks} />
        ) : (
          <div className="rounded-panel border border-line bg-card p-7">
            <p className="text-lg">
              {picks === null
                ? "The picks are temporarily unavailable."
                : "Gary’s next calls will appear here when published."}
            </p>
            <Link href="/picks" className="site-text-link mt-4">
              See Today’s Board
              <Icon name="right" />
            </Link>
          </div>
        )}
        <p className="site-board-note">
          Tap a card for Gary’s Take. Use the arrow on the back to keep reading.
        </p>
      </section>
      <section className="site-wrap site-record">
        <div className="site-record-intro">
          <p className="site-eyebrow">NO VICTORY LAPS WITHOUT RECEIPTS.</p>
          <h2>
            The whole record.
            <br />
            Even the rough nights.
          </h2>
          <Link href="/results" className="site-text-link">
            Check the Record
            <Icon />
          </Link>
        </div>
        {[
          { record: all, label: "ALL-TIME GAME PICKS" },
          { record: recent, label: "LAST 30 DAYS" },
        ].map(({ record, label }) => (
          <div className="site-record-stat" key={label}>
            <strong>
              {record ? record.wins.toLocaleString() : "—"}
              <span>—</span>
              {record ? record.losses.toLocaleString() : "—"}
            </strong>
            <span>{label} · W–L</span>
            <p>
              {record && record.wins + record.losses > 0
                ? `${record.pct}% win rate`
                : record
                  ? "No decided picks yet"
                  : "Record temporarily unavailable"}
            </p>
          </div>
        ))}
        <p className="site-record-source">
          Public game-pick record · Updated {date} · Player props are reported
          separately. Win rate does not indicate profitability.
        </p>
      </section>
      <Method />
      <Journal />
      <AppSection />
    </main>
  );
}
