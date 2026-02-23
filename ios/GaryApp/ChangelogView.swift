import SwiftUI

// MARK: - Changelog Entry Model

struct ChangelogEntry: Identifiable {
    let id = UUID()
    let version: String
    let date: String
    let type: ChangeType
    let title: String
    let changes: [String]
    
    enum ChangeType {
        case launch
        case feature
        case improvement
        case fix
        case update
        
        var icon: String {
            switch self {
            case .launch: return "rocket.fill"
            case .feature: return "sparkles"
            case .improvement: return "bolt.fill"
            case .fix: return "ladybug.fill"
            case .update: return "wrench.and.screwdriver.fill"
            }
        }
        
        var label: String {
            switch self {
            case .launch: return "Launch"
            case .feature: return "New Feature"
            case .improvement: return "Improvement"
            case .fix: return "Bug Fix"
            case .update: return "Update"
            }
        }
        
        var color: Color {
            switch self {
            case .launch: return GaryColors.gold
            case .feature: return .purple
            case .improvement: return .blue
            case .fix: return .red
            case .update: return GaryColors.gold
            }
        }
    }
}

// MARK: - Changelog Data

let changelogEntries: [ChangelogEntry] = [
    ChangelogEntry(
        version: "1.9.9",
        date: "February 23, 2026",
        type: .improvement,
        title: "Stability & Polish",
        changes: [
            "Fixed crash that could occur when loading picks under poor network conditions",
            "Added retry button when picks or props fail to load — tap to try again",
            "Improved background performance — timers now pause when the app is in the background",
            "Better text readability across the app with improved contrast",
            "Consistent Gary branding on the Settings page"
        ]
    ),
    ChangelogEntry(
        version: "1.9.8",
        date: "February 11, 2026",
        type: .improvement,
        title: "Refreshed Page Design",
        changes: [
            "Redesigned page headers with Gary logo across all tabs",
            "Compact dropdown filters on Billfold and Fantasy pages",
            "Cleaner sport filter layout with consistent spacing",
            "Visual polish and spacing improvements throughout"
        ]
    ),
    ChangelogEntry(
        version: "1.9.7",
        date: "January 22, 2026",
        type: .feature,
        title: "Sportsbook Odds Comparison",
        changes: [
            "Compare odds across multiple sportsbooks (DraftKings, FanDuel, Caesars, BetMGM, etc.)",
            "Find the best price for Gary's picks with one tap",
            "Best odds highlighted in green for easy identification",
            "Migrated from The Odds API to Ball Don't Lie for faster, more reliable data",
            "Sport-specific sportsbook support for NBA, NFL, NHL, and college sports"
        ]
    ),
    ChangelogEntry(
        version: "1.9.1",
        date: "December 23, 2025",
        type: .improvement,
        title: "College Sports Analytics Upgrade",
        changes: [
            "Enhanced NCAAB analysis with real-time KenPom, NET rankings, and strength of schedule",
            "Improved NCAAF Tale of the Tape with accurate team stats display",
            "Upgraded prop analysis UI - key stats now appear at the top for quick scanning",
            "Picks now reset at 3am EST instead of midnight (late games stay visible longer)",
            "Added 'Coming Soon' placeholder on Home when daily picks are generating",
            "Better college basketball conference filtering for higher quality picks"
        ]
    ),
    ChangelogEntry(
        version: "1.9",
        date: "December 22, 2025",
        type: .improvement,
        title: "App Performance & Data Accuracy",
        changes: [
            "Improved data freshness - picks refresh daily with smart day-boundary handling",
            "Removed all debug print statements for cleaner production logs",
            "Improved data freshness - app shows empty state when no picks exist for current day/week",
            "Code cleanup - removed 100+ lines of unused fallback code"
        ]
    ),
    ChangelogEntry(
        version: "1.0.6",
        date: "December 22, 2025",
        type: .feature,
        title: "Gemini 3 Deep Think + Google Search Grounding",
        changes: [
            "Migrated all sports to Gemini 3 Deep Think (replaced GPT-5.1)",
            "Added Google Search Grounding for live context (injuries, weather, roster verification)",
            "Enhanced NFL injury reporting with duration context (RECENT vs SEASON-LONG)",
            "Improved QB change detection - now flags when historical records don't apply",
            "Optimized stat fetching - deduplicated redundant API calls to save costs",
            "Fixed Perplexity injury parsing bug that assigned players to wrong teams"
        ]
    ),
    ChangelogEntry(
        version: "1.0.5",
        date: "December 18, 2025",
        type: .update,
        title: "Enhanced User Experience",
        changes: [
            "Added in-app Changelog so you can track updates",
            "Improved pick card UI with better rationale display",
            "Enhanced college sports display with school names",
            "Various UI polish and performance improvements"
        ]
    ),
    ChangelogEntry(
        version: "1.0.4",
        date: "December 16, 2025",
        type: .feature,
        title: "Scout Report Builder",
        changes: [
            "Introduced Scout Report Builder with real-time intel",
            "Added injury tracking by player name",
            "Weather conditions integration for outdoor sports",
            "Travel and rest day analysis",
            "Breaking news integration via Perplexity API"
        ]
    ),
    ChangelogEntry(
        version: "1.0.3",
        date: "December 14, 2025",
        type: .improvement,
        title: "3-Stage Agentic Pipeline",
        changes: [
            "Launched 3-stage pipeline: Hypothesis → Investigation → Judge",
            "Sport-specific constitutions for all 7 leagues",
            "Added 'Fan Brain' qualitative analysis",
            "Improved confidence scoring algorithm"
        ]
    ),
    ChangelogEntry(
        version: "1.0.2",
        date: "December 12, 2025",
        type: .feature,
        title: "iOS App Improvements",
        changes: [
            "Liquid glass UI design across all screens",
            "Animated pick cards with flip-to-reveal analysis",
            "Bet/Fade tracking system introduced",
            "Settings view with legal links and app info"
        ]
    ),
    ChangelogEntry(
        version: "1.0.1",
        date: "December 11, 2025",
        type: .fix,
        title: "Launch Day Fixes",
        changes: [
            "Fixed timezone handling for Eastern Time",
            "Resolved pick card rendering issues",
            "Improved Supabase query performance",
            "Fixed confidence score display formatting"
        ]
    ),
    ChangelogEntry(
        version: "1.0.0",
        date: "December 10, 2025",
        type: .launch,
        title: "🚀 Gary A.I. Official Launch",
        changes: [
            "Initial release of Gary A.I.",
            "Support for 7 sports: NFL, NBA, NCAAF, NCAAB, NHL, MLB, EPL",
            "Daily AI-generated picks with detailed analysis",
            "Gemini 3 Deep Think powered reasoning engine",
            "Perplexity integration for real-time data",
            "Odds API integration for live betting lines",
            "Free to use - no paywall, no sign-up required"
        ]
    )
]

