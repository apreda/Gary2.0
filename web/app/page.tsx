import Link from "next/link";
import { BoardDateNotice } from "@/components/BoardDateNotice";
import { Journal } from "@/components/site/Sections";
import { HomeBoard, type HomeBoardItem } from "@/components/site/HomeBoard";
import { FreePickReasons } from "@/components/site/FreePick";
import { NightHero } from "@/components/site/NightHero";
import { Icon } from "@/components/site/Icon";
import { AppStoreButton } from "@/components/AppStoreButton";
import { fetchTodayGamePicks } from "@/lib/gary/picks";
import { fetchArchiveGamePicks } from "@/lib/gary/archive";
import { fetchFreePicks } from "@/lib/gary/free-pick";
import { fetchFreePickCard, type FreePickCard } from "@/lib/gary/free-pick-card";
import { fetchWinnersNight } from "@/lib/gary/winners-recap";
import { fetchDailySlate } from "@/lib/gary/board";
import { normalizeLeague } from "@/lib/gary/leagues";
import { etDateLabel } from "@/lib/gary/format";
import {
  fetchAllGameResults,
  computeRecord,
  sinceDate,
} from "@/lib/gary/results";
import {
  todayEST,
  daysAgoEST,
  daysBefore,
  hubGradedDateEST,
} from "@/lib/gary/dates";
import { pageMetadata } from "@/lib/seo/metadata";
export const revalidate = 120;
export const metadata = pageMetadata({
  canonical: "/",
  title: "Free Pick of the Day: AI Sports Picks for MLB & NFL | Gary AI",
  description:
    "Gary’s free pick of the day, with his reasons. Game and prop picks for every MLB, NFL and college football game, and every result on the record.",
});
/**
 * The latest published days before today, whole days, until they hold
 * enough picks to fill the row (a playoff day can have one game).
 */
async function previousBoard(from: string, skip: (item: HomeBoardItem) => boolean, want = 3, days = 7) {
  const items: HomeBoardItem[] = [];
  for (let i = 0; i < days && items.length < want; i++) {
    const date = daysBefore(from, i);
    const picks = await fetchArchiveGamePicks(date).catch(() => []);
    items.push(...picks.map((pick) => ({ pick, date })).filter((item) => !skip(item)));
  }
  return items;
}

/** The free pick already has its own card in the hero, as on the app's Winners page. */
function isFreeCard(cards: (FreePickCard | null)[]) {
  return ({ pick, date }: HomeBoardItem) =>
    cards.some(
      (c) =>
        c?.kind === "game" &&
        c.date === date &&
        String(c.pick.game_id ?? "") === String(pick.game_id ?? "") &&
        c.pick.pick === pick.pick,
    );
}

/** The leagues Gary picks in the app (NHL is held out of it). */
const PICKED = new Set(["MLB", "NFL", "NCAAF", "NBA"]);

/** Today's first game still to start, for the card that waits on today's free pick. */
async function firstGame(date: string): Promise<{ league: string | null; time: string | null }> {
  const slate = await fetchDailySlate(date).catch(() => []);
  const now = Date.now();
  const next = slate
    .map((g) => ({ g, at: g.commence_time ? new Date(g.commence_time).getTime() : NaN }))
    .filter(({ g, at }) => Number.isFinite(at) && at > now && PICKED.has(normalizeLeague(g.league) ?? ""))
    .sort((a, b) => a.at - b.at)[0];
  if (!next) return { league: null, time: null };
  const time = new Date(next.at).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
  return { league: normalizeLeague(next.g.league) ?? null, time: `${time} ET` };
}

/** "Tue, Oct 13", or "Sun, Oct 11 to Tue, Oct 13" across days. */
function boardDates(items: HomeBoardItem[]): string {
  const dates = [...new Set(items.map((i) => i.date))].sort();
  if (!dates.length) return "";
  const first = etDateLabel(dates[0]);
  const last = etDateLabel(dates[dates.length - 1]);
  return first === last ? first : `${first} to ${last}`;
}

// Home opens on Gary's Night (founder, Oct 14 2026): Gary in last night's
// Winners face, the app's screens, the app icon as the way in, and today's
// free pick and the one before it on the app's pick cards; then the picks
// on the app's cards and the record.
export default async function Home() {
  const date = todayEST();
  const [free, picks, results, night, teaser] = await Promise.all([
    fetchFreePicks(date).catch(() => null),
    fetchTodayGamePicks(),
    fetchAllGameResults().catch(() => null),
    fetchWinnersNight(daysBefore(date, 1)).catch(() => null),
    firstGame(date),
  ]);
  const [todayCard, lastCard] = await Promise.all([
    fetchFreePickCard(free?.today ?? null).catch(() => null),
    fetchFreePickCard(free?.last ?? null).catch(() => null),
  ]);
  // Keep the product visible before today's picks publish, using the actual
  // previous boards with their own dates and grades, never illustrative
  // picks. They start the day before the active board, which rolls over at
  // 6 AM Eastern.
  const previousDate = hubGradedDateEST();
  const skip = isFreeCard([todayCard, lastCard]);
  const showcase: HomeBoardItem[] = picks.length
    ? picks.map((pick) => ({ pick, date })).filter((item) => !skip(item))
    : await previousBoard(previousDate, skip);
  const featured = free?.today ?? free?.last ?? null;
  const all = results ? computeRecord(results) : null;
  const recent = results
    ? computeRecord(sinceDate(results, daysAgoEST(30)))
    : null;
  return (
    <main className="app-home">
      <NightHero
        date={date}
        yesterday={daysBefore(date, 1)}
        night={night}
        today={free?.today ?? null}
        todayCard={todayCard}
        teaser={teaser}
        last={free?.last ?? null}
        lastCard={lastCard}
      />
      <div className="app-page">
      {featured && <FreePickReasons pick={featured} />}

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
              <p className="app-note mb-4">{boardDates(showcase)}</p>
            )}
            <HomeBoard items={showcase} />
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
      </div>
    </main>
  );
}
