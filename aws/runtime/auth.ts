/**
 * ctx.auth — Cognito replacement for Hercules OIDC.
 *
 * Convex builds `tokenIdentifier` as `${issuer}|${subject}`, and 97 call sites
 * look users up by exactly that string. Reproducing the format here means the
 * ported code needs no changes; the migration instead rewrites the stored
 * values once, when Hercules subjects are mapped onto Cognito subjects.
 * See aws/db/migrate/ for that step.
 */

/** Shape of Convex's UserIdentity, limited to the fields the codebase reads. */
export type UserIdentity = {
  tokenIdentifier: string;
  subject: string;
  issuer: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  pictureUrl?: string;
};

export type VerifiedClaims = {
  iss: string;
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  [claim: string]: unknown;
};

/**
 * Verifies a bearer token and returns its claims, or null when the token is
 * absent or invalid. Injected so the runtime can be tested without Cognito and
 * so the verifier (and its JWKS cache) lives for the whole Lambda container.
 */
export type TokenVerifier = (token: string) => Promise<VerifiedClaims | null>;

export function identityFromClaims(claims: VerifiedClaims): UserIdentity {
  return {
    tokenIdentifier: `${claims.iss}|${claims.sub}`,
    subject: claims.sub,
    issuer: claims.iss,
    email: claims.email,
    emailVerified:
      typeof claims.email_verified === "string"
        ? claims.email_verified === "true"
        : claims.email_verified,
    name: claims.name,
    pictureUrl: claims.picture,
  };
}

export class Auth {
  private readonly token: string | null;
  private readonly verify: TokenVerifier;
  private cached?: UserIdentity | null;

  constructor(token: string | null, verify: TokenVerifier) {
    this.token = token;
    this.verify = verify;
  }

  /**
   * Returns null rather than throwing for anonymous or invalid callers, which
   * is what Convex does. Every caller in convex/ already branches on null, and
   * the audit made those branches deny access.
   */
  async getUserIdentity(): Promise<UserIdentity | null> {
    if (this.cached !== undefined) return this.cached;
    if (!this.token) {
      this.cached = null;
      return null;
    }
    try {
      const claims = await this.verify(this.token);
      this.cached = claims ? identityFromClaims(claims) : null;
    } catch {
      // A malformed or expired token is an anonymous caller, not a 500.
      this.cached = null;
    }
    return this.cached;
  }
}

/** Extracts a bearer token from an incoming Authorization header. */
export function bearerToken(headerValue: string | undefined | null): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1] : null;
}