// MARK: - Changelog View

struct ChangelogView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var animateIn = false
    
    var body: some View {
        ZStack {
            // Background
            LiquidGlassBackground()
            
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    headerView
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 20)
                    
                    // Changelog entries
                    ForEach(Array(changelogEntries.enumerated()), id: \.element.id) { index, entry in
                        ChangelogEntryCard(entry: entry)
                            .opacity(animateIn ? 1 : 0)
                            .offset(y: animateIn ? 0 : 20)
                            .animation(.easeOut(duration: 0.5).delay(0.1 + Double(index) * 0.05), value: animateIn)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: { dismiss() }) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .semibold))
                        Text("Settings")
                            .font(.system(size: 16))
                    }
                    .foregroundStyle(GaryColors.gold)
                }
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.6)) {
                animateIn = true
            }
        }
    }
    
    private var headerView: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Image("GaryCoin")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 50, height: 50)
                    .shadow(color: GaryColors.gold.opacity(0.3), radius: 8, y: 2)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text("What's New")
                        .font(.system(size: 28, weight: .heavy))
                        .tracking(-0.5)
                        .foregroundStyle(GaryColors.gold)
                    
                    Text("Latest updates and improvements")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.top, 8)
        }
    }
}

// MARK: - Changelog Entry Card

struct ChangelogEntryCard: View {
    let entry: ChangelogEntry
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Version and type badges
            HStack(spacing: 8) {
                // Version badge
                Text("v\(entry.version)")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.8))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.1))
                    .clipShape(Capsule())
                
                // Type badge
                HStack(spacing: 4) {
                    Image(systemName: entry.type.icon)
                        .font(.system(size: 10, weight: .semibold))
                    Text(entry.type.label)
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(entry.type == .launch ? .black : entry.type.color)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(
                    Group {
                        if entry.type == .launch {
                            LinearGradient(
                                colors: [GaryColors.gold, GaryColors.gold.opacity(0.8)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        } else {
                            entry.type.color.opacity(0.2)
                        }
                    }
                )
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .stroke(entry.type.color.opacity(entry.type == .launch ? 0 : 0.3), lineWidth: 1)
                )
                
                Spacer()
                
                // Date
                Text(entry.date)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            
            // Title
            Text(entry.title)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.white)
            
            // Changes list
            VStack(alignment: .leading, spacing: 6) {
                ForEach(entry.changes, id: \.self) { change in
                    HStack(alignment: .top, spacing: 8) {
                        Text("•")
                            .foregroundStyle(GaryColors.gold)
                            .font(.system(size: 14, weight: .bold))
                        Text(change)
                            .font(.system(size: 14))
                            .foregroundStyle(.white.opacity(0.7))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(hex: "#0D0D0F"))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [Color.white.opacity(0.1), Color.white.opacity(0.05)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.5
                        )
                )
        )
    }
}

#Preview {
    NavigationStack {
        ChangelogView()
    }
    .preferredColorScheme(.dark)
}
