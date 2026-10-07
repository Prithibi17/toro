type CacheEntry = { data?: unknown; promise?: Promise<unknown>; expires: number };
const cache = new Map<string, CacheEntry>();

export async function cachedJson<T>(url: string, ttl = 30_000): Promise<T> {
  const now = Date.now();
  const current = cache.get(url);
  if (current?.data !== undefined && current.expires > now)
    return current.data as T;
  if (current?.promise) return current.promise as Promise<T>;
  const promise = fetch(url)
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed");
      cache.set(url, { data, expires: Date.now() + ttl });
      return data as T;
    })
    .catch((error) => {
      cache.delete(url);
      throw error;
    });
  cache.set(url, { promise, expires: now + ttl });
  return promise;
}

export function invalidateClientCache(prefix: string) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}
