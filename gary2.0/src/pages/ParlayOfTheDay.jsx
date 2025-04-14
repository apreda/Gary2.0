import { ParlayOfTheDay } from "../components/ParlayOfTheDay";
import { ParlayFeed } from "../components/ParlayFeed";

export const GarysDailyParlay = () => {
  return (
    <div className="px-4 py-8 bg-white">
      <div className="max-w-7xl mx-auto mb-12">
        <h1 className="text-4xl font-bold text-center text-black mb-2 relative inline-block">
          <span>Daily Parlay</span>
          <div className="absolute -bottom-2 left-0 w-full h-[3px] bg-[#d4af37]"></div>
        </h1>
        <p className="text-lg text-[#444444] max-w-2xl mx-auto mt-6 text-center">
          Gary's handcrafted parlay based on statistical models, line movement analysis, and decades of experience
        </p>
      </div>
      <ParlayOfTheDay />
      <ParlayFeed />
    </div>
  );
};