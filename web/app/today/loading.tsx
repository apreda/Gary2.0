export default function TodayLoading() {
  return (
    <main className="mx-auto max-w-6xl px-5 pb-20 pt-12" aria-label="Loading today's desk">
      <div className="h-8 w-40 animate-pulse rounded bg-white/5" />
      <div className="mt-3 h-5 w-full max-w-2xl animate-pulse rounded bg-white/5" />
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map(item => (
          <div key={item} className="h-24 animate-pulse rounded-card border border-line bg-card" />
        ))}
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <div className="h-72 animate-pulse rounded-card border border-line bg-card" />
        <div className="h-72 animate-pulse rounded-card border border-line bg-card" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-panel border border-line bg-card" />
        <div className="h-64 animate-pulse rounded-panel border border-line bg-card" />
      </div>
    </main>
  );
}
