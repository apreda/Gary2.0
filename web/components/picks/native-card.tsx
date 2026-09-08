"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "../site/Icon";
import { MeaningfulPickView } from "../MeaningfulPickView";
import { InfoDialog } from "./InfoDialog";
import { NativeWinMark } from "./native-check";
import { NativeCardSurface } from "./native-surface";
import { NativeGameHeadline } from "./native-headline";
import type { CardPick as Pick } from "./model";

// Web translation of CompactPickRow / PropTicketRow / GaryTakeCardBack.
// Front height stays 232 points; native widths are responsive, as on the app.
export type CardFinish = "dark" | "gold" | "silver";
function FitLine({
  children,
  className = "native-hero-line",
}: {
  children: string;
  className?: string;
}) {
  const line = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = line.current;
    if (!el) return;
    let disposed = false;
    const fit = () => {
      if (disposed) return;
      el.style.removeProperty("font-size");
      const available = el.clientWidth;
      const measured = el.scrollWidth;
      if (measured > available && available > 0) {
        const size = parseFloat(getComputedStyle(el).fontSize);
        el.style.fontSize = `${size * Math.max(el.closest(".native-prop") ? 0.4 : 0.45, available / measured)}px`;
      }
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement!);
    document.fonts.ready.then(fit);
    fit();
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [children, className]);
  return (
    <span ref={line} className={className}>
      {children}
    </span>
  );
}

