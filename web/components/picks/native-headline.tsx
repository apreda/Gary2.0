"use client";
import { useEffect, useRef } from "react";

// These are rendered native baselines measured from the approved app, not
// nominal SwiftUI font requests. The fixed-height gold card resolves to 58.5pt.
export function NativeGameHeadline({
  team,
  market,
  premium,
}: {
  team: string;
  market: string;
  premium: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const size = premium ? 58.5 : 56.16;
  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    let active = true;
    const fit = () => {
      if (!active) return;
      const width = root.clientWidth;
      if (!width) return;
      root.querySelectorAll("text").forEach((line) => {
        line.setAttribute("font-size", String(size));
        const measured = line.getComputedTextLength();
        if (measured > width)
          line.setAttribute(
            "font-size",
            String(size * Math.max(0.45, width / measured)),
          );
      });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    document.fonts.ready.then(fit);
    fit();
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [team, market, size]);
  return (
    <svg
      ref={svg}
      className="native-game-headline"
      aria-hidden="true"
      height="232"
    >
      <text x="0" y={premium ? 95.95 : 92.642} fontSize={size}>
        {team.toUpperCase()}
      </text>
      <text x="0" y={premium ? 141.62 : 141.982} fontSize={size}>
        {market.toUpperCase()}
      </text>
    </svg>
  );
}
