import { useCallback, useEffect, useRef, useState } from "react";
import type { FunctionReference } from "convex/server";
import { useAwsConvex } from "./provider.tsx";

/** "skip" freezes the query the same way Convex does. */
export type Skip = "skip";

const DEFAULT_POLL_MS = 3_000;

function stableArgsKey(args: unknown): string {
  try {
    return JSON.stringify(args ?? {});
  } catch {
    return String(args);
  }
}

/**
 * Polling stand-in for Convex's reactive useQuery.
 * Live screens (bay board, messages, GPS) refresh every few seconds.
 */
export function useQuery<Query extends FunctionReference<"query", "public", any, any>>(
  query: Query,
  ...argsOrSkip: [args?: Query["_args"] | Skip] | [Skip]
): Query["_returnType"] | undefined {
  const { client, isAuthenticated, isLoading: authLoading } = useAwsConvex();
  const raw = argsOrSkip[0];
  const skipped = raw === "skip";
  const args = (skipped ? {} : ((raw ?? {}) as Record<string, unknown>));
  const argsKey = skipped ? "skip" : stableArgsKey(args);

  const [data, setData] = useState<Query["_returnType"] | undefined>(undefined);
  const requestId = useRef(0);

  useEffect(() => {
    if (skipped || authLoading) return;

    let cancelled = false;
    const myId = ++requestId.current;

    const run = async () => {
      try {
        const value = await client.call<Query["_returnType"]>(query, args);
        if (!cancelled && myId === requestId.current) setData(value);
      } catch (err) {
        // Unauthenticated public queries still run; auth failures clear data.
        const status = (err as { status?: number }).status;
        if (status === 401 && !isAuthenticated) {
          if (!cancelled) setData(undefined);
          return;
        }
        console.error("aws useQuery failed", err);
      }
    };

    void run();
    const handle = window.setInterval(() => void run(), DEFAULT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- argsKey captures args
  }, [client, query, argsKey, skipped, authLoading, isAuthenticated]);

  return skipped ? undefined : data;
}

export function useMutation<
  Mutation extends FunctionReference<"mutation", "public", any, any>,
>(mutation: Mutation): (args: Mutation["_args"]) => Promise<Mutation["_returnType"]> {
  const { client } = useAwsConvex();
  return useCallback(
    (args: Mutation["_args"]) =>
      client.call<Mutation["_returnType"]>(
        mutation,
        (args ?? {}) as Record<string, unknown>,
      ),
    [client, mutation],
  );
}

export function useAction<Action extends FunctionReference<"action", "public", any, any>>(
  action: Action,
): (args: Action["_args"]) => Promise<Action["_returnType"]> {
  const { client } = useAwsConvex();
  return useCallback(
    (args: Action["_args"]) =>
      client.call<Action["_returnType"]>(action, (args ?? {}) as Record<string, unknown>),
    [client, action],
  );
}

type PaginationPage<T> = {
  page: T[];
  isDone: boolean;
  continueCursor: string;
};

type PaginatedStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

export function usePaginatedQuery<
  Query extends FunctionReference<"query", "public", any, any>,
>(
  query: Query,
  args: Query["_args"] | "skip",
  options: { initialNumItems: number },
) {
  const skipped = args === "skip";
  const baseArgsKey = skipped ? "skip" : stableArgsKey(args);
  const [cursor, setCursor] = useState<string | null>(null);
  const [results, setResults] = useState<unknown[]>([]);
  const [status, setStatus] = useState<PaginatedStatus>(
    skipped ? "Exhausted" : "LoadingFirstPage",
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  useEffect(() => {
    setCursor(null);
    setResults([]);
    setNextCursor(null);
    setStatus(skipped ? "Exhausted" : "LoadingFirstPage");
  }, [query, baseArgsKey, options.initialNumItems, skipped]);

  const queryArgs =
    skipped
      ? ("skip" as const)
      : ({
          ...(args as Record<string, unknown>),
          paginationOpts: { numItems: options.initialNumItems, cursor },
        } as Query["_args"]);

  const page = useQuery(
    query,
    ...(queryArgs === "skip" ? (["skip"] as const) : [queryArgs]),
  );

  useEffect(() => {
    if (skipped || page === undefined) return;
    const result = page as PaginationPage<unknown>;
    const items = Array.isArray(result.page) ? result.page : [];
    setResults((prev) => (cursor === null ? items : [...prev, ...items]));
    setNextCursor(result.isDone ? null : result.continueCursor ?? null);
    setStatus(result.isDone ? "Exhausted" : "CanLoadMore");
  }, [page, cursor, skipped]);

  const loadMore = useCallback(() => {
    if (skipped || !nextCursor || status === "LoadingMore") return;
    setStatus("LoadingMore");
    setCursor(nextCursor);
  }, [skipped, nextCursor, status]);

  return {
    results,
    status: skipped ? ("Exhausted" as const) : page === undefined ? ("LoadingFirstPage" as const) : status,
    loadMore,
  };
}
