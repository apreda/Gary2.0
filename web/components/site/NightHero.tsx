import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { PickCard } from "@/components/PickCard";
import { PropCard } from "@/components/PropCard";
import { NativeTeasedCard } from "@/components/picks/native-teased";
import { FreeTicket } from "@/components/site/FreePick";
import { AppIconLink, NightFace } from "@/components/site/NightFace";
import { AppStoreButton } from "@/components/AppStoreButton";
import { etDateLabel } from "@/lib/gary/format";
import type { FreePick } from "@/lib/gary/free-pick";
import type { FreePickCard } from "@/lib/gary/free-pick-card";
import type { GaryMood, WinnersNight } from "@/lib/gary/winners-recap";

// The home page's opening (founder, Oct 14 2026, mock 16 "Night Sunrise"):
// Gary large in last night's face and its weather, last night's Winners under
// him, the name and the way in beside him, today's free pick on the app's real
// card with yesterday's result under it, and the app's own screens in a row
// underneath, each with its name, big enough to read without zooming (founder,
// Nov 5 2026: "it has to be visible nobody can zoom in and they shouldnt have to";
// restyled Nov 6 once those screens had moved out of the hero).

const MOOD_RGB: Record<GaryMood, string> = {
  fire: "255, 120, 30",
  cooking: "232, 160, 60",
  beer: "214, 170, 50",
  icecold: "120, 170, 230",
  doomsday: "110, 120, 140",
};

const TABS = [
  { icon: "picks", name: "Picks", href: "/picks" },
  { icon: "winners", name: "Winners", href: "/winners" },
  { icon: "darts", name: "Darts", href: "/props" },
  { icon: "billfold", name: "Billfold", href: "/results" },
] as const;

const SCREENS = [
  {
    name: "Home",
    line: "Tonight’s big game and last night’s result",
    src: "/site/hero/screen-home.webp",
    alt: "Home in the app: tonight’s big game, last night’s result and what Gary has on today",
  },
  {
    name: "Darts",
    line: "Player props on the board",
    src: "/site/hero/screen-darts.webp",
    alt: "Darts in the app: the parlay of the day and the Anytime TD board, each dart with how it finished",
  },
  {
    name: "Billfold",
    line: "Every result, win or loss",
    src: "/site/hero/screen-billfold.webp",
    alt: "Billfold in the app: Gary’s bankroll, record and win rate, with every result charted",
  },
] as const;

const dollars = (n: number) => `$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toUpperCase();

function Slot({ label, date, children }: { label: string; date: string; children: ReactNode }) {
  return (
    <div className="night-slot">
      <div className="night-slot-head">
        <h2>{label}</h2>
        <span>{etDateLabel(date)}</span>
      </div>
      {children}
    </div>
  );
}

function FreeCard({ free, card }: { free: FreePick; card: FreePickCard | null }) {
  if (card?.kind === "game") return <PickCard pick={card.pick} date={card.date} shareHref={`/archive/${card.date}`} />;
  if (card?.kind === "prop") return <PropCard prop={card.pick} date={card.date} shareHref={`/archive/${card.date}`} />;
  return <FreeTicket pick={free} />;
}

/** Yesterday's free pick on one line, the way Winners lists a settled play. */
function LastResult({ pick, label }: { pick: FreePick; label: string }) {
  const word = pick.result === "won" ? "Win" : pick.result === "lost" ? "Loss" : pick.result === "push" ? "Push" : "Pending";
  const mark = pick.direction === "over" ? " ▲" : pick.direction === "under" ? " ▼" : "";
  return (
    <Link href={`/archive/${pick.date}`} className="night-last">
      <span className="night-last-head">
        <b>{label}</b>
        <span>{etDateLabel(pick.date)}</span>
      </span>
      <span className="night-last-row">
        <b className={pick.result ?? "pending"}>{word}</b>
        <strong>{pick.title}{mark}</strong>
        {pick.score && <span>{pick.score}</span>}
      </span>
    </Link>
  );
}

export function NightHero({
  date,
  yesterday,
  night,
  today,
  todayCard,
  teaser,
  last,
}: {
  /** Today's ET date. */
  date: string;
  /** Yesterday's ET date. */
  yesterday: string;
  /** Last night's Winners, when it has a result. */
  night: WinnersNight | null;
  today: FreePick | null;
  todayCard: FreePickCard | null;
  /** The first game today, for the card that waits on today's pick. */
  teaser: { league: string | null; time: string | null };
  last: FreePick | null;
}) {
  const mood = night?.mood ?? null;
  return (
    <section
      className="night-hero"
      aria-labelledby="night-title"
      style={mood ? ({ "--mood": MOOD_RGB[mood] } as CSSProperties) : undefined}
    >
      <div className="night-inner">
        <div className="night-copy">
          <h1 id="night-title" className="night-title">Bet with Gary.</h1>
          <nav className="night-tabs" aria-label="Inside Gary">
            {TABS.map((t) => (
              <Link key={t.icon} href={t.href} data-f={t.icon}>
                <Image src={`/site/hero/tab-${t.icon}.png`} alt="" width={48} height={48} />
                <span>{t.name}</span>
              </Link>
            ))}
          </nav>
          <div className="night-get">
            <AppStoreButton surface="home_hero" className="app-action-lg" />
            <div className="night-get-tiles">
              <AppIconLink surface="home_hero_icon" />
              <Image className="night-qr" src="/site/hero/qr-app-store.svg" alt="" width={33} height={33} aria-hidden="true" unoptimized />
              <span className="night-qr-note">Scan with your phone</span>
            </div>
          </div>
        </div>

        <div className="night-stage">
          <NightFace
            mood={mood}
            alt={night ? `Gary after ${weekday(night.date).toLowerCase()}’s Winners` : "Gary"}
          />
          {night && (
            <div className="night-recap">
              <span className="night-recap-kicker">WINNERS · {weekday(night.date)}</span>
              <div className="night-recap-stats">
                <div>
                  <b className={night.net < 0 ? "down" : "up"}>{(night.net < 0 ? "-" : "+") + dollars(night.net)}</b>
                  <span>NET</span>
                </div>
                <div>
                  <b>{night.push ? `${night.won}–${night.lost}–${night.push}` : `${night.won}–${night.lost}`}</b>
                  <span>RECORD</span>
                </div>
                {night.bankroll !== null && (
                  <div>
                    <b>{dollars(night.bankroll)}</b>
                    <span>BANKROLL</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="night-fan" aria-label="Inside the app">
          <div className="night-fan-deck">
            {SCREENS.map((s) => (
              <figure key={s.src} className="night-shot">
                <figcaption>
                  <b>{s.name}</b>
                  <span>{s.line}</span>
                </figcaption>
                <div className="night-phone">
                  <div className="night-phone-screen">
                    <Image src={s.src} alt={s.alt} width={1206} height={2622} unoptimized />
                  </div>
                </div>
              </figure>
            ))}
          </div>
        </div>

        <div className="night-picks">
          <Slot label="Today’s free pick" date={date}>
            {today ? (
              <FreeCard free={today} card={todayCard} />
            ) : (
              <NativeTeasedCard league={teaser.league} time={teaser.time} />
            )}
          </Slot>
          {last && <LastResult pick={last} label={last.date === yesterday ? "Yesterday" : "Last free pick"} />}
        </div>
      </div>
    </section>
  );
}
