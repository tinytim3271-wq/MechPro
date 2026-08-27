import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

async function setupInvoiceScenario(amountPaid = 0) {
  const modules = import.meta.glob("./**/*.*s");
  const t = convexTest(schema, modules);
  const tokenIdentifier = `https://testissuer|accounting-${amountPaid}`;
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { tokenIdentifier });
    const orgId = await ctx.db.insert("organizations", {
      name: "Accounting Shop",
      ownerId: userId,
      taxRate: 0,
      laborRate: 100,
      bayCount: 1,
      bayNames: ["Bay 1"],
      isActive: true,
    });
    await ctx.db.patch(userId, { currentOrgId: orgId });
    await ctx.db.insert("orgMembers", {
      orgId,
      userId,
      role: "owner",
      isActive: true,
    });
    const customerId = await ctx.db.insert("customers", {
      orgId,
      name: "Customer",
      phone: "5550104",
    });
    const vehicleId = await ctx.db.insert("vehicles", {
      orgId,
      customerId,
      year: "2024",
      make: "Toyota",
      model: "Tacoma",
    });
    const partId = await ctx.db.insert("parts", {
      orgId,
      name: "Brake Pad",
      stockQty: 8,
      lowStockThreshold: 2,
      unitCost: 25,
      unitPrice: 50,
    });
    const roId = await ctx.db.insert("repairOrders", {
      orgId,
      roNumber: "RO-ACCOUNTING",
      customerId,
      vehicleId,
      isMobile: false,
      status: "completed",
      priority: "normal",
      complaint: "Brakes",
      laborLines: [],
      partLines: [{ partId, description: "Brake Pad", quantity: 2, unitCost: 25, unitPrice: 50 }],
      shopFees: [],
      subtotal: 100,
      taxAmount: 0,
      totalAmount: 100,
    });
    return { orgId, customerId, roId, partId };
  });
  return { t, tokenIdentifier, ids };
}

describe("invoice accounting", () => {
  test("creating an invoice does not deduct stock a second time", async () => {
    const { t, tokenIdentifier, ids } = await setupInvoiceScenario();

    await t.withIdentity({ tokenIdentifier }).mutation(api.invoices.createInvoiceFromRO, {
      roId: ids.roId,
    });

    const part = await t.run((ctx) => ctx.db.get(ids.partId));
    expect(part?.stockQty).toBe(8);
  }, 15_000);

  test("voiding an invoice with a recorded payment requires reversal", async () => {
    const { t, tokenIdentifier, ids } = await setupInvoiceScenario(25);
    const invoiceId = await t.run((ctx) =>
      ctx.db.insert("invoices", {
        orgId: ids.orgId,
        roId: ids.roId,
        customerId: ids.customerId,
        invoiceNumber: "INV-PAID",
        status: "partial",
        issuedAt: new Date().toISOString(),
        subtotal: 100,
        taxAmount: 0,
        total: 100,
        amountPaid: 25,
        payments: [{ method: "cash", amount: 25, paidAt: new Date().toISOString() }],
      }),
    );

    await expect(
      t.withIdentity({ tokenIdentifier }).mutation(api.invoices.voidInvoice, { invoiceId }),
    ).rejects.toThrow("reverse payments before voiding");
  });
});