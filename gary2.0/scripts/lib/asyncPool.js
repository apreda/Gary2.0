/** Process each item once with bounded concurrent workers. */
export async function runBounded(items, concurrency, worker) {
  if (!Array.isArray(items) || items.length === 0) return;
  const workerCount = Math.max(1, Math.min(Math.trunc(concurrency) || 1, items.length));
  let nextIndex = 0;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      // JavaScript runs this read/increment synchronously before the await, so
      // each worker receives one distinct item without another coordination
      // primitive.
      const item = items[nextIndex++];
      await worker(item);
    }
  }));
}
