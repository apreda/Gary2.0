import type { CSSProperties } from "react";
const paths = {
  arrow: "M7 17 17 7M7 7h10v10",
  right: "M4 12h16m-6-6 6 6-6 6",
  check: "m5 12 4 4L19 6",
  phone:
    "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 17h2",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  book: "M12 5v16M3 3h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z",
  scan: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 8h10M7 12h10M7 16h6",
  shield: "m12 3 9 4c0 7-3 11-9 14-6-3-9-7-9-14Zm-4 9 3 3 5-6",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  info: "M12 11v6M12 7h.01",
  share: "M12 15V2m-4 4 4-4 4 4M8 9H5v12h14V9h-3",
  copy: "M9 9h12v12H9ZM15 9V3H3v12h6",
  down: "m6 9 6 6 6-6",
  up: "m6 15 6-6 6 6",
  chevron: "m9 6 6 6-6 6",
};
export function Icon({
  name = "arrow",
  size = 20,
  style,
}: {
  name?: keyof typeof paths;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {name === "info" && <circle cx="12" cy="12" r="9" />}
      <path d={paths[name]} />
    </svg>
  );
}
