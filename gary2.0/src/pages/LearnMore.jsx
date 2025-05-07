import { useEffect } from 'react';

export default function LearnMore() {
  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white pt-24 pb-20">
      <div className="max-w-3xl mx-auto px-6">
        <h1 className="text-3xl md:text-4xl font-bold text-center mb-6 text-[#B8953F]">Learn More</h1>
        
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-[#B8953F]">Message from the Founder</h2>
          <p className="mb-4">Hey—I'm Adam, the person who built this.</p>
          <p className="mb-4">I made this app because I felt like there was a gap between the chaos of gambling content and the simplicity most of us actually want. When you're deciding whether to bet a game, you don't need 15 conflicting takes—you just want a clear answer: yes or no. Ride or fade.</p>
          <p className="mb-4">That's what this is. It's not about guaranteeing wins. It's about building a system that gives you consistent, honest picks with reasoning behind them—and then letting you decide what to do with it.</p>
        </section>
        
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-[#B8953F]">Why I Built This</h2>
          <p className="mb-4">The betting world is full of noise. I wanted something clean, trustworthy, and fun. Something where the picks are locked, the track record is public, and no one's pretending this is magic.</p>
          <p className="mb-4">The goal here is simple: make sharp picks, show our work, and let the system prove itself over time. And if it doesn't? Then let's fade it together and beat the house that way.</p>
          <p className="mb-4">Either way, we win by being honest about what works and what doesn't.</p>
        </section>
        
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-[#B8953F]">Feedback</h2>
          <p className="mb-4">This whole thing is an experiment—and I want it to get better. If you have thoughts, suggestions, or just want to share how you're using it, I'm all ears. I built this to be useful, and the best way to make it better is hearing from the people actually using it.</p>
        </section>
        
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-[#B8953F]">Open Win Rate Tracker</h2>
          <p className="mb-4">Every pick made is public and tracked on the BillFold page. I'm not hiding anything. You'll see Gary's actual record, the wins, the losses, and how the bankroll is trending. I care about transparency because if this isn't real, then what's the point?</p>
          <p className="mb-4">I'd rather build something we can all trust—even if that means being honest about cold streaks.</p>
        </section>
        
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-[#B8953F]">How the Pick System Works</h2>
          <p className="mb-4">I created a system that pulls from a few key layers:</p>
          <ul className="list-disc pl-8 mb-4 space-y-2">
            <li><span className="font-medium text-[#B8953F]">Game context</span> – matchup data, recent form, travel, rest, injuries, etc.</li>
            <li><span className="font-medium text-[#B8953F]">Stat signals</span> – sport-specific data that actually correlates with outcomes (not fluff).</li>
            <li><span className="font-medium text-[#B8953F]">Instinct layer</span> – this is the layer that makes it human. Momentum, revenge games, trap lines, fan psychology—stuff that matters but doesn't always show up in spreadsheets.</li>
          </ul>
          <p className="mb-4">It's not overcomplicated, but it is intentional. Every pick is generated using the same process and posted daily at 10am ET. You'll always know where the system stands.</p>
        </section>
      </div>
    </div>
  );
}
