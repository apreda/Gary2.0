import React from "react";
import { Composition } from "remotion";
import { DartsReel } from "./DartsReel";
import timeline from "../timeline.json";

const frames = Math.round(timeline.durationSeconds * timeline.fps);

export const Root: React.FC = () => (
  <>
    {/* @BetwithGary: TikTok / Reels / X, with the call to action. */}
    <Composition id="Darts" component={DartsReel} width={1080} height={1920} fps={timeline.fps}
      durationInFrames={frames} defaultProps={{ cta: true }} />
    {/* Adam's own post ("made with Opus 5.5"): the same film, the card without the ask. */}
    <Composition id="DartsShowcase" component={DartsReel} width={1080} height={1920} fps={timeline.fps}
      durationInFrames={frames} defaultProps={{ cta: false }} />
  </>
);
