// User-agent based mobile detection. Runs once on first import (cached for the
// session). Treats phones + most tablets as mobile so that those visitors hit
// the App Store landing instead of the desktop site.
//
// We intentionally avoid viewport-width heuristics here — a narrow desktop
// browser window should still get the full desktop experience.

let cached = null;

export function isMobile() {
  if (cached !== null) return cached;
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || navigator.vendor || window.opera || '';

  // Phone & most tablets
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;

  // iPadOS 13+ ships a desktop-class UA — detect via touch + platform
  const isIPadOS =
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  cached = mobileRegex.test(ua) || isIPadOS;
  return cached;
}

export const APP_STORE_URL = 'https://apps.apple.com/us/app/gary-ai/id6751238914';
