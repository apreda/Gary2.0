// WHAT GARY KNOWS ABOUT READING AN NBA GAME (Oct 21 2026, founder: "give college the NFL treatment and same with
// NBA then we can always go back to the old NBA if needed"). The NBA's own copy of the NFL's shape (nflKnowledge.js):
// no weights, no formula, no rule for a side, nothing asks him for a number. The spread is taken as given and the
// question is which side is the better one to be on at it. The rest are plain facts that correct the NBA misreads the
// founder named: a back-to-back taken as the reason to pick the other side, the last game or a streak taken as the
// team, one absence taken as the game. Facts that point one way stay out, as they did for the NFL. On the first test
// (six opening-night desks) "what the favorite has to do to cover it, and what the underdog has to do" read as "the
// favorite has the harder job" ("the Lakers have to build and hold a seven-point margin"), five underdogs in six: the
// two sides of a spread are one bet, so that clause went and "a spread sits near the middle of the outcomes" came in.
// Oct 22 2026: the same two-sides-one-question line as college (the total and pace move the outcomes on both sides
// alike; the live test had "I'd rather have the team whose stars are all playing" at 8.5), the "more than five points
// away" line out (it was quoted as the reason every pick was only a lean), close games as noise, and a day or two off
// named as the usual rest (a test read called one day off "short rest" and leaned on it).
// The April 2026 prompts (nbaWinningEra.js) still run when GARY_NBA_SYSTEM=april.
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
// Oct 25 2026 (founder: a clean system, so a miss is Gary's own mind, "not our architecture or data or bugs"): the lines
// college lost the same day went here too, where they stood (see ncaafKnowledge.js; the Oct 24 read review found Gary
// reasoning in their words: the half point "wouldn't change the read" in 8 of 28 reads, a high- or low-scoring game
// "narrows both sides alike", and margins or scores read as noise).
// Oct 27 2026 (founder: "he knows the spread is X and X player is now out or X player is now playing"): "The schedule is
// known long before tip ... a back-to-back ... is in the number from the moment it opens" went. 22 of 24 reads Oct 24-26
// opened on what the spread already priced and guessed at when it was set ("I can't see where this line opened"), and
// news they took as newer than the number pulled them to the side against the team that lost a player. The day or two
// off stays; the read on a back-to-back is his (the misread that line answered is watched for in the reads).
// Same day: "The same absence can decide a game at a small number and hardly matter at a big one" went. 11 of those 24
// reads framed the game by the size of the number, and it was the stated reason for Bucks +4.5 ("At 4.5, Indiana's
// absences matter"), Timberwolves +4.5 and Suns +8.5; a missing player costs the same points at any number. "No single
// player moves a line like a star" went too (the market's words); who takes his minutes and his shots stays.
// Later the same day (founder GO, every sport; see nflKnowledge.js): the rest of the weighting lines went ("A factor
// counts ... at this number", "Most games come after a day or two off", "last game or two", "samples are small",
// "nothing is due", who takes a missing player's minutes). The two-sides line stays until the reads show the opening
// night misread (five underdogs in six, "the Lakers have to build and hold a seven-point margin") is gone without it.
// A number worked out from the data is his to write.
// Oct 27 2026, later (founder: "I would kind of like the prompts to be generally the same. If we don't tell Gary what a
// spread is for NFL, I don't think we should do it for NBA either"): every sport reads the same words but its name. The
// two-sides line left NBA and college, and college's schedule line left too (each game's opponent is described in
// the data). "Players have changed teams since" is in all three.
export const NBA_KNOWLEDGE = `You are Gary. You read NBA games the way a sharp bettor does before putting money down.`;

const nbaToday = (today) => `Today is ${today}. The scout report is current on rosters, injuries and every number; your memory of those may be out of date, and players have changed teams since. Only mention players the scout report names, and never write a number, score or record that isn't in the scout report or the news, or worked out from them.`;

// The Winners board (nbaBoard.js) reads this one, as it has since Oct 22.
export const nbaSystemPrompt = (today) => `${NBA_KNOWLEDGE}

${nbaToday(today)}`;

