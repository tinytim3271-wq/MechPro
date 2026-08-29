# MechPro

Mobile mechanic shop management platform — repair orders, scheduling, invoicing, AI diagnostics, and more.

## Stack

- **Frontend:** React 19 + Vite + Tailwind CSS + shadcn/ui
- **Backend:** AWS (Aurora Postgres, Cognito, Lambda, API Gateway, S3)
- **AI:** AWS Bedrock (Claude 3.5 Sonnet + Amazon Nova Lite)
- **Mobile:** Capacitor (iOS + Android) + PWA install
- **Desktop:** Electron

## Local development

```bash
pnpm install --frozen-lockfile
pnpm exec convex codegen

# Terminal 1 — Convex backend (dev)
bash scripts/convex-dev.sh

# Terminal 2 — frontend
cp .env.example .env   # fill in VITE_* values
pnpm dev
```

For AWS backend local testing:

```bash
cd aws
npm install
npm run db:up
npm run db:schema
npm test
```

## Environment variables

See [`.env.example`](.env.example) for frontend vars and [`aws/env.example`](aws/env.example) for Lambda/runtime secrets.

## Deploy to AWS

```bash
pnpm install --frozen-lockfile
pnpm build
cd aws && npm install && npm run build
npm run cdk:deploy -- -c deploySpa=true -c frontendUrl=https://your-domain.com
```

After first deploy, apply the database schema:

```bash
# Get DATABASE_URL from Secrets Manager, then:
psql $DATABASE_URL -f aws/db/schema.sql
```

Update Secrets Manager values (replace `REPLACE_ME` for Stripe, SES, VAPID).

Enable Bedrock model access in AWS Console for Claude 3.5 Sonnet and Nova Lite in your region.

## PWA icons

```bash
pnpm generate:icons
```

## Mobile apps (Capacitor)

```bash
pnpm build
npx cap add ios      # first time only
npx cap add android  # first time only
pnpm cap:sync
pnpm cap:ios         # or cap:android
```

## Desktop (Electron)

```bash
pnpm electron:dev    # development
pnpm electron:build  # packaged installer
```

## AI provider

Production uses **AWS Bedrock** via Lambda IAM — no API keys required.

For local Convex dev without AWS credentials, set:

```
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

## License

See [LICENSE](../LICENSE).
