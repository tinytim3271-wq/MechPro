import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import type { MutationCtx, QueryCtx } from "./_generated/server.d.ts";

type AuthCtx = QueryCtx | MutationCtx;
type OrgRole = Doc<"orgMembers">["role"];

export type ActiveMembership = {
  user: Doc<"users">;
  member: Doc<"orgMembers">;
  orgId: Id<"organizations">;
};

export async function getActiveMembership(
  ctx: AuthCtx,
): Promise<ActiveMembership | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return findActiveMembership(ctx, identity.tokenIdentifier);
}

async function findActiveMembership(
  ctx: AuthCtx,
  tokenIdentifier: string,
): Promise<ActiveMembership | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", tokenIdentifier),
    )
    .unique();
  if (!user?.currentOrgId) return null;

  const member = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("orgId", user.currentOrgId!).eq("userId", user._id),
    )
    .unique();
  if (!member?.isActive) return null;

  return { user, member, orgId: user.currentOrgId };
}

export async function requireActiveMembership(
  ctx: AuthCtx,
): Promise<ActiveMembership> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
  const membership = await findActiveMembership(ctx, identity.tokenIdentifier);
  if (!membership) {
    throw new ConvexError({
      message: "Active organization membership required",
      code: "FORBIDDEN",
    });
  }
  return membership;
}

export async function requireRoles(
  ctx: AuthCtx,
  roles: readonly OrgRole[],
): Promise<ActiveMembership> {
  const membership = await requireActiveMembership(ctx);
  if (
    !roles.includes(membership.member.role) &&
    membership.member.hasAdminAccess !== true
  ) {
    throw new ConvexError({ message: "Insufficient permissions", code: "FORBIDDEN" });
  }
  return membership;
}

export function assertOrgResource<T extends { orgId: Id<"organizations"> }>(
  resource: T | null,
  orgId: Id<"organizations">,
  label: string,
): asserts resource is T {
  if (!resource || resource.orgId !== orgId) {
    throw new ConvexError({ message: `${label} not found`, code: "NOT_FOUND" });
  }
}