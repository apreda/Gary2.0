import React from 'react';
import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className={`
        p-2 rounded-lg
        transition-all duration-200
        bg-white dark:bg-black
        hover:bg-gray-100 dark:hover:bg-gray-900
        focus:outline-none focus:ring-2 focus:ring-[#d4af37] dark:focus:ring-[#d4af37]
        text-black dark:text-white
        relative overflow-hidden
        border border-[#c0c0c0] dark:border-[#333333]
      `}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${isDark ? 'opacity-0' : 'opacity-100'}`}>
        <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      </div>
      <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${isDark ? 'opacity-100' : 'opacity-0'}`}>
        <svg className="w-5 h-5 text-[#d4af37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      </div>
    </button>
  );
}