export function NativePickCard({
  pick,
  finish = "dark",
  anchorId,
}: {
  pick: Pick;
  finish?: CardFinish;
  anchorId?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState(false);
  const [notice, setNotice] = useState("");
  const card = useRef<HTMLDivElement>(null);
  const takeId = useId();
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paragraphs = [pick.summary, ...pick.case, ...pick.risks];
  const text = paragraphs.join("\n\n");
  const title = `${pick.team} ${pick.market}`;
  const announce = (message: string) => {
    if (timer.current) clearTimeout(timer.current);
    setNotice(message);
    timer.current = setTimeout(() => setNotice(""), 3500);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );
  const flip = () => {
    setFlipped((v) => !v);
    setExpanded(false);
    requestAnimationFrame(() =>
      card.current
        ?.querySelector<HTMLButtonElement>(
          flipped ? ".native-flip-target" : ".native-back-return",
        )
        ?.focus({ preventScroll: true }),
    );
  };
  const onCardClick = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest("button, a")) return;
    if (window.getSelection()?.toString()) return;
    flip();
  };
  const onCardKey = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      flip();
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      announce("Copy unavailable. You can select and copy the text.");
    }
  };
  const share = async () => {
    try {
      if (navigator.share)
        await navigator.share({
          title: `Gary · ${title}`,
          text: `${title}. ${pick.summary}`,
          url: shareUrl(),
        });
      else {
        await navigator.clipboard.writeText(shareUrl());
        announce("Link copied.");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        announce("Sharing unavailable. Copy the page link from your browser.");
    }
  };
  const leagueColor =
    (
      {
        MLB: "#63D17E",
        NFL: "#2C7EDB",
        NBA: "#5E9FE6",
        NCAAF: "#D6A65C",
      } as Record<string, string>
    )[pick.sport] || "#bdb7ae";
  const shareUrl = () =>
    new URL(
      pick.shareHref ||
        pick.href ||
        `${location.pathname}#${encodeURIComponent(pick.id)}`,
      location.origin,
    ).href;
  return (
    <div
      className={`native-card-shell ${flipped ? "is-flipped" : ""} ${expanded ? "is-expanded" : ""}`}
      id={anchorId}
    >
      <div
        ref={card}
        className={`native-card native-${finish} ${pick.kind === "prop" ? "native-prop" : "native-game"} ${pick.result ? `native-${pick.result}` : ""} ${pick.payout ? "native-has-payout" : ""}`}
        role="group"
        tabIndex={-1}
        aria-label={title}
        onClick={onCardClick}
        onKeyDown={onCardKey}
      >
        <div className="native-rotator">
          <div className="native-front" aria-hidden={flipped} inert={flipped}>
            <button
              type="button"
              className="native-flip-target"
              aria-label={`Flip ${title} to read Gary’s Take`}
              aria-expanded={flipped}
              onClick={flip}
            />
            <NativeCardSurface
              finish={finish}
              instanceId={takeId.replaceAll(":", "")}
            />
            <div className="native-eyebrow">
              {pick.eyebrow || "GARY'S PICK"}
            </div>
            {!pick.result && (
              <Image
                className="native-mark"
                src="/site/gary-current.png"
                alt=""
                width="53"
                height="53"
              />
            )}
            {pick.result === "won" && <NativeWinMark />}
            {pick.payout && finish !== "dark" && (
              <div className="native-payout">{pick.payout}</div>
            )}
            {pick.result === "lost" && (
              <svg
                className="native-crack"
                viewBox="0 0 346 232"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M252 0 240 38 258 72 234 116 250 158 230 200 240 232"
                  fill="none"
                  stroke={finish === "dark" ? "#000000bf" : "#231a02b8"}
                  strokeWidth="2"
                />
                <path
                  d="M254 0 242 38 260 72 236 116 252 158 232 200 242 232"
                  fill="none"
                  stroke={finish === "dark" ? "#e5484d61" : "#f0d87966"}
                  strokeWidth="1"
                />
              </svg>
            )}
            <>
              {pick.kind === "prop" ? (
                <div className="native-hero">
                  <FitLine>{pick.team.toUpperCase()}</FitLine>
                  <FitLine>{pick.market.toUpperCase()}</FitLine>
                </div>
              ) : (
                <NativeGameHeadline
                  team={pick.team}
                  market={pick.market}
                  premium={finish !== "dark"}
                />
              )}
            </>
            <div className="native-meta">
              <span
                className="native-league"
                style={{ "--league-color": leagueColor } as CSSProperties}
              >
                {pick.sport}
              </span>
              <FitLine className="native-opponent">
                {pick.meta ||
                  (pick.kind === "prop"
                    ? pick.opponent
                    : pick.opponent
                      ? `${pick.away ? "@" : "vs"} ${pick.opponent}`
                      : "")}
              </FitLine>
              {pick.odds && <span className="native-odds">· {pick.odds}</span>}
              <div className="native-actions">
                <button
                  aria-label={`Information about ${title}`}
                  onClick={() => setInfo(true)}
                >
                  <Icon name="info" />
                </button>
                <button aria-label={`Share ${title}`} onClick={share}>
                  <Icon name="share" />
                </button>
              </div>
            </div>
            <div className="native-divider" />
            <div className="native-footer">
              <span>
                {pick.result === "won" &&
                (finish === "dark" || pick.kind === "prop")
                  ? "✓ "
                  : ""}
                {pick.resultLine || pick.time}
              </span>
              <Icon name="chevron" />
            </div>
          </div>
          {
            <div
              className="native-back"
              aria-hidden={!flipped}
              inert={!flipped}
            >
              <div className="native-back-header">
                <button
                  type="button"
                  className="native-back-return"
                  onClick={flip}
                  aria-label="Return to the pick"
                >
                  GARY&apos;S TAKE
                </button>
                <div>
                  <button
                    className={copied ? "is-copied" : ""}
                    aria-label={copied ? "Take copied" : "Copy Gary’s Take"}
                    onClick={copy}
                  >
                    {copied ? <Icon name="check" /> : <Icon name="copy" />}
                  </button>
                  <button aria-label={`Share ${title}`} onClick={share}>
                    <Icon name="share" />
                  </button>
                </div>
              </div>
              <MeaningfulPickView
                path={pick.href || ""}
                enabled={flipped && expanded && !!pick.href}
              >
                <div
                  className={`native-take ${expanded ? "expanded" : ""}`}
                  id={takeId}
                >
                  <p hidden={expanded}>{paragraphs.join(" ")}</p>
                  <div hidden={!expanded}>
                    {paragraphs.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </div>
              </MeaningfulPickView>
              <div className="native-back-footer">
                <button
                  aria-label={
                    expanded ? "Collapse Gary’s Take" : "Expand Gary’s Take"
                  }
                  aria-expanded={expanded}
                  aria-controls={takeId}
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? <Icon name="up" /> : <Icon name="down" />}
                </button>
              </div>
            </div>
          }
        </div>
      </div>
      <div className={`native-notice ${notice ? "visible" : ""}`} role="status">
        {notice}
      </div>
      <InfoDialog open={info} onClose={() => setInfo(false)}>
        <h2>
          {pick.team}
          <br />
          {pick.market}
        </h2>
        <p>
          {pick.odds} · {pick.resultLine || pick.time}
        </p>
        <p>{pick.meta || pick.opponent}</p>
        {pick.href && (
          <Link href={pick.href} className="site-text-link">
            Open Full Game Analysis <Icon />
          </Link>
        )}
        {pick.fullAnalysis && (
          <details>
            <summary>The Full Analysis</summary>
            <div>
              {pick.fullAnalysis.split(/\n\s*\n/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </details>
        )}
        <button
          className="site-button site-button-gold"
          onClick={() => {
            setInfo(false);
            setFlipped(true);
            requestAnimationFrame(() =>
              card.current
                ?.querySelector<HTMLButtonElement>(".native-back-return")
                ?.focus(),
            );
          }}
        >
          Read Gary’s Take <Icon name="chevron" size={16} />
        </button>
      </InfoDialog>
    </div>
  );
}
