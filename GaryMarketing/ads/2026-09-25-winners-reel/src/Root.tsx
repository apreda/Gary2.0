import React from "react";
import { Composition } from "remotion";
import { Reel } from "./Reel";
import timeline from "../timeline.json";

const frames = Math.round(timeline.durationSeconds * timeline.fps);

export const Root: React.FC = () => (
  <>
    {/* Organic: Reels / TikTok / Shorts / X. */}
    <Composition id="Reel" component={Reel} width={1080} height={1920} fps={timeline.fps}
      durationInFrames={frames} defaultProps={{ variant: "organic" as const }} />
    {/* App Store preview, iPhone 6.9"/6.5": app footage only, no tilt, no offer. */}
    <Composition id="AppPreview" component={Reel} width={886} height={1920} fps={timeline.fps}
      durationInFrames={frames} defaultProps={{ variant: "appstore" as const }} />
  </>
);
