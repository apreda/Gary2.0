import React from "react";
import { Composition } from "remotion";
import { POSTER_AT, Reel } from "./Reel";
import timeline from "../timeline.json";
import { POSTER_HOLD } from "./Poster";

const frames = Math.round(timeline.durationSeconds * timeline.fps);

export const Root: React.FC = () => (
  <>
    {/* Organic: Reels / TikTok / Shorts / X. */}
    <Composition id="Reel" component={Reel} width={1080} height={1920} fps={timeline.fps}
      durationInFrames={frames + POSTER_HOLD} defaultProps={{ variant: "organic" as const, intro3d: false, cover: true }} />
    {/* Organic with the Blender phone intro (blender/intro3d.py) ahead of the same edit. */}
    <Composition id="Reel3D" component={Reel} width={1080} height={1920} fps={timeline.fps}
      durationInFrames={frames + Math.round(timeline.intro3d.seconds * timeline.fps) - POSTER_AT + POSTER_HOLD}
      defaultProps={{ variant: "organic" as const, intro3d: true, cover: true }} />
    {/* App Store preview, iPhone 6.9"/6.5": app footage only, no tilt, no offer. */}
    <Composition id="AppPreview" component={Reel} width={886} height={1920} fps={timeline.fps}
      durationInFrames={frames} defaultProps={{ variant: "appstore" as const, intro3d: false, cover: false }} />
  </>
);
