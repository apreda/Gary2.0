import React from 'react';
import './SidebarMenu.css';

export interface SidebarMenuProps {
  title: string;
  children: React.ReactNode;
}

export function SidebarMenu({ title, children }: SidebarMenuProps) {
  return (
    <div className="gary-sidebar-menu">
      <h3 className="gary-sidebar-menu-title">{title}</h3>
      <ul className="gary-sidebar-menu-list">{children}</ul>
    </div>
  );
}

export interface SidebarMenuItemProps {
  text: string;
  active?: boolean;
}

export function SidebarMenuItem({ text, active = false }: SidebarMenuItemProps) {
  return (
    <li className={`gary-sidebar-menu-item ${active ? 'active' : ''}`}>
      {text}
    </li>
  );
} 