import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/gary/results", () => ({
  fetchGameResultsForDate: vi.fn(),
  fetchPropResultsForDate: vi.fn(),
}));
vi.mock("@/lib/gary/board", () => ({ fetchDailySlate: vi.fn() }));
vi.mock("@/lib/gary/supabase", () => ({ rest: vi.fn() }));
import { GET } from "@/app/api/card-results/route";
import {
  fetchGameResultsForDate,
  fetchPropResultsForDate,
} from "@/lib/gary/results";
import { fetchDailySlate } from "@/lib/gary/board";
import { rest } from "@/lib/gary/supabase";
beforeEach(() => {
  vi.resetAllMocks();
  for (const fn of [
    fetchGameResultsForDate,
    fetchPropResultsForDate,
    fetchDailySlate,
    rest,
  ])
    vi.mocked(fn).mockResolvedValue([]);
});
describe("public native card results", () => {
  it.each(["2026-02-30", "2026-09-08&select=*", "no-date"])(
    "rejects malformed date %s before any database call",
    async (date) => {
      const response = await GET(
        new Request(
          `https://www.betwithgary.ai/api/card-results?date=${encodeURIComponent(date)}`,
        ),
      );
      expect(response.status).toBe(400);
      expect(rest).not.toHaveBeenCalled();
      expect(fetchDailySlate).not.toHaveBeenCalled();
    },
  );
  it("returns public same-date sources with a short shared cache", async () => {
    const response = await GET(
      new Request(
        "https://www.betwithgary.ai/api/card-results?date=2026-09-08",
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      date: "2026-09-08",
      games: [],
      props: [],
      slate: [],
      live: [],
    });
    expect(fetchDailySlate).toHaveBeenCalledWith("2026-09-08", 60);
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");
  });
  it("fails without publishing an empty successful ledger or private errors", async () => {
    vi.mocked(rest).mockRejectedValue(new Error("private upstream detail"));
    const response = await GET(
      new Request(
        "https://www.betwithgary.ai/api/card-results?date=2026-09-08",
      ),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("private upstream detail");
  });
});
