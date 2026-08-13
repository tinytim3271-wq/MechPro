/**
 * AWS HTTP-backed drop-in replacement for ConvexReactClient.
 *
 * Routes all queries, mutations, and actions through the Lambda HTTP API
 * at `POST /api` with body `{ path, args }`. Query results are polled and
 * cached locally; subscribers are notified on each poll cycle.
 */

import { getFunctionName } from "convex/server";

type FunctionReference = Parameters<typeof getFunctionName>[0];

type Listener = () => void;

type CachedQuery = {
  result: unknown;
  error: unknown;
  listeners: Set<Listener>;
  timer: ReturnType<typeof setInterval> | null;
};

const POLL_INTERVAL_MS = 4_000;

export class AwsConvexClient {
  private readonly url: string;
  private token: string | null = null;
  private fetchToken: (() => Promise<string | null>) | null = null;
  private authChangeCallback: ((isAuthenticated: boolean) => void) | null = null;
  private cache = new Map<string, CachedQuery>();

  constructor(apiBaseUrl: string) {
    // Normalize: strip trailing slash, ensure no trailing /api
    this.url = apiBaseUrl.replace(/\/+$/, "").replace(/\/api$/, "");
  }

  // ─── Auth (called by ConvexProviderWithAuth) ─────────────────────────────

  setAuth(
    fetchToken: (args: { forceRefreshToken: boolean }) => Promise<string | null>,
    onChange?: (isAuthenticated: boolean) => void,
  ) {
    this.fetchToken = () => fetchToken({ forceRefreshToken: false });
    this.authChangeCallback = onChange ?? null;
    // Eagerly fetch the token
    void this.refreshToken();
  }

  clearAuth() {
    this.token = null;
    this.fetchToken = null;
    this.authChangeCallback?.(false);
    // Invalidate cached query results so they re-fetch as anonymous
    for (const entry of this.cache.values()) {
      entry.result = undefined;
      entry.error = undefined;
      entry.listeners.forEach((l) => l());
    }
  }

  private async refreshToken(): Promise<string | null> {
    if (!this.fetchToken) return null;
    try {
      const t = await this.fetchToken();
      const changed = t !== this.token;
      this.token = t;
      if (changed) {
        this.authChangeCallback?.(!!t);
        // Refresh all subscriptions with new token
        for (const [key, entry] of this.cache.entries()) {
          void this.fetchAndNotify(key, entry);
        }
      }
      return t;
    } catch {
      return null;
    }
  }

  // ─── HTTP helper ─────────────────────────────────────────────────────────

  private async post(path: string, args: Record<string, unknown>): Promise<unknown> {
    const token = this.token ?? (await this.refreshToken());
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers["authorization"] = `Bearer ${token}`;

    const res = await fetch(`${this.url}/api`, {
      method: "POST",
      headers,
      body: JSON.stringify({ path, args }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as Record<string, unknown>;
      const msg = (err.error as string | undefined) ?? `HTTP ${res.status}`;
      const code = (err.code as string | undefined) ?? "ERROR";
      const error = Object.assign(new Error(msg), { code });
      throw error;
    }

    const json = await res.json() as { value: unknown };
    return json.value;
  }

  // ─── Mutation / Action ───────────────────────────────────────────────────

  mutation(fn: FunctionReference, args?: Record<string, unknown>, _options?: unknown): Promise<unknown> {
    const name = getFunctionName(fn);
    return this.post(name, args ?? {});
  }

  action(fn: FunctionReference, args?: Record<string, unknown>, _options?: unknown): Promise<unknown> {
    const name = getFunctionName(fn);
    return this.post(name, args ?? {});
  }

  // ─── Query subscriptions (watchQuery) ───────────────────────────────────

  watchQuery(fn: FunctionReference, args?: Record<string, unknown>) {
    const name = getFunctionName(fn);
    const cacheKey = `${name}::${JSON.stringify(args ?? {})}`;

    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, {
        result: undefined,
        error: undefined,
        listeners: new Set(),
        timer: null,
      });
    }
    const entry = this.cache.get(cacheKey)!;

    return {
      onUpdate: (callback: Listener) => {
        entry.listeners.add(callback);

        // Start polling if this is the first subscriber
        if (entry.listeners.size === 1 && entry.timer === null) {
          // Immediate first fetch
          void this.fetchAndNotify(cacheKey, entry, args ?? {}, name);
          entry.timer = setInterval(() => {
            void this.fetchAndNotify(cacheKey, entry, args ?? {}, name);
          }, POLL_INTERVAL_MS);
        } else if (entry.result !== undefined || entry.error !== undefined) {
          // Already have data — notify immediately
          setTimeout(callback, 0);
        }

        return () => {
          entry.listeners.delete(callback);
          if (entry.listeners.size === 0 && entry.timer !== null) {
            clearInterval(entry.timer);
            entry.timer = null;
            this.cache.delete(cacheKey);
          }
        };
      },
      localQueryResult: () => entry.result,
      localQueryLogs: () => undefined,
      journal: () => undefined,
    };
  }

  private async fetchAndNotify(
    cacheKey: string,
    entry: CachedQuery,
    args: Record<string, unknown> = {},
    name?: string,
  ) {
    if (!name) {
      const colonIdx = cacheKey.indexOf("::");
      name = colonIdx >= 0 ? cacheKey.slice(0, colonIdx) : cacheKey;
      try { args = JSON.parse(cacheKey.slice(colonIdx + 2)) as Record<string, unknown>; } catch { args = {}; }
    }
    try {
      const result = await this.post(name!, args ?? {});
      const changed = JSON.stringify(result) !== JSON.stringify(entry.result);
      entry.result = result;
      entry.error = undefined;
      if (changed || entry.result === undefined) {
        entry.listeners.forEach((l) => l());
      }
    } catch (err) {
      entry.error = err;
      entry.result = undefined;
      entry.listeners.forEach((l) => l());
    }
  }

  // ─── One-shot query ──────────────────────────────────────────────────────

  query(fn: FunctionReference, args?: Record<string, unknown>): Promise<unknown> {
    const name = getFunctionName(fn);
    return this.post(name, args ?? {});
  }

  // ─── Compat stubs expected by ConvexProviderWithAuth ─────────────────────

  watchPaginatedQuery(fn: FunctionReference, args?: Record<string, unknown>) {
    // Delegate to watchQuery for simplicity — paginated queries not heavily used
    return this.watchQuery(fn, args);
  }

  connectionState() {
    return { isWebSocketConnected: true, hasInflightRequests: false };
  }

  close() {
    for (const entry of this.cache.values()) {
      if (entry.timer !== null) {
        clearInterval(entry.timer);
        entry.timer = null;
      }
    }
    this.cache.clear();
  }
}
