import { useCallback } from "react";
import {
  AuthProvider as ReactAuthProvider,
  type AuthProviderProps,
} from "react-oidc-context";

type MechProRuntimeConfig = {
  authority?: string;
  clientId?: string;
  cognitoDomain?: string;
};

declare global {
  interface Window {
    __MECHPRO_CONFIG__?: MechProRuntimeConfig;
  }
}

const runtimeConfig =
  typeof window !== "undefined" ? window.__MECHPRO_CONFIG__ ?? {} : {};

const issuer =
  import.meta.env.VITE_HERCULES_OIDC_AUTHORITY ??
  runtimeConfig.authority ??
  "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_aswtM0JRr";

const cognitoDomain =
  import.meta.env.VITE_HERCULES_OIDC_DOMAIN ??
  runtimeConfig.cognitoDomain ??
  "https://mechproauth001018341557.auth.us-east-1.amazoncognito.com";

const normalizedCognitoDomain = cognitoDomain.replace(/\/+$/, "");
const normalizedIssuer = issuer.replace(/\/+$/, "");

const AUTH_CONFIG: AuthProviderProps = {
  authority: issuer,
  client_id:
    import.meta.env.VITE_HERCULES_OIDC_CLIENT_ID ??
    runtimeConfig.clientId ??
    "21huacbek0pvqfkbbf16a2j6r9",
  redirect_uri: `${window.location.origin}/auth/callback`,
  response_type: "code",
  scope: "openid profile email",
  metadata: {
    issuer: normalizedIssuer,
    jwks_uri: `${normalizedIssuer}/.well-known/jwks.json`,
    authorization_endpoint: `${normalizedCognitoDomain}/oauth2/authorize`,
    token_endpoint: `${normalizedCognitoDomain}/oauth2/token`,
    userinfo_endpoint: `${normalizedCognitoDomain}/oauth2/userInfo`,
    end_session_endpoint: `${normalizedCognitoDomain}/logout`,
    revocation_endpoint: `${normalizedCognitoDomain}/oauth2/revoke`,
  },
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
