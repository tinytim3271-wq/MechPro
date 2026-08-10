-- Identity cutover: Hercules OIDC subjects → Cognito subjects.
--
-- Convex (and the AWS runtime) store users.tokenIdentifier as
--   {issuer}|{subject}
-- After Cognito is live, rewrite each row using a staging map that you fill
-- with the Hercules subject → Cognito sub pairing (email match is the usual
-- join key when exporting from both IdPs).
--
-- 1. Export Hercules users (subject, email).
-- 2. Create Cognito users (or import) and capture (sub, email).
-- 3. Load the map, then run the UPDATE below inside a transaction.

BEGIN;

CREATE TABLE IF NOT EXISTS "_identityMap" (
  "herculesTokenIdentifier" TEXT PRIMARY KEY,
  "cognitoTokenIdentifier"  TEXT NOT NULL UNIQUE,
  "email"                   TEXT
);

-- Example seed (replace with real values before cutover):
-- INSERT INTO "_identityMap" ("herculesTokenIdentifier","cognitoTokenIdentifier","email")
-- VALUES (
--   'https://auth.hercules.app|hercules-sub-123',
--   'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXX|cognito-sub-abc',
--   'owner@shop.com'
-- );

UPDATE "users" AS u
SET "tokenIdentifier" = m."cognitoTokenIdentifier"
FROM "_identityMap" AS m
WHERE u."tokenIdentifier" = m."herculesTokenIdentifier";

-- Sanity: every active staff user should now point at Cognito.
-- SELECT count(*) FROM "users" WHERE "tokenIdentifier" NOT LIKE '%cognito-idp%';

COMMIT;
