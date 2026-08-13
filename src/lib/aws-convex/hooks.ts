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

type PaginationOptions = {
  initialNumItems: number;
};

type PaginatedQueryResult<T> = {
  results: T[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  isLoading: boolean;
  loadMore: (numItems: number) => void;
};

type PageItem<ReturnType> =
  ReturnType extends { page: Array<infer Item> }
    ? Item
    : ReturnType extends Array<infer Item>
      ? Item
      : never;

export function usePaginatedQuery<
  Query extends FunctionReference<"query", "public", any, any>,
>(
  query: Query,
  args: Query["_args"],
  options: PaginationOptions,
): PaginatedQueryResult<PageItem<Query["_returnType"]>> {
  const { client, isLoading: authLoading } = useAwsConvex();
  const argsKey = stableArgsKey(args);
  const initialNumItems = Math.max(1, options.initialNumItems);

  const [results, setResults] = useState<Array<PageItem<Query["_returnType"]>>>([]);
  const [status, setStatus] = useState<PaginatedQueryResult<PageItem<Query["_returnType"]>>["status"]>("LoadingFirstPage");
  const [targetCount, setTargetCount] = useState(initialNumItems);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    setResults([]);
    setStatus("LoadingFirstPage");
    setTargetCount(initialNumItems);
    setCursor(null);
    setIsDone(false);
  }, [query, argsKey, initialNumItems]);

  useEffect(() => {
    if (authLoading || isDone || results.length >= targetCount) return;

    let cancelled = false;
    const run = async () => {
      setStatus(results.length === 0 ? "LoadingFirstPage" : "LoadingMore");

      try {
        const remaining = Math.max(1, targetCount - results.length);
        const value = await client.call<any>(query, {
          ...(args as Record<string, unknown>),
          paginationOpts: {
            numItems: remaining,
            cursor,
          },
        });

        if (cancelled) return;

        if (Array.isArray(value)) {
          setResults(value as Array<PageItem<Query["_returnType"]>>);
          setIsDone(true);
          setStatus("Exhausted");
          return;
        }

        const page = Array.isArray(value?.page) ? value.page : [];
        const nextCursor =
          typeof value?.continueCursor === "string" && value.continueCursor.length > 0
            ? value.continueCursor
            : null;
        const done = Boolean(value?.isDone) || !nextCursor || page.length === 0;

        setResults((prev) => [...prev, ...(page as Array<PageItem<Query["_returnType"]>>)]);
        setCursor(nextCursor);
        setIsDone(done);
        setStatus(done ? "Exhausted" : "CanLoadMore");
      } catch (err) {
        console.error("aws usePaginatedQuery failed", err);
        setStatus(results.length === 0 ? "Exhausted" : "CanLoadMore");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isDone, targetCount, results.length, client, query, args, cursor]);

  const loadMore = useCallback((numItems: number) => {
    const normalized = Math.max(1, numItems);
    setTargetCount((current) => current + normalized);
  }, []);

  return {
    results,
    status,
    isLoading: status === "LoadingFirstPage" || status === "LoadingMore",
    loadMore,
  };
}
