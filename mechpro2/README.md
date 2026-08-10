# MechPro 2.0

An AWS-native rewrite of the MechPro auto-repair shop management system.

MechPro 1.0 runs on Hercules with a Convex backend. 2.0 targets AWS end to end,
keeps every feature, and fixes a set of data-integrity defects that were
structural in the original rather than incidental.

---

## Status

This is a work in progress. What exists today:

| Area | State |
|------|-------|
| Shared domain primitives (money, ids, enums, errors) | Done — 21 tests |
| Postgres schema (33 tables, 22 enums, 135 indexes, 84 FKs) | Done — 29 integration tests |
| Domain services | Not started |
| tRPC API + Lambda | Not started |
| CDK infrastructure | Not started |
| Redesigned web app | Not started |
| Integrations (Stripe, OpenAI, SES, push, Carfax, NHTSA) | Not started |
| Data migration from Convex | Not started |

Nothing is deployed. `mechpro2` currently runs against a local Postgres in
Docker.

---

## Layout

```
mechpro2/
  packages/
    shared/   Domain primitives with no I/O: money, ids, enums, errors
    db/       Drizzle schema, migrations, and the database client
  apps/       (web app — not yet created)
  infra/      (AWS CDK — not yet created)
```

## Getting started

Requires Node 22+, pnpm 11+, and Docker.

```bash
pnpm install
pnpm db:up                 # Postgres on localhost:5433
pnpm db:migrate            # apply migrations
pnpm test                  # run every package's tests
```

The database URL defaults to
`postgres://mechpro:mechpro@localhost:5433/mechpro2`. Override with
`DATABASE_URL`.

---

## What changed, and why

Each of these addresses a defect found while auditing the original. They are
enforced by the database, so no future code path can reintroduce them.

### Money is never a float

The original stored every amount as a double. Multiplying a subtotal by a tax
rate and summing a thousand line items drifts off the exact cent.

2.0 stores money as an integer count of cents in a `bigint` column, and rates as
integer basis points (`825` is 8.25%). All arithmetic goes through a `Money`
module that rounds half away from zero, the convention US invoicing expects.

### Inventory is a ledger, not a counter

The original mutated `part.stock` from three separate call sites. Adding parts
to a repair order deducted stock, and then invoicing that same repair order
deducted it *again* — so every job quietly consumed twice the inventory it
should have. Cancelling restored stock from the current lines, and deleting a
repair order restored nothing at all.

2.0 records every movement as a row in `inventory_movements`, tagged with why it
moved and what caused it. A unique index on
`(part, reason, reference_type, reference_id)` means consuming one repair
order's parts a second time raises a constraint violation instead of silently
halving stock. The `parts.stock_on_hand` column is a cached total written in the
same transaction as the ledger row, and a test asserts the two agree.

### Sequential numbers are allocated, not guessed

Repair order and invoice numbers came from reading the highest existing value
and adding one. Two simultaneous writers get the same number.

2.0 allocates from a per-organization `counters` row with
`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, a single atomic statement that
takes a row lock. A test allocates 50 numbers concurrently and asserts it gets
exactly 1 through 50.

### Payments cannot be double-recorded or exceed the invoice

Stripe delivers webhooks at least once, and the original had no guard against a
replay. 2.0 puts a unique index on the payment intent id, so a replay is a
no-op. `invoices.balance_cents` is a generated column derived from the total and
amount paid, and a check constraint rejects overpayment outright.

### Technician pay is idempotent

Pay records are unique on `(repair order, member)`, so re-running settlement
cannot pay the same labor twice.

### Line items are rows, not JSON

Labor, parts, and fees lived in JSONB arrays on the repair order. That made
"revenue by service" a JSON scan and made a real foreign key to `parts`
impossible — the original stored part ids as loose strings and wrapped every
dereference in try/catch.

2.0 normalizes them into `repair_order_labor_lines`, `repair_order_part_lines`,
and `repair_order_fees`, with proper keys and indexes.

### Secrets are references, not values

The Carfax partner key was stored in the organizations row and returned to every
authenticated browser. 2.0 stores only a Secrets Manager ARN. The dead Twilio
credential columns are gone entirely — nothing ever wrote or read them.

Public link tokens (estimate approval, invoice payment) are stored as SHA-256
hashes, so a database backup cannot be used to approve work or view an invoice.

### Status changes follow a state machine

Any status could previously be set from any other, so an invoiced repair order
could be dragged back to `estimate` and invoiced again. Allowed transitions are
now declared explicitly in `@mechpro/shared`.

### Background work uses a transactional outbox

Convex's scheduler was replaced with an `outbox_jobs` table. Enqueueing happens
inside the caller's transaction, so a job can never fire for work that rolled
back. Workers claim rows with `FOR UPDATE SKIP LOCKED`.

### Everything else

- Timestamps are `timestamptz`, not float epochs.
- Location filtering happens in SQL; the original filtered after pagination,
  which silently skewed page contents.
- Pending invites have a null `user_id` instead of borrowing the inviter's.
- Primary keys are UUIDv7 — random, but time-ordered, so inserts append to the
  index instead of fragmenting it.
- New `audit_log` and `rate_limits` tables; the original had neither, so public
  endpoints were unthrottled and privileged actions left no trace.

---

## Testing

```bash
pnpm test                                    # everything
pnpm --filter @mechpro/shared test           # pure unit tests, no database
pnpm --filter @mechpro/db test               # integration tests, needs Postgres
```

Database tests run serially against a real Postgres because they assert on
constraint behaviour, which cannot be faked.
