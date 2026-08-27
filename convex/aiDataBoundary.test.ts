import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Id } from "./_generated/dataModel.d.ts";
import { redactExternalAiText } from "./aiDataBoundary";
import schema from "./schema";

const recordExternalAiAudit = makeFunctionReference<
  "mutation",
  { operation: string; retentionDays: number },
  null
>("aiPolicy:recordExternalAiAudit");

const recordSystemExternalAiAudit = makeFunctionReference<
  "mutation",
  { orgId: Id<"organizations">; operation: string },
  null
>("aiPolicy:recordSystemExternalAiAudit");

const deleteExternalAiAudit = makeFunctionReference<
  "mutation",
  { auditId: Id<"externalAiAuditEvents"> },
  null
>("aiPolicy:deleteExternalAiAudit");

afterEach(() => vi.useRealTimers());

describe("external AI redaction", () => {
  test("redacts direct and labeled customer identifiers", () => {
    const redacted = redactExternalAiText(
      "Customer: Jane Smith, email jane@example.com, phone (806) 555-0100, address 123 Main Street Apt 4, plate: ABC-1234, VIN 1HGCM82633A004352",
    );

    expect(redacted).not.toContain("Jane Smith");
    expect(redacted).not.toContain("jane@example.com");
    expect(redacted).not.toContain("806");
    expect(redacted).not.toContain("123 Main Street");
    expect(redacted).not.toContain("ABC-1234");
    expect(redacted).not.toContain("1HGCM82633A004352");
    expect(redacted).toContain("[REDACTED_NAME]");
    expect(redacted).toContain("[REDACTED_ADDRESS]");
    expect(redacted).toContain("[REDACTED_LICENSE_PLATE]");
  });

  test("redacts conversational names and contextual license plates", () => {
    const redacted = redactExternalAiText(
      "Hi, I'm Jane Smith and Vehicle ABC-1234 needs service",
    );

    expect(redacted).not.toContain("Jane Smith");
    expect(redacted).not.toContain("ABC-1234");
    expect(redacted).toContain("[REDACTED_NAME]");
    expect(redacted).toContain("[REDACTED_LICENSE_PLATE]");
  });

  test("stores prompt-free audit metadata and enforces its retention deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T12:00:00.000Z"));
    const modules = import.meta.glob("./**/*.*s");
    const t = convexTest(schema, modules);
    const tokenIdentifier = "https://testissuer|ai-user";

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { tokenIdentifier, name: "AI User" });
      const orgId = await ctx.db.insert("organizations", {
        name: "AI Shop",
        ownerId: userId,
        taxRate: 8.25,
        laborRate: 120,
        bayCount: 1,
        bayNames: ["Bay 1"],
        isActive: true,
        aiExternalProcessingEnabled: true,
        aiAuditRetentionDays: 1,
      });
      await ctx.db.patch(userId, { currentOrgId: orgId });
      await ctx.db.insert("orgMembers", { orgId, userId, role: "owner", isActive: true });
    });

    await t.withIdentity({ tokenIdentifier }).mutation(recordExternalAiAudit, {
      operation: "external_ai_request",
      retentionDays: 1,
    });
    const audit = await t.run((ctx) => ctx.db.query("externalAiAuditEvents").unique());
    expect(audit).toMatchObject({ operation: "external_ai_request" });
    expect(audit).not.toHaveProperty("prompt");

    await t.mutation(deleteExternalAiAudit, { auditId: audit!._id });
    expect(await t.run((ctx) => ctx.db.get(audit!._id))).not.toBeNull();

    vi.setSystemTime(new Date("2026-08-28T12:00:00.001Z"));
    await t.mutation(deleteExternalAiAudit, { auditId: audit!._id });
    expect(await t.run((ctx) => ctx.db.get(audit!._id))).toBeNull();
  });

  test("records scheduled AI requests without fabricating a user", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T12:00:00.000Z"));
    const modules = import.meta.glob("./**/*.*s");
    const t = convexTest(schema, modules);
    const orgId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "https://testissuer|system-ai-owner",
        name: "Owner",
      });
      return ctx.db.insert("organizations", {
        name: "System AI Shop",
        ownerId: userId,
        taxRate: 8.25,
        laborRate: 120,
        bayCount: 1,
        bayNames: ["Bay 1"],
        isActive: true,
        aiExternalProcessingEnabled: true,
        aiAuditRetentionDays: 2,
      });
    });

    await t.mutation(recordSystemExternalAiAudit, {
      orgId,
      operation: "repair_order_workflow",
    });

    const audit = await t.run((ctx) => ctx.db.query("externalAiAuditEvents").unique());
    expect(audit).toMatchObject({
      orgId,
      operation: "repair_order_workflow",
      expiresAt: "2026-08-29T12:00:00.000Z",
    });
    expect(audit).not.toHaveProperty("userId");
  });
});