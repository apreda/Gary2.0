import type { CardFinish } from "./native-card";

// Same normalized gradient coordinates and stops as GoldBar / SilverBar.
// Normalization matters: a CSS angle changes the finish as card widths change.
export function NativeCardSurface({
  finish,
  instanceId,
}: {
  finish: CardFinish;
  instanceId: string;
}) {
  if (finish === "dark") return null;
  const prefix = `metal-${instanceId}`;
  const colors =
    finish === "gold"
      ? ["#D0AC3C", "#BF9927", "#AE8926", "#BF9C33", "#9E7D1C"]
      : ["#C6C6CC", "#B2B2B9", "#A2A2AA", "#B5B5BC", "#90909A"];
  const positions = [0, 0.32, 0.58, 0.8, 1];
  return (
    <svg
      className="native-surface"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`${prefix}-base`}
          x1="38%"
          y1="0%"
          x2="62%"
          y2="100%"
        >
          {colors.map((color, i) => (
            <stop key={color} offset={positions[i]} stopColor={color} />
          ))}
        </linearGradient>
        <linearGradient
          id={`${prefix}-polish`}
          x1="0%"
          y1="10%"
          x2="100%"
          y2="90%"
        >
          <stop
            offset="30%"
            stopColor={finish === "gold" ? "#EFD470" : "#E8E8EE"}
            stopOpacity="0"
          />
          <stop
            offset="46%"
            stopColor={finish === "gold" ? "#EFD470" : "#E8E8EE"}
            stopOpacity={finish === "gold" ? 0.17 : 0.18}
          />
          <stop
            offset="62%"
            stopColor={finish === "gold" ? "#EFD470" : "#E8E8EE"}
            stopOpacity="0"
          />
        </linearGradient>
        <linearGradient id={`${prefix}-edge`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop stopColor="#F0D879" stopOpacity=".85" />
          <stop offset="100%" stopColor="#3A2C04" stopOpacity=".7" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" rx="20" fill={`url(#${prefix}-base)`} />
      <rect
        width="100%"
        height="100%"
        rx="20"
        fill={`url(#${prefix}-polish)`}
      />
      {finish === "gold" && (
        <rect
          x="1"
          y="1"
          width="calc(100% - 2px)"
          height="calc(100% - 2px)"
          rx="19"
          fill="none"
          stroke={`url(#${prefix}-edge)`}
          strokeWidth="2"
        />
      )}
    </svg>
  );
}
