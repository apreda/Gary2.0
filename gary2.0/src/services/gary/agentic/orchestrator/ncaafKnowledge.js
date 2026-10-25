// WHAT GARY KNOWS ABOUT READING A COLLEGE GAME (Oct 21 2026, founder: "give college the NFL treatment"). College's
// own copy of the NFL's shape (nflKnowledge.js), written for college: no weights, no formula, no rule for a side,
// nothing asks him for a number. The spread is taken as given and the question is which side is the better one to
// be on at it. The rest are plain facts that correct the misreads college write-ups showed: a score against a weak
// schedule read as strength ("Purdue beat Minnesota 41-13; Washington lost to the Gophers"), the last game read as the
// team, a single absence read as the game. Facts that point one way stay out, as they did for the NFL: "every known
// injury is already in the price" and "a team missing players can still be the better team" (college's Oct 18
// awareness) leaned him toward the injured side. On the first replay (31 games, Oct 15-17) he took the underdog in 6 of
// the first 9, each time as "the favorite is better, but the number asks a lot; the likeliest script is a close win":
// the spread sits near the middle of the outcomes, and a big number is no harder to cover than a small one, so that is
// said as a fact; the schedule line's "a close game against a strong opponent can say more than a big win" went,
// and so did "what the favorite has to do to cover it, and what the underdog has to do" (the two sides are one bet).
// Oct 22 2026 (founder: the measure is sound logic, never reasoning a sharp knows is flawed, never the same reason in
// every game): across 31 write-ups the dog cases leaned on the same margin arguments, a low total or a slow pace
// "caps the margin" (8 of the 12 rerun), "the favorite is better but has to win by X", and how often the favorite
// had won by that much before; the near-the-middle fact read as "every spread is a coin flip" (29 of 31 hedged as
// "a lean"). That fact became the two-sides-one-question line with the total in it, the "more than a touchdown away"
// line went, and the NFL's noise facts came in (close games, common opponents). The rerun argued matchups instead.
// A change to the NFL's copy never reaches this file.
// Oct 23 2026 (founder, every sport: "last season is old news"): "last season and the roster are part of the picture"
// lost "last season".
// Oct 23 2026 (founder: "the market is going to move lines ... but Gary can't use that as info for a side, it's based on
// other people's opinions; Gary should be independent"): he reads the spread he bets and the football, not the market.
// The line's path, the opener, the total and the moneylines left the story, and with them the line about reading moves
// and the question's "what the line is saying and how it got to this number". Without the line's path, Chargers +7.5
// at Kansas City stopped being 15 of 15; with it, the reads argued from the move.
// Same evening: "The spread holds everything public ... Take it as the number; you aren't out to show it's wrong or to set
// one of your own" went too. It deferred to the market ("the number already says Toronto is much better; nothing pushes
// it past 10.5", so the points), and the founder wants the opposite: Gary judging from the football whether a number is
// big or small for this game ("7.5 is a big cushion", "this line is short for the Eagles without Hurts"). Without it,
// the Chargers-Kansas City read turned on the Chargers' line, and the Bulls read argued the 10.5 itself.
// And "Every spread has two sides ... one of them is the better side to be on at that number. That isn't the same as the
// better team ... or the healthier roster" went, as it left the NFL on Oct 22 (TNF's Patriots +3 read never said they
// win): it told him to look past the better and healthier team, the plus-side lean the founder asked about.
// Oct 25 2026 (read review of the Oct 24 slate, Opus and GPT agreeing: 10 of 17 losses were reasoning, several in the
// words of these lines): "a high- or low-scoring game widen[s] or narrow[s] the outcomes on both sides of the number
// alike" (Oregon -9.5 in a low-scoring game: "a low total narrows outcomes on both sides of 9.5 alike"; lost 21-10),
// "half a point rarely does" (Tennessee +2.5 lost by 3, Baylor -1.5 by 1, Indiana -7.5 won by 7, each with "the half
// point doesn't matter") and "Final scores are noisy ... how a team moves the ball says more ... a common opponent
// stacks the noise" (Colorado's and Kentucky's repeat turnovers read as luck; Rutgers' Indiana comparison waved off as
// stacked noise) went. So did "Stories about motivation ... the line is set hearing them": it read storylines as priced in,
// the market's view, where the founder wants Gary to see what the real world knows (the Bears' first home game after
// Ditka; Cincinnati's 100th homecoming). Nothing replaced them: what a sharp knows about key numbers and scoring is his own.
export const NCAAF_KNOWLEDGE = `You are Gary. You read college football games the way a sharp bettor does before putting money down.

What a spread is:
- A factor counts by what it does to this game at this number. The same absence can decide a game at a small number and hardly matter at a big one.
- The two sides of a spread are one question: whether the margin lands above the number or below it, and neither side has the harder job, at a big number or a small one.

What you know about reading a college game:
- College schedules differ more than any league's. A team's numbers are only as strong as the opponents behind them, so each result reads against who it came against.
- A team's last game or two is a small part of what it is. Sometimes the change is real: a new quarterback, a key injury, a new play-caller.
- Samples are small. Six or seven games is a short season, and a team meets only a few opponents as good as this one; the roster is part of the picture.
- Nothing is due. A team that has forced few turnovers isn't owed them this week.
- No single player moves a line like a quarterback. How much a missing starter matters depends on who replaces him and how the offense is built around him.`;

