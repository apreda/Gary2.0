import React from "react";
import { Composition } from "remotion";
import { Pick, PICK_FRAMES } from "./Pick";
import { Unveil, DEMO_PROPS, totalFrames, UnveilProps } from "./Unveil";

export const Root: React.FC = () => (
  <>
    {/* X, 16:9: the app's own Winners unveil; the words go in the tweet. Length follows the day's measurements. */}
    <Composition id="PickUnveil" component={Unveil} width={1920} height={1080} fps={30}
      durationInFrames={totalFrames(DEMO_PROPS)} defaultProps={DEMO_PROPS}
      calculateMetadata={({ props }) => ({ durationInFrames: totalFrames(props as UnveilProps) })} />
    {/* First try (light stage, card flip). Kept for reference; not for posting. */}
    <Composition id="PickSquare" component={Pick} width={1080} height={1080} fps={30} durationInFrames={PICK_FRAMES} />
  </>
);
