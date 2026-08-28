/**
 * Cognito access/ID token verification via JWKS.
 *
 * Produces VerifiedClaims for runtime/auth.ts so tokenIdentifier stays
 * `${issuer}|${subject}` — the format 97 call sites already depend on.
 */
import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { TokenVerifier, VerifiedClaims } from "./auth.ts";

export type CognitoVerifierConfig = {
  issuer: string;
  clientId: string;
};

/** Parses `https://cognito-idp.{region}.amazonaws.com/{userPoolId}`. */
export function parseCognitoIssuer(issuer: string): { userPoolId: string; region: string } {
  const match = /^https:\/\/cognito-idp\.([a-z0-9-]+)\.amazonaws\.com\/([a-zA-Z0-9_-]+)$/.exec(
    issuer.replace(/\/$/, ""),
  );
  if (!match) {
    throw new Error(`COGNITO_ISSUER is not a Cognito issuer URL: ${issuer}`);
  }
  return { region: match[1], userPoolId: match[2] };
}

/**
 * Builds a TokenVerifier that caches JWKS for the Lambda container lifetime.
 * Accepts either access or id tokens from the SPA's Cognito app client.
 */
export function createCognitoTokenVerifier(config: CognitoVerifierConfig): TokenVerifier {
  const { userPoolId } = parseCognitoIssuer(config.issuer);

  const accessVerifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: "access",
    clientId: config.clientId,
  });
  const idVerifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: "id",
    clientId: config.clientId,
  });

  return async (token: string): Promise<VerifiedClaims | null> => {
    try {
      const payload = await accessVerifier.verify(token);
      return claimsFromPayload(payload as unknown as Record<string, unknown>);
    } catch {
      // SPA may send the ID token (email/name claims live there).
    }
    try {
      const payload = await idVerifier.verify(token);
      return claimsFromPayload(payload as unknown as Record<string, unknown>);
    } catch {
      return null;
    }
  };
}

function claimsFromPayload(payload: Record<string, unknown>): VerifiedClaims {
  const iss = String(payload.iss ?? "");
  const sub = String(payload.sub ?? "");
  if (!iss || !sub) throw new Error("Token missing iss/sub");
  return {
    iss,
    sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    email_verified: payload.email_verified as boolean | string | undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
    ...payload,
  };
}
