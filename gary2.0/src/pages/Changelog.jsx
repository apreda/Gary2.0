import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, Bug, Zap, Wrench, Gift, Rocket } from 'lucide-react';

const changelogEntries = [
  {
    version: "1.0.5",
    date: "December 18, 2025",
    type: "update",
    title: "Enhanced User Experience",
    changes: [
      "Added Changelog page so users can track app updates and improvements",
      "Improved pick card UI with better rationale display formatting",
      "Enhanced college sports display - now shows school names instead of mascots for NCAAB/NCAAF",
      "Added convergence scoring visualization to 'The Bears Brain' section",
      "Various UI polish and performance improvements"
    ]
  },
  {
    version: "1.0.4",
    date: "December 16, 2025",
    type: "feature",
    title: "Scout Report Builder",
    changes: [
      "Introduced Scout Report Builder with real-time intel",
      "Added injury tracking by player name",
      "Weather conditions integration for outdoor sports",
      "Travel and rest day analysis",
      "Breaking news integration via Perplexity API"
    ]
  },
  {
    version: "1.0.3",
    date: "December 14, 2025",
    type: "improvement",
    title: "3-Stage Agentic Pipeline",
    changes: [
      "Launched the 3-stage agentic pipeline: Hypothesis → Investigation → Judge",
      "Sport-specific constitutions for NFL, NBA, NCAAF, NCAAB, NHL, MLB",
      "Added 'Fan Brain' qualitative analysis (revenge games, trap alerts, letdown spots)",
      "Improved confidence scoring algorithm"
    ]
  },
  {
    version: "1.0.2",
    date: "December 12, 2025",
    type: "feature",
    title: "iOS App Launch Improvements",
    changes: [
      "Liquid glass UI design implemented across all screens",
      "Added animated pick cards with flip-to-reveal analysis",
      "Bet/Fade tracking system introduced",
      "Settings view with legal links and app info"
    ]
  },
  {
    version: "1.0.1",
    date: "December 11, 2025",
    type: "fix",
    title: "Launch Day Fixes",
    changes: [
      "Fixed timezone handling for Eastern Time pick display",
      "Resolved pick card rendering issues",
      "Improved Supabase query performance",
      "Fixed confidence score display formatting"
    ]
  },
  {
    version: "1.0.0",
    date: "December 10, 2025",
    type: "launch",
    title: "🚀 Gary A.I. Official Launch",
    changes: [
      "Initial release of Gary A.I. - Your AI-powered sports betting companion",
      "Support for 7 sports: NFL, NBA, NCAAF, NCAAB, NHL, MLB, EPL",
      "Daily AI-generated picks with detailed analysis",
      "GPT-5.1 powered reasoning engine",
      "Perplexity integration for real-time data",
      "Odds API integration for live betting lines",
      "Free to use - no paywall, no sign-up required"
    ]
  }
];

const getTypeIcon = (type) => {
  switch (type) {
    case 'launch':
      return <Rocket className="w-5 h-5" />;
    case 'feature':
      return <Sparkles className="w-5 h-5" />;
    case 'improvement':
      return <Zap className="w-5 h-5" />;
    case 'fix':
      return <Bug className="w-5 h-5" />;
    case 'update':
      return <Wrench className="w-5 h-5" />;
    default:
      return <Gift className="w-5 h-5" />;
  }
};

const getTypeColor = (type) => {
  switch (type) {
    case 'launch':
      return 'bg-gradient-to-r from-[#B8953F] to-[#d4af37] text-black';
    case 'feature':
      return 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
    case 'improvement':
      return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    case 'fix':
      return 'bg-red-500/20 text-red-400 border border-red-500/30';
    case 'update':
      return 'bg-[#B8953F]/20 text-[#B8953F] border border-[#B8953F]/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
  }
};

const getTypeLabel = (type) => {
  switch (type) {
    case 'launch':
      return 'Launch';
    case 'feature':
      return 'New Feature';
    case 'improvement':
      return 'Improvement';
    case 'fix':
      return 'Bug Fix';
    case 'update':
      return 'Update';
    default:
      return 'Update';
  }
};

export function Changelog() {
  return (
    <div className="min-h-screen relative">
      {/* Fixed background with all effects */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#0a0a0c] to-[#18181a] z-0">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#b8953f]/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#b8953f]/10 blur-3xl" />
        <div className="absolute top-1/4 right-1/3 w-[300px] h-[300px] rounded-full bg-white/[0.06] blur-3xl" />
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.15] mix-blend-soft-light" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        {/* Back button */}
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-[#B8953F] hover:text-[#d4af37] transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Home
        </Link>

        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <img 
              src="/coin2.png" 
              alt="Gary Coin" 
              className="w-12 h-12 object-contain"
              style={{ filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))" }}
            />
            <h1 className="text-4xl font-bold text-white">
              Changelog
            </h1>
          </div>
          <p className="text-white/60 text-lg">
            Stay up to date with all the latest improvements and updates to Gary A.I.
          </p>
        </div>

        {/* Changelog entries */}
        <div className="space-y-8">
          {changelogEntries.map((entry, index) => (
            <div 
              key={index}
              className="relative bg-[#1a1a1a] rounded-2xl p-6 border border-white/10 hover:border-[#B8953F]/30 transition-all duration-300"
            >
              {/* Version and date header */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="text-white font-mono text-sm bg-white/10 px-3 py-1 rounded-full">
                  v{entry.version}
                </span>
                <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${getTypeColor(entry.type)}`}>
                  {getTypeIcon(entry.type)}
                  {getTypeLabel(entry.type)}
                </span>
                <span className="text-white/40 text-sm ml-auto">
                  {entry.date}
                </span>
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-white mb-4">
                {entry.title}
              </h2>

              {/* Changes list */}
              <ul className="space-y-2">
                {entry.changes.map((change, changeIndex) => (
                  <li key={changeIndex} className="flex items-start gap-3 text-white/70">
                    <span className="text-[#B8953F] mt-1.5">•</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>

              {/* Timeline connector (except for last item) */}
              {index < changelogEntries.length - 1 && (
                <div className="absolute left-8 -bottom-8 w-0.5 h-8 bg-gradient-to-b from-[#B8953F]/30 to-transparent" />
              )}
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-12 text-center">
          <p className="text-white/40 text-sm">
            Have feedback or feature requests? We'd love to hear from you!
          </p>
          <a 
            href="mailto:support@betwithgary.ai" 
            className="text-[#B8953F] hover:text-[#d4af37] transition-colors text-sm"
          >
            support@betwithgary.ai
          </a>
        </div>
      </div>
    </div>
  );
}

export default Changelog;
