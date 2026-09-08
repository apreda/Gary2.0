"use client";
import { useEffect, useState } from "react";
import type { CardResults } from "./grade";
const cache = new Map<
  string,
  { at: number; value: Promise<CardResults | null> }
>();
function read(date: string) {
  const previous = cache.get(date);
  if (previous && Date.now() - previous.at < 30_000) return previous.value;
  const value = fetch(`/api/card-results?date=${encodeURIComponent(date)}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null) as Promise<CardResults | null>;
  if (cache.size > 14) cache.delete(cache.keys().next().value!);
  cache.set(date, { at: Date.now(), value });
  return value;
}
export function useCardResults(date?: string) {
  const [state, setState] = useState<CardResults | null>(null);
  useEffect(() => {
    if (!date) return;
    let alive = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      void read(date).then((data) => {
        if (alive && data) setState(data);
      });
    };
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [date]);
  return state?.date === date ? state : null;
}
