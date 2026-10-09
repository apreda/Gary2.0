import Image from "next/image";
import Link from "next/link";
import { Icon } from "./Icon";
export function Journal() {
  return (
    <section className="app-section" aria-labelledby="desk-heading">
      <div className="app-section-head">
        <h2 id="desk-heading">From Gary’s desk</h2>
      </div>
      <div className="site-journal">
        <Link href="/how-it-works" className="site-feature-story site-venue-story">
          <Image
            src="/site/venue-football.webp"
            alt=""
            fill
            loading="lazy"
            sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1392px) 46vw, 623px"
          />
          <div>
            <span className="site-eyebrow">INSIDE THE PICK</span>
            <h3>
              The matchup.
              <br />
              The number.
              <br />
              The whole picture.
            </h3>
            <span>
              Three questions before game time
              <Icon />
            </span>
          </div>
        </Link>
        <div className="site-story-stack">
          <Link href="/how-it-works" className="site-venue-story site-venue-basketball">
            <Image
              src="/site/venue-basketball.webp"
              alt=""
              fill
              loading="lazy"
              sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1392px) 46vw, 623px"
            />
            <span className="site-eyebrow">
              THE BASICS
              <Icon />
            </span>
            <h3>
              The right team.
              <br />
              The wrong price.
            </h3>
            <p>Why liking a team and liking a bet are two different things.</p>
          </Link>
          <Link href="/results" className="site-venue-story site-venue-baseball">
            <Image
              src="/site/venue-baseball.webp"
              alt=""
              fill
              loading="lazy"
              sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1392px) 46vw, 623px"
            />
            <span className="site-eyebrow">
              ON THE RECORD
              <Icon />
            </span>
            <h3>
              The losses
              <br />
              belong here, too.
            </h3>
            <p>What a useful track record should actually tell you.</p>
          </Link>
        </div>
      </div>
    </section>
  );
}
