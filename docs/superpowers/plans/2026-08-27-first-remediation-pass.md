# First Remediation Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce active tenant membership and financial roles, preserve invoice and inventory consistency, and make the AWS compatibility runtime release-safe.

**Architecture:** Add one Convex authorization module that resolves the authenticated user and active membership, then use resource-specific assertions at every audited tenant boundary. Keep inventory consumption on RO line changes only, forbid voiding invoices with posted payments, and make AWS dispatch own both connection cleanup and Convex validator execution.

**Tech Stack:** TypeScript 5.9, Convex 1.26, convex-test 0.0.41, PostgreSQL, Node test runner, Vitest.

## Global Constraints

- Preserve existing public function names and client contracts.
- Return `NOT_FOUND` for foreign-tenant resources to avoid disclosing existence.
- Require active membership for every protected operation.
- Require owner, admin, service writer, or explicit admin access for invoice mutations.
- Do not commit changes unless the user explicitly requests a commit.

---

### Task 1: Shared Authorization Contract

**Files:**
- Create: `convex/authorization.ts`
- Create: `convex/authorization.test.ts`
- Modify: `convex/repairOrders.ts`
- Modify: `convex/invoices.ts`

**Interfaces:**
- Produces: `requireActiveMembership(ctx)` returning `{ user, member, orgId }`.
- Produces: `requireRoles(ctx, roles)` and `assertOrgResource(resource, orgId, label)`.

- [ ] Add an inactive-member regression test using `convexTest(schema, import.meta.glob("./**/*.*s"))`.
- [ ] Run `pnpm exec vitest run convex/authorization.test.ts` and verify the test fails.
- [ ] Implement the shared authorization functions with `ConvexError` codes.
- [ ] Route repair-order and invoice authorization through the shared contract.
- [ ] Rerun the focused test and require it to pass.

### Task 2: Tenant Resource Boundaries

**Files:**
- Modify: `convex/repairOrders.ts`
- Modify: `convex/messages.ts`
- Modify: `convex/roPhotos.ts`
- Modify: `convex/recommendations.ts`
- Modify: `convex/jobTracking.ts`
- Modify: `convex/parts.ts`
- Test: `convex/authorization.test.ts`

**Interfaces:**
- Consumes: `requireActiveMembership`, `requireRoles`, and `assertOrgResource`.
- Produces: server-side checks for every supplied customer, vehicle, location, member, RO, supplier, part, and notification ID.

- [ ] Add cross-tenant tests for RO creation, messaging, photos, recommendations, tracking, and purchase-order parts.
- [ ] Run the focused tests and verify each test fails for the expected missing authorization.
- [ ] Add ownership and assignment checks at each mutation/query boundary.
- [ ] Rerun the focused tests and require all tenant-boundary cases to pass.

### Task 3: Invoice And Inventory Accounting

**Files:**
- Modify: `convex/invoices.ts`
- Modify: `convex/repairOrders.ts`
- Test: `convex/invoices.test.ts`

**Interfaces:**
- Consumes: active financial-role authorization.
- Produces: one inventory-consumption point in `updateROLines` and a void rule rejecting invoices with payments or positive `amountPaid`.

- [ ] Add tests proving invoice creation does not deduct stock twice and paid/partial invoices cannot be voided.
- [ ] Run `pnpm exec vitest run convex/invoices.test.ts` and verify the new tests fail.
- [ ] Remove invoice-time inventory deduction and enforce void/payment status rules.
- [ ] Rerun invoice tests and require them to pass.

### Task 4: AWS Action Connection Lifecycle

**Files:**
- Modify: `aws/runtime/context.ts`
- Test: `aws/runtime/context.test.ts`

**Interfaces:**
- Produces: action execution that releases every borrowed client in a `finally` block for success and failure.

- [ ] Add pool-accounting tests for successful and throwing actions.
- [ ] Run the focused Node test and verify leaked client counts.
- [ ] Wrap action handler execution in cleanup and eliminate invocation-external cleanup requirements.
- [ ] Rerun `node --experimental-strip-types --test --test-name-pattern="action" runtime/context.test.ts` from `aws/`.

### Task 5: AWS Validator Enforcement

**Files:**
- Modify: `aws/runtime/functions.ts`
- Modify: `aws/runtime/context.ts`
- Test: `aws/runtime/context.test.ts`

**Interfaces:**
- Produces: argument and return validation at top-level and nested dispatch boundaries using Convex validator metadata.

- [ ] Add negative tests for missing fields, wrong scalar types, wrong table IDs, extra object fields, and invalid return values.
- [ ] Run the focused tests and verify malformed values reach handlers before implementation.
- [ ] Execute Convex validators before handlers and validate returned values after handlers.
- [ ] Rerun AWS context and ported tests against PostgreSQL.

### Task 6: Final Validation

**Files:**
- Verify all modified files.

- [ ] Run `pnpm run build`.
- [ ] Run focused Convex Vitest suites with explicit module globs.
- [ ] Run all AWS runtime tests against the disposable PostgreSQL cluster.
- [ ] Run `pnpm run test:e2e`.
- [ ] Run `git diff --check` and VS Code diagnostics.