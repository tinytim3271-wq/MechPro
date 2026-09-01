# MechPro

Shop operating system for independent auto shops — repair orders, employees, payroll, OBD scans, and authorized key programming.

## Stack

- **Frontend:** React 19 + Vite + Tailwind CSS + shadcn/ui (PWA)
- **Production backend:** AWS (Aurora Postgres, Cognito, Lambda, API Gateway, S3)
- **AI:** AWS Bedrock (Claude + Amazon Nova Lite)
- **Local/dev optional:** Convex can still run for function-level development; **production data and APIs are AWS**

Capacitor / Electron scripts exist in `package.json` for packaging. Treat `src/`, `convex/`, and `aws/` as source of truth.

## Shop OS modules

| Area | What you get |
| --- | --- |
| Shop | Customers, vehicles, ROs/estimates/invoices, inspections (templates), parts/POs/vendors, expenses, schedule, payments (Stripe) |
| Employees | Roster, roles, timeclock + GPS (existing) plus pay-rate / W-2 vs 1099 profile fields |
| Payroll | Generate a pay run from clocked hours, pay-stub PDF, W-2 / 1099 year-end, YTD, advances/loans |
| OBD bay | DTCs, freeze frame, live data, readiness, VIN, confirmed clear-codes. Simulator when no adapter; ELM327/STN via Web Serial; J2534 is Windows-native and not available in the browser |
| Key programming | Add/program/test keys only when the customer signed the RO. Simulator when no licensed programmer. No immobilizer bypass or cloning |
| AI | Symptom/DTC interpretation stays on **AI Tools** — complementary to the live OBD bay |

QuickBooks remains a CSV/export dialog (not a live QBO sync). SMS uses the existing Twilio fields on the org.

Payroll tax math is a **small-shop estimate** (federal brackets, SS/Medicare, optional state rate). It is not a substitute for a CPA or a full payroll processor.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm exec convex codegen   # optional, for Convex types

# Terminal 1 — Convex backend (dev only)
bash scripts/convex-dev.sh

# Terminal 2 — frontend
cp .env.example .env   # fill in VITE_* values
pnpm dev
```

To exercise the **AWS** runtime locally (Postgres + ported Convex functions):

```bash
cd aws
npm install
npm run db:up          # docker Postgres on localhost:55433
npm run db:schema      # apply aws/db/schema.sql
npm test
```

Point the SPA at Lambda/API Gateway with `VITE_USE_AWS=true` and `VITE_CONVEX_URL` = the API URL (see `.env.example`). The client already polls `POST /api` (`AwsConvexClient`).

## Tests

```bash
pnpm test              # payroll calc, RO/invoice math, OBD session, key authorization
pnpm test:convex       # Convex/function tests including payroll generate + key-job auth
pnpm test:aws          # AWS runtime (needs local Postgres from db:up)
pnpm build             # frontend production build
```

## Environment variables

See [`.env.example`](.env.example) for frontend vars and [`aws/env.example`](aws/env.example) for Lambda/runtime secrets. **Never commit secrets.** Production secrets live in AWS Secrets Manager.

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
psql "$DATABASE_URL" -f aws/db/schema.sql
```

Existing Aurora databases that already have `schema.sql` applied should run the additive migration instead:

```bash
psql "$DATABASE_URL" -f aws/db/migrate/002_shop_os.sql
```

Whenever `aws/db/schema.sql` changes, regenerate the runtime catalogs from a live Postgres:

```bash
cd aws
npm run db:schema
# then:
docker exec mechpro-pg psql -U postgres -d mechpro -t -A -f /tmp/introspect.sql > db/schema.json
# copy introspect.sql in if needed, or run aws/db/introspect.sql and introspect-indexes.sql
```

Update Secrets Manager values (replace `REPLACE_ME` for Stripe, SES, VAPID).

Enable Bedrock model access in AWS Console for the models listed in `aws/env.example`.

CDK provisions: VPC, Aurora Serverless v2 (Postgres), Cognito, S3 uploads (+ optional SPA bucket/CloudFront), Secrets Manager, HTTP API Lambda (`POST /api`, Stripe webhook), EventBridge drainer. New shop-OS data is additional Aurora tables consumed by the same Lambda — no extra stack constructs required.

Hardware (OBD adapter, key programmer) stays at the bay. Scan sessions and authorized key jobs sync to Aurora through `POST /api`.

## PWA icons

```bash
pnpm generate:icons
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