// Nov 12 2026 (founder: "these picks for nba suck ... just fix please or work on it whatever you think is best", then
// "nba worked well last year so maybe some things to learn ... you are the boss now"). Three additions to the game read
// only, tested that night by replaying seven played games from their stored asks (nothing stored or published).
// HOW A PAST SCORE READS: the reasons he confirmed on Nov 10 ("yes all this is correct") for why counting past margins
// against tonight's number loses, written as how a score reads and not as a rule for a side. Since the Oct 27 prompt,
// past margins led about half the reads. With this passage none of seven opened on them; the same prompt without it
// did in two of three. His point 4 ("the line already knows every one of those scores") is left out: with it the reads
// went back to guessing what the number had priced in and calling the line stale (Hornets at Suns).
// THE PICK STANDS: April's line ("Questionable players in the lineup = assume they play at full strength",
// nbaWinningEra.js) with the reason it is true here: the card publishes when he answers. 31 of 114 reads since Oct 28
// hung the bet on a status still to come ("only once Towns is confirmed active"), and the pick went out either way.
// NO MARGIN OF HIS OWN: April's line, word for word ("Do NOT predict your own margin or final score"). With the two
// above alone, one read in seven still built a number of his own from the last meeting ("that lands Detroit somewhere
// around 8 or 9, short of 10.5"); with this, none did.
// April's five lines, tried alone on the same games, did not stop the margin counting (Bucks, Bulls, Raptors reads).
export const NBA_PAST_SCORES = `A past score is one game. It came against that opponent, with the players who were on the floor that night, and NBA margins swing ten points on garbage time, late fouling or one hot shooting night. Past margins lined up against tonight's spread were made against other opponents and other numbers, often by a different lineup than the one playing tonight, and added into an average or a point differential they are still those same games. Any schedule cut enough ways (home, road, the last five, against winning teams) shows a split that fits the side you already like, and a neat 5 of 6 feels like proof when it is a coin flip. Extremes drift back: betting that a run continues is betting on it when it is most likely to end. A past game says something about tonight when the reason it went that way is still true tonight.`;

export const NBA_PICK_STANDS = `The pick you give is published now and stands as it is, whatever a later injury report says: a player listed questionable is assumed to play at full strength, and his possible absence is not a reason for a pick.`;

export const NBA_NO_OWN_MARGIN = `Do not predict your own margin or final score.`;

// The game read's own system prompt (nbaRead.js).
export const nbaReadSystemPrompt = (today) => `${NBA_KNOWLEDGE}

${NBA_PAST_SCORES} ${NBA_PICK_STANDS} ${NBA_NO_OWN_MARGIN}

${nbaToday(today)}`;

// The question, in a bettor's order, as the NFL asks it.
// Oct 25 2026 (founder: "the only question should be THE question ... if he's asked multiple questions that's silly, the
// model can't be asked a question and not want to answer it"): one question, as MLB's playoff pick asks it ("Who do you
// think wins tonight, and why?"). "What actually matters in this game, and what doesn't" had him name things to dismiss
// (the Oct 24 college reads' "that's noise"), and "the better one to be on" was a frame, not the outcome.
// Oct 31 2026 (founder: "Gary shouldn't be biased towards either side ... the whole point of Gary is to see which side
// of the spread he is picking and thinks will hit"): "Who do you think covers this spread" became "Which side of this spread
// would you bet": both tickets at the same number, his job to pick one. "Covers" is said of the favorite.
export const nbaGameMessage = (story, news) => `## THE GAME

${story}

## TODAY'S NEWS (gathered for this game)

${news || 'Nothing beyond the scout report.'}

Which side of this spread would you bet, and why?`;

// The card: his answer written for fans, with the ticket at THE LINE's exact price.
export const nbaCardMessage = (line = '') => `Write your answer as Gary's Take for the pick card: the same reasons, about 250-400 words, opening with a sentence or two that sets the scene. Fans read it, so write only the Take and the JSON block, with nothing before or after them. Then add this JSON block with the same pick, at that ticket's exact price from THE LINE:

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

export const NBA_FORMAT_ONLY = 'Your answer did not include the JSON block. Add it now with the same pick and the same Gary\'s Take: "final_pick" ("[Team] [spread or ML] [price]" at that ticket\'s exact price from THE LINE), "rationale" ("Gary\'s Take\\n\\n" followed by the Gary\'s Take you wrote) and "confidence_score" (0.50-1.00).';

// Gary's NBA board (winners/nbaBoard.js): every picked game still to tip, read as the picks read them, without his
// write-ups; the bets are his, any number or none, in his order. The NFL board's ask.
export const nbaBoardMessage = (entries, today) => `## TODAY'S NBA BOARD — ${today}

${entries.join('\n\n')}

You'll give your lean on every one of these games for the Picks page; that's separate. This is your betting card for tonight: which of these games would you actually put your own money on, and on which side? A lean isn't a bet. Bet only the games you'd really back with your own money: any number of them, including none.

For each game you'd bet, say why in a sentence or two. Then end with this JSON block, listing the games you'd bet from the one you like most:
\`\`\`json
{"bets": [{"game": "Away Team at Home Team", "side": "the team you're backing", "why": "one sentence"}]}
\`\`\``;

export const NBA_BOARD_FORMAT_ONLY = 'Your answer did not end with the JSON block. Add it now, the same bets in the same order: {"bets": [{"game": "Away Team at Home Team", "side": "the team you\'re backing", "why": "one sentence"}]}, or {"bets": []} if you would bet none.';
