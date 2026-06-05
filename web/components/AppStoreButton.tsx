export const APP_STORE_URL = 'https://apps.apple.com/us/app/gary-ai/id6751238914';

export function AppStoreButton({ label = 'Download on the App Store' }: { label?: string }) {
  return (
    <a
      href={APP_STORE_URL}
      className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 font-body text-sm font-semibold text-ink transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
    >
       {label}
    </a>
  );
}
