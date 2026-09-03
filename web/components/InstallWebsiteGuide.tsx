'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string };

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function websiteIsInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as NavigatorWithStandalone).standalone === true
  );
}

export function InstallWebsiteGuide() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    // Defer the browser-only check until after hydration so server and client
    // render the same initial markup.
    const installedCheck = window.requestAnimationFrame(() => setInstalled(websiteIsInstalled()));

    function capturePrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function confirmInstall() {
      setInstalled(true);
      setInstallPrompt(null);
      setStatus('Gary’s website was added to this device.');
    }

    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', confirmInstall);
    return () => {
      window.cancelAnimationFrame(installedCheck);
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', confirmInstall);
    };
  }, []);

  async function requestInstall() {
    if (!installPrompt) return;
    setStatus('');
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setStatus('Gary’s website was added to this device.');
      } else {
        setStatus('Install canceled. You can use the manual steps whenever you’re ready.');
      }
    } catch {
      setInstallPrompt(null);
      setStatus('The install prompt was unavailable. Use the manual steps below.');
    }
  }

  return (
    <section className="rounded-panel border border-line bg-card p-6 sm:p-8" aria-labelledby="install-website-heading">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">Website shortcut</p>
      <h2 id="install-website-heading" className="mt-2 font-display text-[clamp(1.8rem,4vw,2.5rem)] uppercase leading-none text-hi">
        Add betwithgary.ai to your home screen
      </h2>
      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-mid">
        This installs the Gary website as a home-screen shortcut that opens at today&apos;s desk. It does not download,
        update, or change the native Gary iOS app, and it does not start an App Store subscription.
      </p>

      {installed ? (
        <p className="mt-6 inline-flex rounded-card border border-win/40 bg-win/10 px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.05em] text-win">
          Website added on this device
        </p>
      ) : installPrompt ? (
        <button
          type="button"
          onClick={() => void requestInstall()}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-card bg-gold px-5 py-3 text-sm font-semibold text-ink shadow-card transition-[transform,opacity] duration-150 hover:-translate-y-px hover:opacity-95 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          Install Gary website
        </button>
      ) : (
        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.05em] text-low">
          Use the steps for your browser below.
        </p>
      )}

      <p aria-live="polite" className="mt-2 min-h-5 text-[13px] text-mid">{status}</p>

      <div className="mt-7 grid gap-4 md:grid-cols-3">
        <article className="rounded-card border border-line bg-ink p-5">
          <h3 className="font-display text-xl uppercase text-hi">iPhone or iPad</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-mid">
            <li>Open this page in Safari.</li>
            <li>Tap Safari&apos;s Share button.</li>
            <li>Choose Add to Home Screen, then tap Add.</li>
          </ol>
        </article>
        <article className="rounded-card border border-line bg-ink p-5">
          <h3 className="font-display text-xl uppercase text-hi">Android</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-mid">
            <li>Open this page in Chrome.</li>
            <li>Open the three-dot menu.</li>
            <li>Choose Install app or Add to Home screen.</li>
          </ol>
        </article>
        <article className="rounded-card border border-line bg-ink p-5">
          <h3 className="font-display text-xl uppercase text-hi">Desktop</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-mid">
            <li>Open this page in Chrome or Edge.</li>
            <li>Select the install icon in the address bar.</li>
            <li>Confirm Install.</li>
          </ol>
        </article>
      </div>

      <p className="mt-7 text-[13.5px] leading-relaxed text-low">
        Looking for the separate native app? See{' '}
        <Link href="/app" className="text-gold underline decoration-gold/40 underline-offset-4 hover:text-gold-light">
          Gary for iOS
        </Link>.
      </p>
    </section>
  );
}
