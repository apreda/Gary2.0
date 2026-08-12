'use client';

import { useEffect, useState } from 'react';

/**
 * The desk grid — the whole slate as tiles, three across on a desktop, and
 * any tile opens IN PLACE into the full card (wire lines, the read,
 * tail/fade) spanning the row like a spotlight. No modals, no route change:
 * the board never leaves the screen. Tiles and panels arrive server-rendered
 * as slots; this component only owns which one is open.
 */

export interface BoardGridItem {
  key: string;
  tile: React.ReactNode;
  panel: React.ReactNode;
}

export function BoardGrid({ items }: { items: BoardGridItem[] }) {
  const [open, setOpen] = useState<string | null>(null);

  // Opening a low tile can land the panel off-screen — bring it into view.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`board-open-${open}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [open]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item, i) =>
        item.key === open ? (
          <div key={item.key} id={`board-open-${item.key}`} className="rise col-span-full">
            <div className="mx-auto max-w-4xl">
              <div className="mb-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.07em] text-low transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
                >
                  Back to the board
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                    <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {item.panel}
            </div>
          </div>
        ) : (
          <div key={item.key} className="group relative rise" style={{ animationDelay: `${(i % 9) * 45}ms` }}>
            {item.tile}
            <button
              type="button"
              onClick={() => setOpen(item.key)}
              aria-expanded={false}
              aria-label="Open the full card"
              className="absolute inset-0 cursor-pointer rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
            />
          </div>
        ),
      )}
    </div>
  );
}
