import { AppStoreButton } from "@/components/AppStoreButton";
import { etDateLabel } from "@/lib/gary/format";
import type { FreePick as FreePickData } from "@/lib/gary/free-pick";
import { shortMatchup } from "@/lib/gary/free-pick";

// The free pick, drawn the way the app's Winners page draws a ticket
// (LabTicketPlate in ios/GaryApp/WinnersLab/LabDesign.swift): the league
// and the matchup, the pick with the money stamped beside it, then the state
// with the book or direction and the price lying flat; Gary's reasons under
// it as the play page shows them (WHY IT MADE THE BOARD).

const ET = "America/New_York";

function money(units: number | null): string {
  if (!units || units <= 0) return "";
  const dollars = units * 100;
  const whole = Math.round(dollars) === dollars;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

/** Bigger money, brighter gold: $500 and up is full, $250 and up is most of it. */
function stampOpacity(units: number | null): number {
  if (!units) return 0.5;
  if (units >= 5) return 1;
  if (units >= 2.5) return 0.85;
  return 0.7;
}

function price(odds: number | null): string {
  if (odds === null) return "";
  return odds > 0 ? `+${odds}` : String(odds);
}

function clock(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    timeZone: ET,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** TNF / SNF / MNF / SNB for a night game, as the app's ticket says it. */
function primetime(iso: string | null, league: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const day = parts.find((p) => p.type === "weekday")?.value;
  if (!(hour >= 19)) return null;
  if (league === "NFL")
    return day === "Thu"
      ? "TNF"
      : day === "Sun"
        ? "SNF"
        : day === "Mon"
          ? "MNF"
          : null;
  if (league === "MLB" && day === "Sun") return "SNB";
  return null;
}

function stateLine(pick: FreePickData): { text: string; tone: string } {
  if (pick.result) {
    const word =
      pick.result === "won" ? "Win" : pick.result === "lost" ? "Loss" : "Push";
    return {
      text: pick.score ? `${word} · ${pick.score}` : word,
      tone: pick.result,
    };
  }
  const time = clock(pick.commence);
  const night = primetime(pick.commence, pick.league);
  return { text: night ? `${time} · ${night}` : time, tone: "open" };
}

const BOOK_TINT: Record<string, string> = {
  fanduel: "#1493FF",
  draftkings: "#61B510",
  betmgm: "#C0A971",
  caesars: "#BB9D5E",
  betrivers: "#FDB61B",
  fanatics: "#F6F1E7",
};

/** The reasons the board wrote; a ticket stored without them lists the first sentence of each paragraph of Gary's case. */
function reasonsFor(pick: FreePickData) {
  if (pick.reasons.length) return pick.reasons;
  const take = (pick.rationale ?? "").replace(/^\s*Gary'?s Take\s*\n+/i, "");
  return take
    .split(/\n\s*\n/)
    .map(
      (p) =>
        p
          .trim()
          .match(/^.*?[.!?](\s|$)/)?.[0]
          ?.trim() ?? "",
    )
    .filter(Boolean)
    .slice(0, 4)
    .map((claim) => ({ claim, why: "" }));
}

/** Five boxes, oldest on the left: the decided results, today's in gold while it waits, blanks to fill. */
function StreakForm({
  recent,
  pending,
}: {
  recent: ("W" | "L")[];
  pending: boolean;
}) {
  const decided = recent.slice(-(pending ? 4 : 5));
  const boxes: ("W" | "L" | "?" | "")[] = [
    ...decided,
    ...(pending ? (["?"] as const) : []),
  ];
  while (boxes.length < 5) boxes.push("");
  const wins = decided.filter((r) => r === "W").length;
  return (
    <span
      className="streak-form"
      role="img"
      aria-label={`Free pick form: ${wins} of the last ${decided.length} won${pending ? ", today's pick pending" : ""}`}
    >
      {boxes.map((b, i) => (
        <span
          key={i}
          className={`streak-box ${b === "W" ? "win" : b === "L" ? "loss" : b === "?" ? "pending" : "blank"}`}
        >
          {b}
        </span>
      ))}
    </span>
  );
}

export function FreePick({ pick }: { pick: FreePickData }) {
  const state = stateLine(pick);
  const stamp = money(pick.stakeUnits);
  const reasons = reasonsFor(pick);
  const heading =
    pick.day === "today" ? "Free pick of the day" : "Yesterday’s free pick";
  return (
    <section className="free-pick" aria-labelledby="free-pick-heading">
      <div className="app-section-head">
        <h1 id="free-pick-heading">{heading}</h1>
        <span>{etDateLabel(pick.date)}</span>
      </div>

      <div className="free-pick-body">
        <div className="free-pick-main">
          <article className="lab-ticket">
            <div className="lab-ticket-top">
              <StreakForm recent={pick.recent} pending={pick.pending} />
              <span className="lab-league">{pick.league}</span>
              <span className="lab-matchup">
                {shortMatchup(pick.matchup, pick.league)}
              </span>
            </div>
            <div className="lab-ticket-pick">
              <h2>{pick.title}</h2>
              {stamp && (
                <span
                  className="lab-stamp"
                  style={{ opacity: stampOpacity(pick.stakeUnits) }}
                  aria-label={`Gary's bet: ${stamp}`}
                >
                  {stamp}
                </span>
              )}
            </div>
            <div className="lab-ticket-state">
              <span className={`lab-state ${state.tone}`}>{state.text}</span>
              <span className="lab-stub">
                {pick.direction ? (
                  <span className="lab-direction">
                    <span className={pick.direction} aria-hidden="true">
                      {pick.direction === "over" ? "▲" : "▼"}
                    </span>
                    {pick.direction === "over" ? "OVER" : "UNDER"}
                  </span>
                ) : pick.book ? (
                  <span
                    className="lab-book"
                    style={{
                      color:
                        BOOK_TINT[pick.book.toLowerCase()] ??
                        "rgba(246,241,231,.32)",
                    }}
                  >
                    {pick.book}
                  </span>
                ) : null}
                {(pick.direction || pick.book) && pick.price !== null && (
                  <span className="lab-stub-rule" aria-hidden="true" />
                )}
                {pick.price !== null && (
                  <span className="lab-price">{price(pick.price)}</span>
                )}
              </span>
            </div>
          </article>

          <div className="free-pick-get">
            <AppStoreButton
              surface="free_pick"
              label="Get Gary on the App Store"
              className="app-action-lg"
            />
            <p>
              Game and prop picks for every game, Gary’s best bets in Winners
              and every result. Free to download on iPhone.
            </p>
          </div>
        </div>

        {reasons.length > 0 && (
          <div className="lab-plate lab-reasons">
            <h3>Why it made the board</h3>
            <ol>
              {reasons.map((r, i) => (
                <li key={i}>
                  <span className="lab-reason-n">{i + 1}</span>
                  <div>
                    <p className="lab-reason-claim">{r.claim}</p>
                    {r.why && <p className="lab-reason-why">{r.why}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

export function FreePickPending() {
  return (
    <section className="free-pick" aria-labelledby="free-pick-heading">
      <div className="app-section-head">
        <h1 id="free-pick-heading">Free pick of the day</h1>
      </div>
      <div className="lab-plate free-pick-empty">
        <p>Gary’s free pick of the day appears here as soon as he makes it.</p>
      </div>
      <div className="free-pick-get">
        <AppStoreButton
          surface="free_pick"
          label="Get Gary on the App Store"
          className="app-action-lg"
        />
        <p>
          Game and prop picks for every game, Gary’s best bets in Winners and
          every result. Free to download on iPhone.
        </p>
      </div>
    </section>
  );
}
