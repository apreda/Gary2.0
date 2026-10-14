"use client";

import Image from "next/image";
import { useId } from "react";
import { Icon } from "../site/Icon";
import { NativeCardSurface } from "./native-surface";

// Web translation of TeasedPickCard (ios/GaryApp/Picks/TeasedPickCard.swift):
// a real pick card in every way, eyebrow, hero, caption and footer, whose
// headline happens to be PICKS INCOMING until Gary's pick is out.

function eventName(league: string | null): string {
  switch ((league ?? "").toUpperCase()) {
    case "NFL":
    case "NCAAF":
      return "kickoff";
    case "NBA":
      return "tipoff";
    default:
      return "first pitch";
  }
}

export function NativeTeasedCard({
  league = null,
  time = null,
  label = "Gary’s free pick is coming",
}: {
  league?: string | null;
  /** "8:00 PM ET" when the first game is known. */
  time?: string | null;
  label?: string;
}) {
  const id = useId().replaceAll(":", "");
  const footer = [league?.toUpperCase(), time].filter(Boolean).join(" · ") || "TONIGHT";
  return (
    <div className="native-card-shell native-teased-shell">
      <div className="native-card native-dark native-teased" role="group" aria-label={label}>
        <div className="native-rotator">
          <div className="native-front">
            <NativeCardSurface finish="dark" instanceId={id} />
            <div className="native-eyebrow">GARY&apos;S PICK</div>
            <Image className="native-mark" src="/site/gary-current.png" alt="" width="53" height="53" />
            <div className="native-hero native-teased-hero">
              <span className="native-hero-line">PICKS</span>
              <span className="native-hero-line">INCOMING</span>
            </div>
            <p className="native-teased-caption">Pick posts before {eventName(league)}.</p>
            <div className="native-divider" />
            <div className="native-footer">
              <span>{footer}</span>
              <Icon name="chevron" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
