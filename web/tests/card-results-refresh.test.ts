import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardResults } from "@/components/picks/grade";
const harness = vi.hoisted(() => ({
  state: null as CardResults | null,
  effect: undefined as undefined | (() => void | (() => void)),
}));
vi.mock("react", () => ({
  useState: () => [
    harness.state,
    (next: CardResults | null) => {
      harness.state = next;
    },
  ],
  useEffect: (effect: () => void | (() => void)) => {
    harness.effect = effect;
  },
}));
import { useCardResults } from "@/components/picks/use-card-results";
let cleanup: void | (() => void);
beforeEach(() => {
  vi.useFakeTimers();
  harness.state = null;
  vi.stubGlobal("document", { visibilityState: "visible" });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("settlement refresh lifecycle", () => {
  it("keeps the successful same-date snapshot through a later 503", async () => {
    const date = "2026-09-06";
    const snapshot = { date, games: [], props: [], slate: [], live: [] };
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(snapshot))
      .mockResolvedValue(new Response("", { status: 503 }));
    useCardResults(date);
    cleanup = harness.effect?.();
    await vi.advanceTimersByTimeAsync(1);
    expect(useCardResults(date)).toEqual(snapshot);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(useCardResults(date)).toEqual(snapshot);
  });
  it("hides another date after a failed navigation refresh", async () => {
    harness.state = {
      date: "2026-09-05",
      games: [],
      props: [],
      slate: [],
      live: [],
    };
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    expect(useCardResults("2026-09-04")).toBeNull();
    cleanup = harness.effect?.();
    await vi.advanceTimersByTimeAsync(1);
    expect(useCardResults("2026-09-04")).toBeNull();
  });
});
