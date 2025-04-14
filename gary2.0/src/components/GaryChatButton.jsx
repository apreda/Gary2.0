import { useState, useEffect } from "react";
import { GaryChatDrawer } from "./GaryChatDrawer";

export function GaryChatButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    // Add a small delay before adding the pulse animation
    const timer = setTimeout(() => {
      setAnimated(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleClick = () => {
    setIsOpen(!isOpen);
    setAnimated(false); // Remove animation once clicked
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`
          fixed bottom-6 right-6 z-40
          flex items-center gap-2 md:gap-3
          bg-black hover:bg-gray-900 dark:bg-black dark:hover:bg-gray-900
          text-white
          rounded-full
          px-4 py-3 md:px-5 md:py-3.5
          shadow-lg hover:shadow-xl
          transition-all duration-300
          group
          ${animated ? 'animate-pulse' : ''}
        `}
        aria-label="Chat with Gary"
      >
        <div className="w-8 h-8 rounded-full bg-[#d4af37]/90 flex items-center justify-center">
          <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <span className="font-medium text-sm md:text-base">Chat with Gary</span>
      </button>
      {isOpen && <GaryChatDrawer onClose={() => setIsOpen(false)} />}
    </>
  );
}