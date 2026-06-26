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
        version: "2.17",
        date: "June 2026",
        type: .update,
        title: "Gary 2.17 — A sharper player card",
        changes: [
            "Redesigned player breakdown cards — matte black with a gold edge and Gary's mark — that expand to advanced stats, park splits, and the matchup; far more players now have a full card",
            "The Home screen's headlines now load instantly",
            "Settled cards show the team beside each score, and doubleheaders show the right result",
        ]
    ),
    ChangelogEntry(
        version: "2.16",
        date: "June 2026",
        type: .update,
        title: "Gary 2.16 — Live scores that keep up, a steadier Hub",
        changes: [
            "Live scores update on their own while you watch — no need to close and reopen the app",
            "The Hub holds one set of reads for the whole day — picks don't change on you between visits",
            "Prop box on Home: pick any game, or see Gary's two best winners and two best losers from last night",
            "Headline cards: tap to open the full recap, with bigger, easier-to-read bullets",
            "Games with two picks (a side and a total) now show the right result on each",
            "Home Run picks live in the Hub now, not a separate Picks tab"
        ]
    ),
    ChangelogEntry(
        version: "2.15",
        date: "June 2026",
        type: .update,
        title: "Gary 2.15 — Cleaner cards and picks you can trust",
        changes: [
            "Pick cards are cleaner everywhere: odds in the sport's color, handicaps and totals formatted right, and the same card size on every page",
            "Pick cards show the live score while the game is in play",
            "The Hub reads like a digest now: tap a section to open it, tap a player for the full breakdown",
            "Regression Board adds tomorrow's projected starters, plus deeper reads on tonight's arms — ERA vs xERA, hard-hit and barrel rates, and the verdict",
            "Your daily recap now reflects how the night actually went",
            "Gary won't post a pick on a game he can't truly read. No real data, no pick.",
            "Cleaner Tonight page with your free pick leading, plus refreshed Gary branding"
        ]
    ),
    ChangelogEntry(
        version: "2.14",
        date: "June 2026",
        type: .update,
        title: "Gary 2.14 — Sharper, faster, more accurate",
        changes: [
            "The Wire only reports real games now — no more stale or off-day news",
            "Every pick card is the same clean size, whatever the headline length",
            "Last night's late games keep their full recap and bullets on Home",
            "Picks page: sport filter moved above the matchups; combo props read as H+R+RBI",
            "Fixed a Hub header glitch and tightened up scrolling and load times"
        ]
    ),
    ChangelogEntry(
        version: "2.13",
        date: "June 2026",
        type: .feature,
        title: "Gary 2.13 — Free for everyone",
        changes: [
            "Everything is free this version — every board, every sport, no paywall. Accounts optional.",
            "New Home: morning recaps with stat bullets, the Wire with tap-to-expand stories, the full slate with real lines",
            "Streaks board in the Hub: team runs, hot and cold bats, who has one on the line tonight",
            "The Night Board: every homer, gem, multi-hit and steal from last night — searchable"
        ]
    ),
    ChangelogEntry(
        version: "2.12",
        date: "April 19, 2026",
        type: .update,
        title: "Gary 2.12 — Reliability & Stats Overhaul",
        changes: [
            "Fixed MLB results grading — games now matched by game ID (prevents UTC bleed and doubleheader mismatches)",
            "MLB_STATCAST tool added: exit velocity, hard hit rate, barrel rate from last 3 games",
            "Fixed 7 broken MLB stat tools (pitcher recent form, splits, RISP, bullpen workload, BvP)",
            "NHL stat wiring: INJURIES, H2H, HOME_AWAY_SPLITS all now return real BDL data",
            "Smart sport filter tabs — sports with today's picks sort left, others follow",
            "Team name display: 'Red Sox' / 'Blue Jays' / 'Trail Blazers' no longer truncate to last word",
            "Performance-based Gary hero images restored on home page",
            "Tighter grounding freshness rules (past 48 hours only, no stale stats from articles)",
            "Daily scheduler auto-restart at 9 AM ET (via cron) — prevents Mac sleep issues"
        ]
    ),
    ChangelogEntry(
        version: "2.11",
        date: "March 25, 2026",
        type: .feature,
        title: "Gary 2.11 — MLB Opening Day",
        changes: [
            "MLB Regular Season game picks, props, and DFS lineups now live",
            "Full BDL GOAT-tier integration: player stats, splits, batter vs pitcher, standings, injuries, odds from 6 sportsbooks",
            "Baseball Savant xStats: expected vs actual performance (xERA, xBA, xSLG, xwOBA)",
            "L1-L4 game recaps with full box scores, L5/L10 trend aggregates",
            "30 hardcoded park factors, confirmed lineups from MLB Stats API",
            "Support for 8 sports: NFL, NBA, NCAAF, NCAAB, NHL, MLB, EPL, WNBA"
        ]
    ),
    ChangelogEntry(
        version: "2.1",
        date: "March 17, 2026",
        type: .update,
        title: "Gary 2.1",
        changes: [
            "March Madness bracket improvements and stability fixes",
            "Version bump for App Store submission"
        ]
    ),
    ChangelogEntry(
        version: "2.0",
        date: "March 15, 2026",
        type: .feature,
        title: "Gary 2.0",
        changes: [
            "Completely redesigned home page with new performance dashboard",
            "March Madness bracket with full region navigation and Gary's picks",
            "New interactive How Gary Works section",
            "Redesigned Fantasy DFS page with compact toolbar",
            "Props now run on Gemini Flash — faster analysis, lower cost",
            "Guard play theory and tournament awareness added to NCAAB analysis",
            "Improved injury handling — only fresh injuries reported",
            "Fixed 15+ technical bugs across game picks, props, and DFS pipelines",
            "Highlightly API integration for NCAAB head-to-head data",
            "New billfold candlestick chart with pinch-to-zoom",
            "Lighter, warmer UI throughout the app"
        ]
    ),
    ChangelogEntry(
        version: "1.9.92",
        date: "March 5, 2026",
        type: .feature,
        title: "MLB Regular Season",
        changes: [
            "MLB Regular Season game picks, props, and DFS lineups now live",
            "Improved Tale of the Tape for MLB matchups",
            "Better odds parsing for MLB games",
            "Moneyline picks now capped on heavy favorites — Gary picks the spread instead"
        ]
    ),
    ChangelogEntry(
        version: "1.9.91",
        date: "February 28, 2026",
        type: .improvement,
        title: "Performance & Reliability",
        changes: [
            "Improved scrolling performance across all pick lists",
            "Fixed tab navigation when entering from onboarding screen",
            "Faster date and currency formatting throughout the app",
            "Settings page now shows version dynamically",
            "Under-the-hood stability improvements"
        ]
    ),
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
                Image(GaryBrand.mark)
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
            badgeRow
            titleView
            changesList
        }
        .padding(16)
        .background(cardBackground)
    }

    private var badgeRow: some View {
        HStack(spacing: 8) {
            versionBadge
            typeBadge
            Spacer()
            Text(entry.date)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
    }

    private var versionBadge: some View {
        Text("v\(entry.version)")
            .font(GaryFonts.mono(12, bold: true))
            .foregroundStyle(.white.opacity(0.8))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Color.white.opacity(0.1))
            .clipShape(Capsule())
    }

    @ViewBuilder
    private var typeBadge: some View {
        let isLaunch = entry.type == .launch
        HStack(spacing: 4) {
            Image(systemName: entry.type.icon)
                .font(.system(size: 10, weight: .semibold))
            Text(entry.type.label)
                .font(.system(size: 11, weight: .semibold))
        }
        .foregroundStyle(isLaunch ? .black : entry.type.color)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(typeBadgeBackground)
        .clipShape(Capsule())
        .overlay(
            Capsule()
                .stroke(entry.type.color.opacity(isLaunch ? 0 : 0.3), lineWidth: 1)
        )
    }

    @ViewBuilder
    private var typeBadgeBackground: some View {
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

    private var titleView: some View {
        Text(entry.title)
            .font(.system(size: 18, weight: .bold))
            .foregroundStyle(.white)
    }

    private var changesList: some View {
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

    private var cardBackground: some View {
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
    }
}

#Preview {
    NavigationStack {
        ChangelogView()
    }
    .preferredColorScheme(.dark)
}
