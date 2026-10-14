import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { PickCard } from "@/components/PickCard";
import { PropCard } from "@/components/PropCard";
import { NativeTeasedCard } from "@/components/picks/native-teased";
import { FreeTicket } from "@/components/site/FreePick";
import { AppIconLink, NightFace } from "@/components/site/NightFace";
import { etDateLabel } from "@/lib/gary/format";
import type { FreePick } from "@/lib/gary/free-pick";
import type { FreePickCard } from "@/lib/gary/free-pick-card";
import type { GaryMood, WinnersNight } from "@/lib/gary/winners-recap";

// The home page's opening (founder, Oct 14 2026, mock 16 "Night Sunrise"):
// Gary in last night's face and its weather, last night's Winners under him,
// the app's own screens fanned beneath, the app's tab icons saying what's
// inside, the app icon as the way in, and today's free pick and yesterday's
// stacked on the app's real pick cards.

const MOOD_RGB: Record<GaryMood, string> = {
  fire: "255, 120, 30",
  cooking: "232, 160, 60",
  beer: "214, 170, 50",
  icecold: "120, 170, 230",
  doomsday: "110, 120, 140",
};

const FEATURES = [
  { icon: "picks", name: "Picks", line: "Every game and its best props" },
  { icon: "winners", name: "Winners", line: "His best bets, sealed until you open them" },
  { icon: "darts", name: "Darts", line: "Player props on the board" },
  { icon: "billfold", name: "Billfold", line: "Every result, win or loss" },
] as const;

const SCREENS = [
  { src: "/site/hero/screen-darts.jpg", alt: "The Darts board in the app: Gary’s player props as darts", side: "l" },
  { src: "/site/hero/screen-winners.jpg", alt: "Winners in the app: tonight’s pick sealed, more coming soon, yesterday’s results", side: "mid" },
  { src: "/site/hero/screen-home.jpg", alt: "Home in the app: last night’s result and tonight’s game", side: "r" },
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

export function NightHero({
  date,
  yesterday,
  night,
  today,
  todayCard,
  teaser,
  last,
  lastCard,
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
  lastCard: FreePickCard | null;
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
          <span className="night-dateline">{etDateLabel(date).toUpperCase()}</span>
          <h1 id="night-title" className="night-title">Bet with Gary.</h1>
          <ul className="night-features">
            {FEATURES.map((f) => (
              <li key={f.icon} data-f={f.icon}>
                <Image src={`/site/hero/tab-${f.icon}.png`} alt="" width={48} height={48} />
                <b>{f.name}</b>
                <span>{f.line}</span>
              </li>
            ))}
          </ul>
          <div className="night-get">
            <AppIconLink surface="home_hero_icon" />
            <Image className="night-qr" src="/site/hero/qr-app-store.svg" alt="" width={33} height={33} aria-hidden="true" unoptimized />
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
              <div key={s.side} className={`night-phone night-phone-${s.side}`}>
                <div className="night-phone-screen">
                  <Image src={s.src} alt={s.alt} width={540} height={1173} sizes="(max-width: 760px) 40vw, 240px" />
                </div>
              </div>
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
          {last && (
            <Slot label={last.date === yesterday ? "Yesterday" : "Last free pick"} date={last.date}>
              <FreeCard free={last} card={lastCard} />
            </Slot>
          )}
        </div>
      </div>
    </section>
  );
}
