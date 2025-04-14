// ——————————————
// 1. CONFIG: Gary's Core Models
// ——————————————
export const PreferenceModel = {
  teams: {
    CIN_Reds: { bias: 0.9, ride_streaks: true, emotional_connection: "childhood" },
    CIN_Bengals: { bias: 0.9, ride_streaks: true, emotional_connection: "loyalty" },
    IND_Pacers: { bias: 0.8, emotional_connection: "nostalgia" },
    NYY_Yankees: { bias: 0.7, historical_wins: true, trust_in_big_moments: true },
    NYM_Mets: { bias: 0.6, emotional_connection: "underdog love" },
    BigEast_Basketball: { bias: 0.75, gritty_teams: true, tourney_momentum: true },
  },
  players: {
    Dennis_Rodman: { bias: 1.0, override_defense: true, vibe_multiplier: 2.0 },
    Lance_Stephenson: { bias: 0.95, hometown_bonus: true, vibe_multiplier: 1.8 },
    Magic_Johnson: { bias: 0.9, big_moment_boost: true },
    Larry_Bird: { bias: 0.9, cold_weather_bonus: true, clutch_multiplier: 1.5 },
  },
  preferences: {
    east_coast_bias: 0.75,
    gritty_play_multiplier: 1.2,
    entertainer_bonus: 1.5,
    home_underdog_bias: 1.3,
    fade_West_Coast: true,
    superstition_weight: 1.4,
  },
};

export const ProfitModel = {
  monthly_target: 0.30,   // 30% return
  bankroll: 10000,
  bet_types: {
    straight_moneyline: { risk: 1, reward: 1, confidence_boost: 1.1 },
    spread:              { risk: 1.1, reward: 1.3, requires_trust: true },
    parlay:              { risk: 1.9, reward: 3.5, gut_override_required: true },
    same_game_parlay:    { risk: 2.1, reward: 5, only_if_hot: true },
    teaser:              { risk: 1.6, reward: 2.2, low_variance: true },
    mixed_sport_parlay:  { risk: 2.5, reward: 6, only_on_sundays: true },
  },
};

// ——————————————
// 2. CORE SCORING FUNCTIONS
// ——————————————
export function scoreBrain(dataMetrics) {
  // e.g. dataMetrics.ev, lineValue, publicVsSharp
  return dataMetrics.ev; // normalized 0–1
}

export function scoreSoul(narrative) {
  // narrative: { revenge: bool, superstition: bool, momentum: 0–1 }
  let score = narrative.momentum * 0.6;
  if (narrative.revenge) score += 0.2;
  if (narrative.superstition) score += 0.2 * PreferenceModel.preferences.superstition_weight;
  return Math.min(score, 1);
}

export function scorePreference(teamKey, playerKeys=[]) {
  let boost = 0;
  if (PreferenceModel.teams[teamKey]) {
    boost += PreferenceModel.teams[teamKey].bias;
  }
  playerKeys.forEach(p => {
    if (PreferenceModel.players[p]) boost += PreferenceModel.players[p].bias * 0.5;
  });
  // add general East Coast or gritty bias
  boost += PreferenceModel.preferences.east_coast_bias;
  return Math.min(boost / 3, 1);
}

export function scoreMemory(pastPerformance) {
  // pastPerformance: { gutOverrideHits: n, totalGutOverrides: m }
  if (pastPerformance.totalGutOverrides === 0) return 0.5;
  return pastPerformance.gutOverrideHits / pastPerformance.totalGutOverrides;
}

export function scoreProfit(progressToTarget) {
  // progressToTarget: currentROI / monthly_target
  // if behind, returns >1 to push aggression
  return 1 + (1 - progressToTarget);
}

// ——————————————
// 3. TRAP SAFE CHECK
// ——————————————
export function trapSafeCheck(marketData) {
  // marketData: { lineMoved: boolean, publicPct: 0–100 }
  if (!marketData.lineMoved && marketData.publicPct > 70) {
    return { isTrap: true, action: "reduce_stake", reason: "Heavy public money, no line movement" };
  }
  return { isTrap: false };
}

// ——————————————
// 4. GUT OVERRIDE LOGIC
// ——————————————
export function shouldGutOverride(brainScore, soulScore) {
  return soulScore >= brainScore * 2;
}

// ——————————————
// 5. BET TYPE & STAKE DECISION
// ——————————————
export function selectBetType(confidence, behindPace) {
  const types = ProfitModel.bet_types;
  if (confidence > 0.9)      return "straight_moneyline";
  if (confidence > 0.75)     return "spread";
  if (confidence > 0.6)      return behindPace ? "parlay" : "teaser";
  if (behindPace && confidence > 0.5) return "same_game_parlay";
  return "no_bet";
}

export function calculateStake(bankroll, betType, confidence) {
  // no hard cap: Gary goes by feel but temp limit =  max 40%
  const maxPct = confidence > 0.8 ? 0.4 : 0.2;
  return Math.floor(bankroll * maxPct * (ProfitModel.bet_types[betType].risk || 1));
}

// ——————————————
// 6. MAIN PICK FUNCTION
// ——————————————
export function makeGaryPick({
  gameId,
  teamKey,
  playerKeys,
  dataMetrics,
  narrative,
  pastPerformance,
  progressToTarget,
  bankroll
}) {
  const brain = scoreBrain(dataMetrics);
  const soul = scoreSoul(narrative);
  const pref = scorePreference(teamKey, playerKeys);
  const memory = scoreMemory(pastPerformance);
  const profit = scoreProfit(progressToTarget);

  // composite confidence (weights)
  const confidence =
    brain * 0.35 +
    soul * 0.20 +
    pref * 0.10 +
    memory * 0.15 +
    profit * 0.20;

  // trap check
  const trap = trapSafeCheck(dataMetrics.market);

  // gut override?
  const gutOverride = shouldGutOverride(brain, soul);

  // final decision status
  let status = confidence > 0.6 ? "YES" : "NO";
  if (gutOverride && soul > 0.7) status = "YES (GUT)";

  // choose bet type & stake
  const behindPace = progressToTarget < 1;
  const betType = selectBetType(confidence, behindPace);
  const stake = betType === "no_bet"
    ? 0
    : calculateStake(bankroll, betType, confidence);

  return {
    game_id:     gameId,
    team:        teamKey,
    bet_type:    betType,
    line:        dataMetrics.line,
    stake,
    status,
    rationale: {
      brain_score:  brain,
      soul_score:   soul,
      bias_boost:   pref,
      memory_mod:   memory,
      profit_infl:  profit,
    },
    trap_safe:    trap,
    gut_override: gutOverride,
    emotional_tags: [
      pref > 0.8 && "GaryTeam",
      gutOverride && "GutOverride",
      narrative.revenge && "RevengeAngle"
    ].filter(Boolean),
  };
}
