# Gary A.I. — Designer Briefing

## What is Gary?

Gary is an AI-powered sports betting assistant app for iOS. Gary analyzes every game across NBA, NFL, NHL, NCAAB, NCAAF, and MLB using a two-model AI architecture — a research assistant investigates every factor of a game, then "Gary" (the main AI) evaluates the matchup and makes a pick against the spread, prop bets, and DFS (Daily Fantasy Sports) lineups.

Gary is a character — a 30-year veteran sports bettor who's seen it all. He's confident, knowledgeable, and speaks directly to the user like a sharp friend giving you his honest take. He's not a robot or a prediction machine. He's Gary.

## The Brand

**Name:** Gary A.I.
**Tagline:** "Every Game. Everyday. Always Free."
**Handle:** @BetwithGary (X, verified)
**Website:** betwithgary.ai
**App Store:** https://apps.apple.com/us/app/gary-ai/id6751238914

**Voice:** Confident, conversational, data-backed. Gary talks like a sharp sports bettor, not a corporate AI. He uses real stats, real reasoning, and isn't afraid to be wrong — he owns his losses with transparency.

## The Character — Gary the Bear

Gary's mascot is a cartoon bear in various moods based on performance:

| Image Asset | When It Shows | Description |
|------------|---------------|-------------|
| **GaryIconBG** | Default / app icon | Standard bear logo (OFFICIAL LOGO — transparent background, 1024x1024) |
| **GaryFire** | 80%+ win rate yesterday | Bear on fire — crushing it |
| **GaryCooking** | 70-79% win rate | Bear cooking — heating up |
| **GaryBeer** | 60-69% win rate | Bear with a beer — solid day |
| **GaryWorried** | 50-59% win rate | Bear looking worried — average day |
| **GaryIceCold** | 40-49% win rate | Bear frozen — cold streak |
| **GaryDoomsday** | Below 40% win rate | Bear in crisis mode |
| **GaryCigar** | Special occasions | Full body bear with cigar |
| **GaryMadness** | March Madness | Tournament-themed bear |
| **GaryCoin** | Coin/premium features | Bear with coin |

**CRITICAL: Always use the actual Gary logo files for any marketing materials. NEVER let AI generate its own version of the bear. The official assets are in `ios/GaryApp/Assets.xcassets/`.**

## Color Palette

### Primary Colors

| Color | Hex | Usage |
|-------|-----|-------|
| **Gold** | `#C9A227` | Primary brand color — buttons, accents, highlights, Gary's signature color |
| **Light Gold** | `#E8D48B` | Gradients, lighter accents |
| **Warm Gold** | `#F4E4BA` | Subtle highlights |
| **Dark Gold** | `#8B6914` | Gradient endpoints, shadows |

### Background Colors

| Color | Hex | Usage |
|-------|-----|-------|
| **Dark Background** | `#08080A` | Main app background — near-black |
| **Card Background** | `#121214` | Pick cards, content cards |
| **Elevated Background** | `#1A1A1E` | Modals, sheets, elevated surfaces |
| **Card Fill (Compact)** | `#141210` | Compact row cards (warm black) |

### Glass Effects

The app uses a "liquid glass" design language — cards have subtle transparency, glowing borders, and depth shadows.

| Effect | Values |
|--------|--------|
| Glass Tint | `white @ 8% opacity` |
| Glass Highlight | `white @ 15% opacity` |
| Glass Border | `white @ 12% opacity` |
| Card Border (standard) | `white @ 18% opacity, 0.65px` |

### Sport Accent Colors

Each sport has its own accent color used for card borders, badges, and highlights:

| Sport | Hex | Color |
|-------|-----|-------|
| **NBA** | `#3B82F6` | Blue |
| **NFL** | `#22C55E` | Green |
| **NHL** | `#00A3E0` | Ice Blue |
| **NCAAB** | `#F97316` | Orange |
| **MLB** | `#16A34A` | Baseball Green |

### Text Colors

