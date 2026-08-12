import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";
import type { Doc } from "./_generated/dataModel.d.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getAuthedUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getAuthedUser(ctx);
  if (!user.currentOrgId) throw new ConvexError({ message: "No org selected", code: "FORBIDDEN" });
  const member = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("orgId", user.currentOrgId!).eq("userId", user._id)
    )
    .first();
  if (!member) throw new ConvexError({ message: "Not a member", code: "FORBIDDEN" });
  if (!["owner", "admin"].includes(member.role)) {
    throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });
  }
  return { user, member, orgId: user.currentOrgId };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/** Get all deductions for the current org (admin view) */
export const getOrgDeductions = query({
  args: {
    statusFilter: v.optional(v.union(v.literal("active"), v.literal("paid_off"), v.literal("cancelled"))),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);

    let deductions = await ctx.db
      .query("payrollDeductions")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(500);

    if (args.statusFilter) {
      deductions = deductions.filter((d) => d.status === args.statusFilter);
    }

    // Enrich with member names
    return await Promise.all(
      deductions.map(async (d) => {
        const member = await ctx.db.get(d.memberId);
        const userDoc = member ? await ctx.db.get(member.userId) : null;
        return {
          ...d,
          memberName: userDoc?.name ?? "Unknown",
          memberRole: member?.role ?? "unknown",
        };
      })
    );
  },
});

/** Get deductions for a specific member (admin view) */
export const getDeductionsForMember = query({
  args: { memberId: v.id("orgMembers") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const deductions = await ctx.db
      .query("payrollDeductions")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .order("desc")
      .take(100);

    return deductions;
  },
});

/** Get payment history for a specific deduction */
export const getDeductionPayments = query({
  args: { deductionId: v.id("payrollDeductions") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    return await ctx.db
      .query("deductionPayments")
      .withIndex("by_deduction", (q) => q.eq("deductionId", args.deductionId))
      .order("desc")
      .take(100);
  },
});

/** Tech's own deductions — read-only view of what's being deducted */
export const getMyDeductions = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) return [];

    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", user.currentOrgId!).eq("userId", user._id)
      )
      .first();
    if (!member) return [];

    return await ctx.db
      .query("payrollDeductions")
      .withIndex("by_member_status", (q) => q.eq("memberId", member._id).eq("status", "active"))
      .order("desc")
      .take(50);
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

/** Create a new deduction or advance for an employee */
export const createDeduction = mutation({
  args: {
    memberId: v.id("orgMembers"),
    type: v.union(v.literal("advance"), v.literal("uniform"), v.literal("tools"), v.literal("other")),
    description: v.string(),
    totalAmount: v.number(),
    amountPerCheck: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);

    if (args.totalAmount <= 0) {
      throw new ConvexError({ message: "Amount must be greater than zero", code: "BAD_REQUEST" });
    }
    if (args.amountPerCheck !== undefined && args.amountPerCheck <= 0) {
      throw new ConvexError({ message: "Per-check amount must be greater than zero", code: "BAD_REQUEST" });
    }

    // Verify member belongs to same org
    const member = await ctx.db.get(args.memberId);
    if (!member || member.orgId !== orgId) {
      throw new ConvexError({ message: "Employee not found in this organization", code: "NOT_FOUND" });
    }

    const deductionId = await ctx.db.insert("payrollDeductions", {
      orgId,
      memberId: args.memberId,
      type: args.type,
      description: args.description,
      totalAmount: args.totalAmount,
      amountPerCheck: args.amountPerCheck,
      amountApplied: 0,
      status: "active",
      createdAt: new Date().toISOString(),
      notes: args.notes,
    });

    return deductionId;
  },
});

/** Update a deduction's description, per-check amount, or notes */
export const updateDeduction = mutation({
  args: {
    deductionId: v.id("payrollDeductions"),
    description: v.optional(v.string()),
    amountPerCheck: v.optional(v.number()),
    notes: v.optional(v.string()),
    totalAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);

    const deduction = await ctx.db.get(args.deductionId);
    if (!deduction || deduction.orgId !== orgId) {
      throw new ConvexError({ message: "Deduction not found", code: "NOT_FOUND" });
    }
    if (deduction.status !== "active") {
      throw new ConvexError({ message: "Cannot edit a deduction that is not active", code: "BAD_REQUEST" });
    }

    const updates: Partial<Doc<"payrollDeductions">> = {};
    if (args.description !== undefined) updates.description = args.description;
    if (args.amountPerCheck !== undefined) updates.amountPerCheck = args.amountPerCheck;
    if (args.notes !== undefined) updates.notes = args.notes;
    if (args.totalAmount !== undefined) {
      if (args.totalAmount < deduction.amountApplied) {
        throw new ConvexError({ message: "New total cannot be less than already applied amount", code: "BAD_REQUEST" });
      }
      updates.totalAmount = args.totalAmount;
    }

    await ctx.db.patch(args.deductionId, updates);
  },
});

/** Apply a payment against a deduction (record money coming off a paycheck) */
export const applyDeductionPayment = mutation({
  args: {
    deductionId: v.id("payrollDeductions"),
    amount: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);

    const deduction = await ctx.db.get(args.deductionId);
    if (!deduction || deduction.orgId !== orgId) {
      throw new ConvexError({ message: "Deduction not found", code: "NOT_FOUND" });
    }
    if (deduction.status !== "active") {
      throw new ConvexError({ message: "Deduction is not active", code: "BAD_REQUEST" });
    }
    if (args.amount <= 0) {
      throw new ConvexError({ message: "Payment amount must be greater than zero", code: "BAD_REQUEST" });
    }

    const remaining = deduction.totalAmount - deduction.amountApplied;
    const paymentAmount = Math.min(args.amount, remaining);

    // Record the payment
    await ctx.db.insert("deductionPayments", {
      orgId,
      deductionId: args.deductionId,
      memberId: deduction.memberId,
      amount: paymentAmount,
      appliedAt: new Date().toISOString(),
      note: args.note,
    });

    // Update the deduction total
    const newApplied = deduction.amountApplied + paymentAmount;
    const isPaidOff = newApplied >= deduction.totalAmount;

    await ctx.db.patch(args.deductionId, {
      amountApplied: newApplied,
      status: isPaidOff ? "paid_off" : "active",
    });

    return { amountApplied: paymentAmount, isPaidOff };
  },
});

/** Cancel a deduction (forgive remaining balance) */
export const cancelDeduction = mutation({
  args: { deductionId: v.id("payrollDeductions") },
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);

    const deduction = await ctx.db.get(args.deductionId);
    if (!deduction || deduction.orgId !== orgId) {
      throw new ConvexError({ message: "Deduction not found", code: "NOT_FOUND" });
    }
    if (deduction.status !== "active") {
      throw new ConvexError({ message: "Deduction is not active", code: "BAD_REQUEST" });
    }

    await ctx.db.patch(args.deductionId, { status: "cancelled" });
  },
});
