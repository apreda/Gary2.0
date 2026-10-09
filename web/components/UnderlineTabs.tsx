import Link from 'next/link';

export interface TabItem {
  href: string;
  label: string;
  active?: boolean;
}

/**
 * The app's tabs (LabTextTabs): words in the display face, gold when
 * selected and dim when not. No fill, no border and no bar under the live
 * one (design.md, Sep 22 2026: "You can already tell which one you're on
 * because it changes to gold").
 */
export function UnderlineTabs({ items, className = '' }: { items: TabItem[]; className?: string }) {
  return (
    <nav className={`app-tabs rail-scroll ${className}`}>
      {items.map(t => (
        <Link key={t.href} href={t.href} aria-current={t.active ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
