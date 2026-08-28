import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel.d.ts";
import schema from "./schema";

describe("employee invitations", () => {
  test("persists a pending employee with a dedicated user profile", async () => {
    const modules = import.meta.glob("./**/*.*s");
    const t = convexTest(schema, modules);
    const tokenIdentifier = "https://testissuer|shop-owner";

    const { ownerId, orgId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        tokenIdentifier,
        name: "Shop Owner",
        email: "owner@example.com",
      });
      const orgId = await ctx.db.insert("organizations", {
        name: "Test Shop",
        ownerId,
        taxRate: 8.25,
        laborRate: 120,
        bayCount: 1,
        bayNames: ["Bay 1"],
        isActive: true,
      });
      await ctx.db.patch(ownerId, { currentOrgId: orgId });
      await ctx.db.insert("orgMembers", {
        orgId,
        userId: ownerId,
        role: "owner",
        isActive: true,
      });
      return { ownerId, orgId };
    });

    await t.withIdentity({ tokenIdentifier }).mutation(internal.organizations.inviteMember, {
      orgId: orgId as Id<"organizations">,
      name: "Alex Technician",
      email: " Alex@Example.com ",
      role: "mechanic",
    });

    const result = await t.run(async (ctx) => {
      const member = await ctx.db
        .query("orgMembers")
        .withIndex("by_invite_email", (q) => q.eq("inviteEmail", "alex@example.com"))
        .unique();
      return { member, employee: member ? await ctx.db.get(member.userId) : null };
    });

    expect(result.member).toMatchObject({
      orgId,
      role: "mechanic",
      isActive: false,
      inviteEmail: "alex@example.com",
      inviteStatus: "pending",
    });
    expect(result.member?.userId).not.toBe(ownerId);
    expect(result.employee).toMatchObject({
      tokenIdentifier: "pending_invite:alex@example.com",
      name: "Alex Technician",
      email: "alex@example.com",
    });
  });

  test("replaces and removes the pending profile when the employee signs in", async () => {
    const modules = import.meta.glob("./**/*.*s");
    const t = convexTest(schema, modules);
    const ownerToken = "https://testissuer|owner";
    const employeeToken = "https://testissuer|employee";

    const orgId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { tokenIdentifier: ownerToken });
      const orgId = await ctx.db.insert("organizations", {
        name: "Test Shop",
        ownerId,
        taxRate: 0,
        laborRate: 100,
        bayCount: 1,
        bayNames: ["Bay 1"],
        isActive: true,
      });
      await ctx.db.insert("orgMembers", { orgId, userId: ownerId, role: "owner", isActive: true });
      return orgId;
    });

    await t.withIdentity({ tokenIdentifier: ownerToken }).mutation(internal.organizations.inviteMember, {
      orgId,
      name: "Alex Technician",
      email: "alex@example.com",
      role: "mechanic",
    });
    await t.withIdentity({
      tokenIdentifier: employeeToken,
      email: "alex@example.com",
      name: "Alex Technician",
    }).mutation(api.users.updateCurrentUser, {});

    const result = await t.run(async (ctx) => {
      const employee = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", employeeToken))
        .unique();
      const member = await ctx.db
        .query("orgMembers")
        .withIndex("by_invite_email", (q) => q.eq("inviteEmail", "alex@example.com"))
        .unique();
      const pending = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", "pending_invite:alex@example.com"))
        .first();
      return { employee, member, pending };
    });

    expect(result.employee).toMatchObject({
      name: "Alex Technician",
      email: "alex@example.com",
      currentOrgId: orgId,
    });
    expect(result.member).toMatchObject({
      userId: result.employee?._id,
      isActive: true,
      inviteStatus: "accepted",
    });
    expect(result.pending).toBeNull();
  });
});