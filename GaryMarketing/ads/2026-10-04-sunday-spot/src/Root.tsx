import React from "react";
import { Composition } from "remotion";
import { Spot } from "./Spot";
import timeline from "../timeline.json";

export const Root: React.FC = () => (
  // Instagram Reels: 9:16.
  <Composition id="Sunday" component={Spot} width={1080} height={1920} fps={timeline.fps}
    durationInFrames={Math.round(timeline.durationSeconds * timeline.fps)} />
);
