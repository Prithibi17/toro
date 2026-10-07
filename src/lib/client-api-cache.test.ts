import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedJson, invalidateClientCache } from "./client-api-cache";

afterEach(() => {
  invalidateClientCache("/");
  vi.unstubAllGlobals();
});

describe("client request cache", () => {
  it("shares concurrent requests and reuses successful results", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ value: 1 }));
    vi.stubGlobal("fetch", fetcher);
    await Promise.all([cachedJson("/test"), cachedJson("/test")]);
    expect(await cachedJson("/test")).toEqual({ value: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not restore stale data after invalidation during a request", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(Response.json({ value: "new" })));
    const old = cachedJson("/test");
    invalidateClientCache("/test");
    await cachedJson("/test");
    finish(Response.json({ value: "old" }));
    await old;
    expect(await cachedJson("/test")).toEqual({ value: "new" });
  });
});
