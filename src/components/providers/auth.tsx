import { useCallback, useMemo } from "react";
import {
  AuthProvider as ReactAuthProvider,
  type AuthProviderProps,
} from "react-oidc-context";

function getOidcSettings(): AuthProviderProps {
  const runtime = (
    window as Window & {
      __MECHPRO_CONFIG__?: { authority?: string; clientId?: string };
    }
  ).__MECHPRO_CONFIG__;
  const authority =
    import.meta.env.VITE_HERCULES_OIDC_AUTHORITY ?? runtime?.authority;
  const client_id =
    import.meta.env.VITE_HERCULES_OIDC_CLIENT_ID ?? runtime?.clientId;

  return {
    authority: authority ?? "",
    client_id: client_id ?? "",
    redirect_uri: `${window.location.origin}/auth/callback`,
    response_type: "code",
    scope: "openid profile email",
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const oidcConfig = useMemo(() => getOidcSettings(), []);
  const onSigninCallback = useCallback(() => {
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);
  const onSignoutCallback = useCallback(() => {
    window.location.pathname = "";
  }, []);

  return (
    <ReactAuthProvider
      {...oidcConfig}
      onSigninCallback={onSigninCallback}
      onSignoutCallback={onSignoutCallback}
    >
      {children}
    </ReactAuthProvider>
  );
}
