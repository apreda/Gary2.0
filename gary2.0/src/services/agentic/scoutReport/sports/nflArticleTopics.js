/** Reporting slots are team-specific where one team's coverage cannot stand in for the other. */
export const NFL_ARTICLE_TOPICS = [
  ...['home', 'away'].flatMap(side => [
    [`${side}_identity`, 'ESTABLISHED TEAM AND CURRENT ROSTER — AS WRITTEN', 'the current roster and named quarterback, retained core, additions/departures, current coaching staff, and relevant prior-season body of work; distinguish attributed assessments of team quality from measured facts and one-game observations; no betting picks or predicted winners', side],
    [`${side}_offense`, 'OFFENSIVE SCHEME AND PERSONNEL — REPORTED OBSERVATIONS', 'current head coach, offensive coordinator and actual play caller (distinguish the roles), documented formations and approach, player roles and usage, and recent coaching/personnel changes; prefer reporting with attributed coach/player explanations', side],
    [`${side}_defense`, 'DEFENSIVE SCHEME AND PERSONNEL — REPORTED OBSERVATIONS', 'current defensive coordinator and actual play caller, documented fronts, pressure and coverage approach, named player roles and recent changes; distinguish reporter observations and coach statements from measured rates', side],
    [`${side}_last_game`, 'LAST COMPLETED GAME — AS WRITTEN', 'the identified last completed game: who played, the opposing players and units, how the game unfolded, execution, turnovers, field position and adjustments beyond the box score', side],
    [`${side}_adjustments`, 'THIS WEEK\'S CHANGES — REPORTED OBSERVATIONS', 'dated reporting about preparation for this specific opponent: available personnel and roles, practice emphasis, coordinator/player explanations and intended adjustments; distinguish a reported intention from a demonstrated improvement', side],
  ]),
  ['recent_run', 'THE RECENT RUN, AS WRITTEN', 'what the recent games reveal about how the team has been playing'],
  ['head_to_head', 'THE LAST MEETING, AS WRITTEN', 'the previous meeting between these exact teams and what has changed since'],
  ['quarterback', 'THE QUARTERBACKS, AS WRITTEN', 'quarterback performance, pressure, decisions and scheme'],
  ['skill_players', 'THE SKILL PLAYERS, AS WRITTEN', 'receiver, tight end or running back usage and performance'],
  ['who_they_are', 'WHO THESE PLAYERS ARE, AS WRITTEN', "the established body of work of this team's key players across their career and last season, not this week's line"],
  ['head_coach', 'THE HEAD COACHES, AS WRITTEN', 'the head coach: who he is, how his teams play, and whether he is new to this job'],
  ['opponent_quality', 'WHO THEY PLAYED, AS WRITTEN', 'who the opponent in the most recent completed game was and how good that opponent is'],
  ['power_ranking', 'THE LEAGUE-WIDE READ, AS WRITTEN', "this week's league-wide power ranking entry for the team and the reasoning given for the placement"],
];

const DAY = 86400_000;
const STANDING_TOPICS = new Set(['head_to_head', 'who_they_are', 'head_coach', 'opponent_quality', 'power_ranking']);
export const topicMaxAgeMs = key => STANDING_TOPICS.has(key) ? 730 * DAY
  : /^(home|away)_(identity|offense|defense)$/.test(key) ? 120 * DAY : 14 * DAY;

export function articleTopics(context) {
  return NFL_ARTICLE_TOPICS.map(([key, label, description, side]) => ({
    key, label: side ? `${context[`${side}Team`]} — ${label}` : label, description,
    team: side ? context[`${side}Team`] : null,
    lastGame: key.endsWith('_last_game') ? context.lastGames?.[side] || null : null,
    maxAgeDays: topicMaxAgeMs(key) / DAY,
  }));
}

export function validateTopicArticle(article, topic) {
  if (topic.team && !article.coveredTeams.includes(topic.team)) throw new Error(`Article does not cover ${topic.team}`);
  if (topic.key === 'head_to_head' && article.coveredTeams.length !== 2) throw new Error('Previous-meeting article does not cover both teams');
  if (topic.lastGame) {
    const { opponent, date } = topic.lastGame;
    const nickname = opponent?.split(' ').at(-1);
    if (nickname && !`${article.title} ${article.body}`.toLowerCase().includes(nickname.toLowerCase()))
      throw new Error(`Last-game article does not identify opponent ${opponent}`);
    if (date && Date.parse(article.publishedAt) < Date.parse(date)) throw new Error('Last-game article predates the completed game');
  }
}
