import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { AwsBackendClient } from "./client.ts";

type AuthBridge = {
  isLoading: boolean;
  isAuthenticated: boolean;
  fetchAccessToken: (args: { forceRefreshToken: boolean }) => Promise<string | null>;
};

type AwsConvexContextValue = {
  client: AwsBackendClient;
  isLoading: boolean;
  isAuthenticated: boolean;
};

const AwsConvexContext = createContext<AwsConvexContextValue | null>(null);

export function AwsConvexProviderWithAuth({
  baseUrl,
  useAuth,
  children,
}: {
  baseUrl: string;
  useAuth: () => AuthBridge;
  children: ReactNode;
}) {
  const auth = useAuth();

  const getToken = useCallback(
    () => auth.fetchAccessToken({ forceRefreshToken: false }),
    [auth],
  );

  const client = useMemo(
    () => new AwsBackendClient(baseUrl, getToken),
    [baseUrl, getToken],
  );

  const value = useMemo(
    () => ({
      client,
      isLoading: auth.isLoading,
      isAuthenticated: auth.isAuthenticated,
    }),
    [client, auth.isLoading, auth.isAuthenticated],
  );

  return (
    <AwsConvexContext.Provider value={value}>{children}</AwsConvexContext.Provider>
  );
}

export function useAwsConvex(): AwsConvexContextValue {
  const ctx = useContext(AwsConvexContext);
  if (!ctx) {
    throw new Error("useAwsConvex must be used within AwsConvexProviderWithAuth");
  }
  return ctx;
}

export function useConvexAuth() {
  const { isLoading, isAuthenticated } = useAwsConvex();
  return { isLoading, isAuthenticated };
}

export function Authenticated({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAwsConvex();
  if (isLoading || !isAuthenticated) return null;
  return <>{children}</>;
}

export function Unauthenticated({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAwsConvex();
  if (isLoading || isAuthenticated) return null;
  return <>{children}</>;
}

export function AuthLoading({ children }: { children: ReactNode }) {
  const { isLoading } = useAwsConvex();
  if (!isLoading) return null;
  return <>{children}</>;
}