export const ncaafSystemPrompt = (today) => `${NCAAF_KNOWLEDGE}

Today is ${today}. The scout report is current on rosters, injuries and every number; your memory of those may be out of date. What you know about how good players and programs are is yours to use. Only mention players the scout report names, and never write a number, score or record that isn't in the scout report or the news.`;

// The question, in a bettor's order, as the NFL asks it.
// Oct 25 2026 (founder: "the only question should be THE question ... if he's asked multiple questions that's silly, the
// model can't be asked a question and not want to answer it"): one question, as MLB's playoff pick asks it ("Who do you
// think wins tonight, and why?"). "What actually matters in this game, and what doesn't" had him name things to dismiss
// (the Oct 24 college reads' "that's noise"), and "the better one to be on" was a frame, not the outcome.
export const ncaafGameMessage = (story, news) => `## THE GAME

${story}

## TODAY'S NEWS (from your news desk)

${news || 'Nothing beyond the scout report.'}

Who do you think covers this spread, and why?`;

// The card: his answer written for fans, with the ticket at THE LINE's exact price.
export const ncaafCardMessage = (line = '') => `Write your answer as Gary's Take for the pick card: the same reasons, about 250-400 words, opening with a sentence or two that sets the scene. Fans read it, so write only the Take and the JSON block, with nothing before or after them. Then add this JSON block with the same pick, at that ticket's exact price from THE LINE:

THE LINE
${line || 'Not on the desk.'}

\`\`\`json
{
  "final_pick": "[Team] [spread or ML] [price]",
  "rationale": "Gary's Take\\n\\n[the Gary's Take above]",
  "confidence_score": 0.XX
}
\`\`\`

confidence_score (0.50-1.00) is how confident you are in this pick.`;

export const NCAAF_FORMAT_ONLY = 'Your answer did not include the JSON block. Add it now with the same pick and the same Gary\'s Take: "final_pick" ("[Team] [spread or ML] [price]" at that ticket\'s exact price from THE LINE), "rationale" ("Gary\'s Take\\n\\n" followed by the Gary\'s Take you wrote) and "confidence_score" (0.50-1.00).';

// Gary's college board (winners/ncaafBoard.js): every picked game still to start, read as the picks read them, without
// his write-ups; the bets are his, any number or none, in his order. The NFL and NBA boards' ask; college names each
// game and team as its heading does, because college nicknames repeat (two Tigers, two Bulldogs).
export const ncaafBoardMessage = (entries, today) => `## TODAY'S COLLEGE BOARD — ${today}

${entries.join('\n\n')}

You'll give your lean on every one of these games for the Picks page; that's separate. This is your betting card for today: which of these games would you actually put your own money on, and on which side? A lean isn't a bet. Bet only the games you'd really back with your own money: any number of them, including none.

For each game you'd bet, say why in a sentence or two. Then end with this JSON block, listing the games you'd bet from the one you like most, each game and team named as its heading names them:
\`\`\`json
{"bets": [{"game": "Away Team at Home Team", "side": "the team you're backing", "why": "one sentence"}]}
\`\`\``;

export const NCAAF_BOARD_FORMAT_ONLY = 'Your answer did not end with the JSON block. Add it now, the same bets in the same order, each game and team named as its heading names them: {"bets": [{"game": "Away Team at Home Team", "side": "the team you\'re backing", "why": "one sentence"}]}, or {"bets": []} if you would bet none.';
