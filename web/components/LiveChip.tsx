'use client';

import { useEffect, useState } from 'react';
import type { LiveScoreRow } from '@/lib/gary/types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function useLiveScores(date: string) {
  const [scores, setScores] = useState<LiveScoreRow[]>([]);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/live_scores?select=*&date=eq.${date}`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
        );
        if (res.ok && alive) setScores(await res.json());
      } catch { /* keep last */ }
    }
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [date]);
  return scores;
}

export function LiveChip({ score }: { score: LiveScoreRow }) {
  const isLive = score.status === 'live';
  const isFinal = score.status === 'final';
  if (!isLive && !isFinal) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-chip px-2 py-1 font-mono text-[11px]">
      {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-win" />}
      <span className={isLive ? 'text-white/90' : 'text-white/55'}>
        {score.away_abbr} {score.away_score} · {score.home_abbr} {score.home_score}
      </span>
      <span className="text-white/55">{score.detail}</span>
    </span>
  );
}

/** Client wrapper: renders live chips for a set of league codes. */
export function LiveScoreStrip({ date, leagues }: { date: string; leagues?: string[] }) {
  const scores = useLiveScores(date);
  const filtered = leagues?.length
    ? scores.filter(s => leagues.includes((s.league ?? '').toUpperCase()))
    : scores;
  const active = filtered.filter(s => s.status === 'live' || s.status === 'final');
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {active.map(s => <LiveChip key={`${s.game_id}`} score={s} />)}
    </div>
  );
}