| Usage | Color |
|-------|-------|
| Primary text | White |
| Secondary text | `white @ 50-60% opacity` |
| Tertiary / timestamps | `white @ 42% opacity` |
| Gold text (picks, highlights) | `#C9A227` (GaryColors.gold) |

### Result Colors

| Result | Color |
|--------|-------|
| Win | Gold (`#C9A227`) |
| Loss | Gray (`#6A6A70`) |
| Push | Yellow |

## Typography

The app uses the system font (SF Pro) across the board:

- **Headlines / Team names:** Bold, 17-19pt
- **Pick text (the actual pick):** Bold, gold colored
- **Stats / secondary info:** Medium, 11-13pt
- **Badges / tags:** Bold, 9-10pt, uppercase tracking
- **Gary's Take (rationale):** Regular, readable paragraph text

## Design Language

### Cards
- Corner radius: 20px (full cards), 12px (compact rows)
- Border: Sport-specific accent gradient, 2-2.5px for full cards, 0.65px for compact
- Shadow: Dual shadow system — accent color glow (subtle) + black depth shadow
- Background: `#121214` card fill

### Pick Cards Show:
- Sport badge (icon + color)
- Team names (away @ home)
- The pick (team + spread/ML + odds) in gold
- Confidence bar (accent color)
- Gary's Take (expandable rationale)
- Tale of Tape (stat comparison table)
- Sportsbook odds comparison
- Result stamp (W/L/P overlay on yesterday's picks)

### Prop Cards Show:
- Player name
- Prop line (e.g., "Assists 7.5")
- Direction (OVER/UNDER) with color coding
- Odds
- Sport badge

### DFS Cards Show:
- Lineup table (position, player, team, salary)
- Total salary
- Ceiling projection
- Gary's Notes (thesis)
- Pivot alternatives per player

## Key Screens

1. **Home** — Hero image (dynamic Gary bear), today's top pick, top prop, yesterday's record, sport breakdown
2. **Gary Picks** — All game picks for today, filterable by sport
3. **Gary Props** — All prop picks for today, filterable by sport
4. **DFS** — Daily fantasy lineups (DraftKings + FanDuel)
5. **Results** — Yesterday's pick results with W/L stamps
6. **Settings/Profile** — User preferences, notifications

## Ad Content Guidelines

- **NO blue tint** — AI image generators default to blue-ish dark tones. Always specify warm black backgrounds, no blue cast
- **Gold is the signature** — Every Gary visual should feature the gold accent. It's the brand color.
- **Dark theme ONLY** — The app is dark mode. All marketing materials should match.
- **Logo placement** — Gary bear logo should be small branding element, not the centerpiece of the image
- **Show the app** — The pick cards are beautiful and distinctive. App screenshots and pick card mockups are strong marketing assets.
- **Real data** — When showing picks, use real examples from actual Gary picks (pull from Supabase). Don't make up fake picks.
- **Transparency** — Gary owns his losses. Marketing should reflect that — we show our record honestly.
- **Text-only for X (Twitter)** — Data shows text tweets get 10-20x more impressions than image tweets on X. Save image content for Instagram.

## Products Gary Offers

| Product | Description |
|---------|-------------|
| **Game Picks** | ATS (against the spread) picks for every game across NBA, NFL, NHL, NCAAB, NCAAF, MLB |
| **Prop Picks** | Player prop bets (OVER/UNDER on player stats) for NBA, NFL, NHL |
| **DFS Lineups** | Daily Fantasy Sports lineups for DraftKings and FanDuel (NBA) |
| **March Madness Bracket** | Full 68-team bracket picks during NCAA Tournament |

## File Locations

- **App icon (official logo):** `ios/GaryApp/Assets.xcassets/GaryIconBG.imageset/GaryIconBG.png` (1024x1024, transparent bg)
- **All Gary character images:** `ios/GaryApp/Assets.xcassets/Gary*.imageset/`
- **Marketing memory:** `/CLAUDE_MARKETING.md`
- **App screenshots (temp):** Root level `tmp_*.png` files

## Version

- Current: v2.1 (Build 3)
- Available on iOS App Store
