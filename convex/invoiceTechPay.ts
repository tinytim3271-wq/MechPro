import type { Id } from "./_generated/dataModel.d.ts";
import type { MutationCtx } from "./_generated/server.d.ts";

export async function reconcileTechPayRecord(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  paidAt: string,
): Promise<void> {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice) return;

  const ro = await ctx.db.get(invoice.roId);
  if (!ro?.assignedTo || ro.laborLines.length === 0) return;

  const member = await ctx.db.get(ro.assignedTo);
  if (!member) return;

  const customer = await ctx.db.get(ro.customerId);
  const vehicle = await ctx.db.get(ro.vehicleId);
  const laborLines = ro.laborLines.map((line) => ({
    description: line.description,
    laborHours: line.laborHours,
    laborRate: line.laborRate,
    amount: line.laborHours * line.laborRate,
  }));
  const record = {
    orgId: invoice.orgId,
    memberId: ro.assignedTo,
    userId: member.userId,
    roId: ro._id,
    invoiceId,
    roNumber: ro.roNumber,
    customerName: customer?.name ?? "Unknown",
    vehicleSummary: vehicle
      ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
      : "Unknown Vehicle",
    laborLines,
    totalHours: laborLines.reduce((sum, line) => sum + line.laborHours, 0),
    totalEarned: laborLines.reduce((sum, line) => sum + line.amount, 0),
    paidAt,
    employmentType: member.employmentType,
  };

  const existing = await ctx.db
    .query("techPayRecords")
    .withIndex("by_ro", (query) => query.eq("roId", ro._id))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, record);
  } else {
    await ctx.db.insert("techPayRecords", record);
  }
}