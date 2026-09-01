/**
 * The desk grid — the whole slate as tiles, three across on a desktop, and
 * any tile opens IN PLACE into the full card (wire lines, the read,
 * tail/fade) spanning the row like a spotlight. No modals, no route change:
 * the board never leaves the screen.
 *
 * Each card is a native disclosure. The preview sits beside the <details> so
 * it remains visible and readable while the disclosure is closed; the
 * absolutely positioned <summary> is its keyboard-operable hit target. Most
 * importantly, every panel is rendered unconditionally inside <details>, so
 * its full rationale ships in the initial HTML without a crawler click.
 */

export interface BoardGridItem {
  key: string;
  label: string;
  tile: React.ReactNode;
  panel: React.ReactNode;
}

export function BoardGrid({ items }: { items: BoardGridItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item, i) => {
        const panelId = `board-panel-${encodeURIComponent(item.key)}`;

        return (
          <div
            key={item.key}
            className="relative rise has-[>details[open]]:col-span-full"
            style={{ animationDelay: `${(i % 9) * 45}ms` }}
          >
            <details
              name="gary-picks-board"
              className="group/board-card peer/board-card absolute inset-0 z-10 open:static"
            >
              <summary
                aria-controls={panelId}
                className="absolute inset-0 cursor-pointer list-none rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 group-open/board-card:static [&::-webkit-details-marker]:hidden"
              >
                <span className="sr-only group-open/board-card:hidden">
                  Open the full card for {item.label}
                </span>
                <span className="mb-1.5 hidden items-center justify-end gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.07em] text-low transition-colors hover:text-gold group-open/board-card:flex">
                  Back to the board
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                    <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
              </summary>

              <div id={panelId} data-board-panel className="mx-auto max-w-4xl">
                {item.panel}
              </div>
            </details>

            <div data-board-preview className="group relative h-full peer-open/board-card:hidden">
              {item.tile}
            </div>
          </div>
        );
      })}
    </div>
  );
}
