'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * The no-ellipsis clamp: caps prose at `lines` lines and fades the last line
 * out instead of rendering "…" (line-clamp's glyph is banned site-wide).
 * The fade only applies when the text actually overflows — a short take
 * renders untouched — which is why this measures instead of using pure CSS
 * (mask-image tracks the element's real height, so an unconditional mask
 * would fade the final line of non-overflowing text too).
 *
 * Pass the text size + leading in className; max-height is computed in em
 * from `leading` so the cut always lands on a line boundary.
 */
export function ClampFade({
  lines,
  leading = 1.625,
  className = '',
  children,
}: {
  lines: number;
  leading?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <p
      ref={ref}
      className={`overflow-hidden ${clipped ? 'clamp-fade' : ''} ${className}`}
      style={{ maxHeight: `${lines * leading}em` }}
    >
      {children}
    </p>
  );
}
