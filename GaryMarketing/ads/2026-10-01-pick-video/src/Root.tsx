import React from "react";
import { Composition } from "remotion";
import { Pick, PICK_FRAMES } from "./Pick";

export const Root: React.FC = () => (
  <>
    {/* X: square fills the phone feed's width and is never cropped. */}
    <Composition id="PickSquare" component={Pick} width={1080} height={1080} fps={30} durationInFrames={PICK_FRAMES} />
  </>
);
