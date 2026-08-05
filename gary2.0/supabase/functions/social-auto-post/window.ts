// gary2.0/supabase/functions/social-auto-post/window.ts
// Pure pick-selection for the auto-poster's picks drip. Extracted Aug 5 2026 so the timing rules are
// unit-testable without a database or an LLM (same pattern as pl.ts / verdicts.ts).
//
// RULE 1 — THE DEADLINE (founder, Aug 5 2026): a pick may NEVER be tweeted after its game has started.
//   "Those cannot go out after the game starts. That's like making a pick after the game starts.
//    It looks like we're retroactively making a pick and posting about it."
// So selection is GAME-PACED: postable only while first pitch is leadMinMin..leadMaxMin away. No grace
// period, no live/just-started path — both existed before this rewrite and put 19 of 39 threads on the
// timeline after first pitch.
//
// RULE 2 — SPREAD THE DAY (founder, Aug 5 2026): the daily cap must not be eaten first-come-first-served.
//   "There are still people up on the West Coast, and we still want to get to them."
// Before this, five clustered afternoon games consumed the whole daily cap by 1pm and the night games never
// posted. Now each later day-part RESERVES slots against the cap, so afternoon can only spend what is left
// after evening and late are covered. When the later day-parts have no games, nothing is reserved and the
// early games get the full cap — a getaway day with only afternoon baseball still posts a full slate.
//
// RULE 3 — BOTH AUDIENCES (founder, Aug 5 2026): time-based AND marquee-based, never one or the other.
//   "Those gamblers that just want to start gambling" AND "the marquee games have more eyeballs".
// Coverage across day-parts serves the first. marqueeScore breaks the tie inside an oversubscribed day-part
// for the second. If a window only has two games, BOTH post and marquee never enters into it.

export type PickLike = {
  pick: string;
  commence_time?: string | null;
  confidence?: number | string | null;
  awayTeam?: string | null;
  homeTeam?: string | null;
  league?: string | null;
};

export const SLOT_ORDER = ["morning", "afternoon", "evening", "late"] as const;
export type Slot = (typeof SLOT_ORDER)[number];

// Same boundaries the social_post_log.slot column has always used, so the log stays self-consistent.
export function slotOf(commenceTime: string): Slot {
  const raw = new Date(commenceTime).toLocaleString("en-US", {
    timeZone: "America/New_York", hour: "2-digit", hour12: false,
  });
  const h = parseInt(raw, 10) % 24; // "24" is midnight in some ICU builds
  return h < 14 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "late";
}

export type SelectOpts = {
  nowMs: number;
  leadMinMin: number;    // hard deadline: must be at least this many minutes BEFORE first pitch
  leadMaxMin: number;    // don't post earlier than this many minutes before first pitch
  maxPerRun: number;     // burst guard for a clustered slate
  dailyCap: number;      // total pick threads per day
  postedToday: number;   // pick threads already on the timeline today
  reserve: Record<Slot, number>; // slots held back for each day-part so late games always get airtime
  marqueeScore: (p: PickLike) => number;
  allUnposted?: PickLike[]; // full remaining board (defaults to the list passed in) for reservation math
};

export type Selection<T> = {
  queue: T[];            // post these now, soonest first pitch first
  missed: string[];      // first pitch already passed (or no commence_time) -> can never post, surface it
  eligibleCount: number; // inside the window before caps
  budget: number;        // how many the caps allowed this run
  reserved: number;      // slots held for later day-parts
};

export function selectPicks<T extends PickLike>(unposted: T[], o: SelectOpts): Selection<T> {
  const MIN = 60_000;
  const scored = unposted.map((p) => ({
    p,
    leadMin: p.commence_time ? (new Date(p.commence_time).getTime() - o.nowMs) / MIN : null,
  }));

  const eligible = scored
    .filter((s) => s.leadMin !== null && s.leadMin >= o.leadMinMin && s.leadMin <= o.leadMaxMin)
    .map((s) => s.p);

  // Past the deadline, or missing a commence_time to check against. Either way it can never post.
  // A pick still FURTHER out than leadMaxMin is not missed — it becomes eligible on a later run.
  const missed = scored
    .filter((s) => s.leadMin === null || s.leadMin < o.leadMinMin)
    .map((s) => s.p.pick);

  if (!eligible.length) {
    return { queue: [], missed, eligibleCount: 0, budget: 0, reserved: 0 };
  }

  // Reserve cap space for day-parts LATER than the one we are posting into, but only as much as there are
  // actually games left to fill them. No night games on the board -> nothing reserved -> afternoon gets it all.
  const board = o.allUnposted ?? unposted;
  const earliestSlot = eligible
    .map((p) => SLOT_ORDER.indexOf(slotOf(p.commence_time as string)))
    .reduce((a, b) => Math.min(a, b));
  let reserved = 0;
  for (let i = earliestSlot + 1; i < SLOT_ORDER.length; i++) {
    const slot = SLOT_ORDER[i];
    const availableLater = board.filter((p) => p.commence_time && slotOf(p.commence_time) === slot).length;
    reserved += Math.min(o.reserve[slot] ?? 0, availableLater);
  }

  const budget = Math.max(0, Math.min(o.maxPerRun, o.dailyCap - o.postedToday - reserved));

  // Oversubscribed -> the games with the most eyeballs win. Ties break toward the sooner first pitch, since
  // that one is closest to being lost forever. Then POST in first-pitch order so nothing expires while we
  // are still composing the pick in front of it.
  const queue = [...eligible]
    .sort((a, b) => {
      const m = o.marqueeScore(b) - o.marqueeScore(a);
      if (m !== 0) return m;
      return new Date(a.commence_time as string).getTime() - new Date(b.commence_time as string).getTime();
    })
    .slice(0, budget)
    .sort((a, b) => new Date(a.commence_time as string).getTime() - new Date(b.commence_time as string).getTime());

  return { queue, missed, eligibleCount: eligible.length, budget, reserved };
}
