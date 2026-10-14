"use client";

/** Event GrowthAnalytics listens for to reopen the analytics choice. */
export const PRIVACY_CHOICES_EVENT = "gary:privacy-choices";

/** Privacy choices in the footer, where phones reach it (the floating one would sit on the page). */
export function PrivacyChoicesLink() {
  return (
    <button
      type="button"
      className="site-footer-choice"
      onClick={() => window.dispatchEvent(new Event(PRIVACY_CHOICES_EVENT))}
    >
      Privacy choices
    </button>
  );
}
