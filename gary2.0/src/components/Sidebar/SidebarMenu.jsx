import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './SidebarMenu.css';

export function SidebarMenuItem({ to, text, onClick }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link 
      to={to} 
      onClick={onClick}
      className={`
        block px-md py-sm my-1
        rounded-md
        font-medium
        transition-all
        duration-fast
        ${isActive 
          ? 'bg-[#d4af37] text-black font-bold shadow-sm' 
          : 'text-white hover:bg-[#333333] hover:text-[#d4af37] dark:text-white dark:hover:bg-[#333333]'}
      `}
    >
      <div className="flex items-center gap-sm">
        {text}
        {isActive && (
          <svg className="h-4 w-4 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
    </Link>
  );
}

export function SidebarMenu({ children }) {
  return (
    <div className="space-y-1">
      {children}
    </div>
  );
}
