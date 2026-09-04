export const READING_INTERVAL_MS = 5_000;

/** A continuous, foreground view of actual reasoning; a route load is insufficient. */
export function observeReading(element: Element, onRead: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  let visible = false;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const update = () => {
    if (!visible || document.visibilityState !== 'visible') {
      // A later foreground view may belong to a new session. The event writer
      // deduplicates repeated reads of this game within the same session.
      finished = false;
      stopTimer();
      return;
    }
    if (finished) return;
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      const rect = element.getBoundingClientRect();
      const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      if (document.visibilityState !== 'visible' || visibleHeight < 32 || element.getClientRects().length === 0) return;
      finished = true;
      onRead();
    }, READING_INTERVAL_MS);
  };
  const observer = new IntersectionObserver(entries => {
    const entry = entries.find(item => item.target === element);
    if (!entry) return;
    visible = entry.isIntersecting && entry.intersectionRect.height >= 32;
    update();
  }, { threshold: [0, 0.1, 0.5, 1] });
  observer.observe(element);
  document.addEventListener('visibilitychange', update);
  return () => {
    stopTimer();
    observer.disconnect();
    document.removeEventListener('visibilitychange', update);
  };
}
