import { readFileSync } from 'node:fs';

// Transitional source reader for existing Swift fixture harnesses. Production
// compiles these domain files directly through XcodeGen. New model tests should
// compile their actual dependency files instead of slicing a combined source.
const modelFiles = ["Models/ProviderIdentity.swift", "Models/PickDecoding.swift", "Models/InsightModels.swift", "Models/LiveScoreModels.swift", "Models/LeaguePulseModels.swift", "Models/PlayerInsightModels.swift", "Models/DailySlateModels.swift", "Models/RecapModels.swift", "Models/ObservationModels.swift", "Models/SportsbookOdds.swift", "Models/GamePickModels.swift", "Models/StatModels.swift", "Models.swift", "Models/PropPickModels.swift", "Models/ResultModels.swift", "Models/TomorrowModels.swift"];

export function readNativeModels() {
  return modelFiles.map(file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8')
    .replace(/^import (Foundation|CoreFoundation)\n/gm, '')).join('\n');
}

const bookFiles = ["Book/BookModels.swift", "Book/BookUnitSizeSheet.swift", "Book/UserBookAPI.swift", "Book/BookSlipScanner.swift", "Book/BookDirectoryPolicy.swift", "Book/BookGameTailFadeRow.swift", "UserBookView.swift", "Book/BookShareSheet.swift", "Book/BookPropTailFadeRow.swift", "Book/BookSlipRow.swift", "Book/BookQuickLogSheet.swift", "Book/BookShareCard.swift", "Book/UserProfileView.swift", "Book/CommunityLeaderboardView.swift"];
export function readNativeBook() {
  return bookFiles.map(file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8')
    .replace(/^import (SwiftUI|Charts|PhotosUI)\n/gm, '')).join('\n');
}

const hubFiles = ["Hub/HubPresentation.swift", "HubView.swift", "Hub/HubHeader.swift", "Hub/HubSlateStrip.swift", "Hub/HubRegressionBoard.swift", "Hub/HubLeaguePulse.swift", "Hub/HubStreakWatch.swift", "Hub/HubStories.swift", "Hub/HubNrfiSection.swift", "Hub/HubMatchupsSection.swift", "Hub/HubTeamCardSheet.swift", "Hub/HubNightBoard.swift", "Hub/HubReceipts.swift", "Hub/HubGameSheet.swift", "Hub/HubEdgeOverlay.swift", "Hub/HubSearchResults.swift"];
export function readNativeHub() {
  return hubFiles.map(file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8')
    .replace(/^import SwiftUI\n/gm, '')).join('\n');
}

export function readNativePicks() {
  return ["Picks/EdgesSection.swift", "Picks/TeamMatching.swift", "Picks/GameScorePresentation.swift", "Picks/PickPresentation.swift", "Picks/LeaguePriority.swift", "Picks/GamePickGrading.swift", "Picks/PicksShowcaseLock.swift", "PicksTab.swift", "Picks/PicksTodayPage.swift", "Picks/TeasedPickCard.swift", "Picks/TodayBoardCache.swift", "Picks/ScoutWireCache.swift", "Picks/GameScoutSection.swift"].map(file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8'))
    .join('\n');
}

export function readNativeHome() {
  return ["Home/PickInfoSheet.swift", "Home/DailyRecapOverlay.swift", "Home/GamePickSources.swift", "HomeView.swift", "Home/HomePresentation.swift", "Home/HomeScrollBehavior.swift", "Home/HomeSheetRow.swift", "Home/HomeBoardLeague.swift", "Home/HomeReceiptMath.swift", "Home/HomeBoardRecord.swift", "Home/HomeScoreCell.swift", "Home/HomeScorecard.swift", "Home/HomeSheetPanel.swift", "Home/HomePersonalScorecard.swift"].map(file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8'))
    .join('\n');
}

export function readNativeFrontPage() {
  return ["Home/HomeAllStarTakeover.swift", "Home/HomeContestOverlays.swift", "Home/HomeSectionRule.swift", "Home/HomeMarqueeTracker.swift", "Home/HomeHeadlineCards.swift", "Home/HomeSheetRowView.swift", "Home/HomeWinnersStub.swift", "Home/StatusBarScrim.swift", "Home/LeagueWordsOverlay.swift", "Home/HomeDecorations.swift", "Home/HomeCountdownText.swift", "Home/HomeMarqueeHero.swift", "Home/HomeCashesSection.swift", "Home/HomeLiveVerdict.swift", "Home/HomeContentPlaceholder.swift"].map(file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8')).join('\n');
}
