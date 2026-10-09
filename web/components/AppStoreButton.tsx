'use client';

import { webAppStorePath } from '@/lib/gary/app-store';
import { logAppStoreHandoff } from '@/lib/gary/analytics';
import { Icon } from '@/components/site/Icon';

/**
 * The app's action: gold display type with a chevron, no fill and no
 * capsule (design.md). Every App Store link on the site is its own tracked
 * campaign (/c/web_<surface>), so each tap is counted and App Store Connect
 * attributes the install to the spot on the site it came from.
 */
export function AppStoreButton({
  label = 'Get Gary on the App Store',
  surface = 'unknown',
  className = '',
}: {
  label?: string;
  surface?: string;
  className?: string;
}) {
  return (
    <a
      href={webAppStorePath(surface)}
      onClick={() => logAppStoreHandoff(surface)}
      className={`app-action ${className}`}
    >
      {label}
      <Icon name="chevron" size={18} />
    </a>
  );
}
