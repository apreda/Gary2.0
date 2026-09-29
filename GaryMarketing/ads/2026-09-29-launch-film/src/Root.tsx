import React from "react";
import { Composition } from "remotion";
import { Film } from "./Film";
import timeline from "../timeline.json";

const frames = Math.round(timeline.durationSeconds * timeline.fps);

export const Root: React.FC = () => (
  <>
    {/* X launch post and YouTube: 16:9. */}
    <Composition id="LaunchWide" component={Film} width={1920} height={1080} fps={timeline.fps}
      durationInFrames={frames} defaultProps={{ layout: "wide" as const }} />
    {/* Instagram Reels, TikTok, YouTube Shorts: 9:16. */}
    <Composition id="LaunchTall" component={Film} width={1080} height={1920} fps={timeline.fps}
      durationInFrames={frames} defaultProps={{ layout: "tall" as const }} />
  </>
);
