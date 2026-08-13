import { useCallback } from "react";
import {
  AuthProvider as ReactAuthProvider,
  type AuthProviderProps,
} from "react-oidc-context";

type MechProRuntimeConfig = {
  authority?: string;
  clientId?: string;
};

declare global {
  interface Window {
    __MECHPRO_CONFIG__?: MechProRuntimeConfig;
  }
}

const runtimeConfig =
  typeof window !== "undefined" ? window.__MECHPRO_CONFIG__ ?? {} : {};

const AUTH_CONFIG: AuthProviderProps = {
  authority:
    import.meta.env.VITE_HERCULES_OIDC_AUTHORITY ??
    runtimeConfig.authority ??
    "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_aswtM0JRr",
  client_id:
    import.meta.env.VITE_HERCULES_OIDC_CLIENT_ID ??
    runtimeConfig.clientId ??
    "21huacbek0pvqfkbbf16a2j6r9",
  redirect_uri: `${window.location.origin}/auth/callback`,
  response_type: "code",
  scope: "openid profile email",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isSecureOrigin =
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.isSecureContext;

  if (!isSecureOrigin) {
    return null;
  }

  const onSigninCallback = useCallback(() => {
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);
  const onSignoutCallback = useCallback(() => {
    window.location.pathname = "";
  }, []);

  return (
    <ReactAuthProvider
      {...AUTH_CONFIG}
      onSigninCallback={onSigninCallback}
      onSignoutCallback={onSignoutCallback}
    >
      {children}
    </ReactAuthProvider>
  );
}
