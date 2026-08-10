import { internalQuery } from "./_generated/server";

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