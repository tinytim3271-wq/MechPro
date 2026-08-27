import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireActiveMembership } from "./authorization";

const deleteExternalAiAuditRef = makeFunctionReference<
  "mutation",
  { auditId: Id<"externalAiAuditEvents"> },
  null
>("aiPolicy:deleteExternalAiAudit");

export const getExternalAiPolicy = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (query) => query.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;

    const [org, member] = await Promise.all([
      ctx.db.get(user.currentOrgId),
      ctx.db
        .query("orgMembers")
        .withIndex("by_org_user", (query) =>
          query.eq("orgId", user.currentOrgId!).eq("userId", user._id),
        )
        .unique(),
    ]);
    if (!org || !member?.isActive) return null;

    return {
      orgId: org._id,
      enabled: org.aiExternalProcessingEnabled === true,
      auditRetentionDays: org.aiAuditRetentionDays ?? 30,
    };
  },
});

export const recordExternalAiAudit = internalMutation({
  args: {
    operation: v.string(),
    retentionDays: v.number(),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireActiveMembership(ctx);
    const org = await ctx.db.get(orgId);
    const configuredRetentionDays = org?.aiAuditRetentionDays ?? 30;
    if (
      !org?.aiExternalProcessingEnabled
      || args.retentionDays !== configuredRetentionDays
      || !Number.isInteger(configuredRetentionDays)
      || configuredRetentionDays < 1
      || configuredRetentionDays > 365
    ) {
      throw new Error("External AI audit policy is invalid");
    }
    const createdAtMs = Date.now();
    const expiresAtMs = createdAtMs + configuredRetentionDays * 24 * 60 * 60 * 1000;
    const auditId = await ctx.db.insert("externalAiAuditEvents", {
      orgId,
      userId: user._id,
      operation: args.operation.slice(0, 80),
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
    await ctx.scheduler.runAt(expiresAtMs, deleteExternalAiAuditRef, { auditId });
    return null;
  },
});

export const deleteExternalAiAudit = internalMutation({
  args: { auditId: v.id("externalAiAuditEvents") },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (audit && Date.parse(audit.expiresAt) <= Date.now()) {
      await ctx.db.delete(args.auditId);
    }
    return null;
  },
});

export const recordSystemExternalAiAudit = internalMutation({
  args: {
    orgId: v.id("organizations"),
    operation: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.orgId);
    const retentionDays = org?.aiAuditRetentionDays ?? 30;
    if (
      !org?.aiExternalProcessingEnabled
      || !Number.isInteger(retentionDays)
      || retentionDays < 1
      || retentionDays > 365
    ) {
      throw new Error("External AI audit policy is invalid");
    }
    const createdAtMs = Date.now();
    const expiresAtMs = createdAtMs + retentionDays * 24 * 60 * 60 * 1000;
    const auditId = await ctx.db.insert("externalAiAuditEvents", {
      orgId: args.orgId,
      operation: args.operation.slice(0, 80),
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
    await ctx.scheduler.runAt(expiresAtMs, deleteExternalAiAuditRef, { auditId });
    return null;
  },
});