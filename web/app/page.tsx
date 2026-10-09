import Link from "next/link";
import { BoardDateNotice } from "@/components/BoardDateNotice";
import { Journal } from "@/components/site/Sections";
import { HomeBoard } from "@/components/site/HomeBoard";
import { FreePick, FreePickPending } from "@/components/site/FreePick";
import { Icon } from "@/components/site/Icon";
import { AppStoreButton } from "@/components/AppStoreButton";
import { fetchTodayGamePicks } from "@/lib/gary/picks";
import { fetchArchiveGamePicks } from "@/lib/gary/archive";
import { fetchFreePick } from "@/lib/gary/free-pick";
import { etDateLabel } from "@/lib/gary/format";
import {
  fetchAllGameResults,
  computeRecord,
  sinceDate,
} from "@/lib/gary/results";
import { todayEST, daysAgoEST, hubGradedDateEST } from "@/lib/gary/dates";
import { pageMetadata } from "@/lib/seo/metadata";
export const revalidate = 120;
export const metadata = pageMetadata({
  canonical: "/",
  title: "Free Pick of the Day: AI Sports Picks for MLB & NFL | Gary AI",
  description:
    "Gary’s free pick of the day, with his reasons. Game and prop picks for every MLB, NFL and college football game, and every result on the record.",
});
// Home is the app's Winners page first (founder, Oct 9 2026: "mainly the
// Free Pick of the Day and getting people to go to the app"): the free
// pick on the app's ticket, one way to the App Store, then today's picks on
// the app's cards and the record.
export default async function Home() {
  const date = todayEST();
  const [free, picks, results] = await Promise.all([
    fetchFreePick(date).catch(() => null),
    fetchTodayGamePicks(),
    fetchAllGameResults().catch(() => null),
  ]);
  // Keep the product visible before today's picks publish, using the actual
  // previous board with its own date and grades, never illustrative picks.
  // Use the day before the active board, which rolls over at 3 AM Eastern.
  const previousDate = hubGradedDateEST();
  const previous =
    picks.length === 0
      ? await fetchArchiveGamePicks(previousDate).catch(() => [])
      : [];
  const showcase = picks.length ? picks : previous;
  const showcaseDate = picks.length ? date : previousDate;
  const all = results ? computeRecord(results) : null;
  const recent = results
    ? computeRecord(sinceDate(results, daysAgoEST(30)))
    : null;
  return (
    <main className="app-page">
      {free ? <FreePick pick={free} /> : <FreePickPending />}

      <section className="app-section" id="board" aria-labelledby="board-heading">
        <div className="app-section-head">
          <h2 id="board-heading">
            {picks.length ? "Today’s picks" : "Previous picks"}
          </h2>
          <Link href="/picks" className="app-head-link">
            All picks
            <Icon name="chevron" size={15} />
          </Link>
        </div>
        <BoardDateNotice date={date} className="mb-4" />
        {showcase.length ? (
          <>
            {!picks.length && (
              <p className="app-note mb-4">{etDateLabel(previousDate)}</p>
            )}
            <HomeBoard picks={showcase} date={showcaseDate} />
          </>
        ) : (
          <div className="lab-plate app-empty">
            <p>Gary’s next picks will appear here when published.</p>
            <Link href="/picks" className="app-action">
              Today’s picks
              <Icon name="chevron" size={18} />
            </Link>
          </div>
        )}
      </section>

      <section className="app-section" aria-labelledby="record-heading">
        <div className="app-section-head">
          <h2 id="record-heading">The record</h2>
          <Link href="/results" className="app-head-link">
            Every result
            <Icon name="chevron" size={15} />
          </Link>
        </div>
        <div className="app-record">
          {[
            { record: all, label: "All-time game picks" },
            { record: recent, label: "Last 30 days" },
          ].map(({ record, label }) => (
            <div className="lab-plate app-record-tile" key={label}>
              <strong className="tnum">
                {record ? record.wins.toLocaleString() : "—"}
                <span>–</span>
                {record ? record.losses.toLocaleString() : "—"}
              </strong>
              <span>{label}</span>
              <p>
                {record && record.wins + record.losses > 0
                  ? `${record.pct}% won`
                  : record
                    ? "No decided picks yet"
                    : "Record temporarily unavailable"}
              </p>
            </div>
          ))}
        </div>
        <p className="app-note">
          Game picks, updated {etDateLabel(date)}. Player props are reported
          separately. A win rate does not show profit.
        </p>
      </section>

      <Journal />

      <section className="app-section app-closing" aria-labelledby="app-heading">
        <div className="app-section-head">
          <h2 id="app-heading">Gary on iPhone</h2>
        </div>
        <div className="lab-plate app-closing-plate">
          <p>
            The free pick every day, game and prop picks for every game, Gary’s
            best bets in Winners and every result as it lands.
          </p>
          <AppStoreButton surface="home_app_section" className="app-action-lg" />
        </div>
      </section>
    </main>
  );
}
