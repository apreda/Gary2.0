import React from "react";
import { Composition } from "remotion";
import { Pick, PICK_FRAMES } from "./Pick";
import { Unveil, UNVEIL_FRAMES } from "./Unveil";

export const Root: React.FC = () => (
  <>
    {/* X, 4:5 (Ad.md §6): the app's own Winners unveil, full bleed. The one to post. */}
    <Composition id="PickUnveil" component={Unveil} width={1080} height={1350} fps={30} durationInFrames={UNVEIL_FRAMES} />
    {/* First try (light stage, card flip). Kept for reference; not for posting. */}
    <Composition id="PickSquare" component={Pick} width={1080} height={1080} fps={30} durationInFrames={PICK_FRAMES} />
  </>
);
