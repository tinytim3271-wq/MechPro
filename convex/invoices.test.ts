import { makeConvexTest } from "./testHarness";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel.d.ts";

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Creates a test org with a single owner user and returns ids */
async function setupOrgAndUser(
  ctx: Parameters<Parameters<ReturnType<typeof makeConvexTest>["run"]>[0]>[0],
  tokenIdentifier: string
) {
  const userId = await ctx.db.insert("users", {
    tokenIdentifier,
    name: "Test User",
  });
  const orgId = await ctx.db.insert("organizations", {
    name: "Test Shop",
    ownerId: userId,
    taxRate: 8.25,
    laborRate: 100,
    bayCount: 2,
    bayNames: ["Bay 1", "Bay 2"],
    isActive: true,
  });
  await ctx.db.patch(userId, { currentOrgId: orgId });
  await ctx.db.insert("orgMembers", {
    orgId,
    userId,
    role: "owner",
    isActive: true,
  });
  return { orgId, userId };
}

/** Creates a customer, vehicle, RO, and invoice for testing */
async function setupInvoice(
  ctx: Parameters<Parameters<ReturnType<typeof makeConvexTest>["run"]>[0]>[0],
  orgId: Id<"organizations">,
  opts: { total: number; subtotal: number; taxAmount: number; amountPaid?: number }
) {
  const customerId = await ctx.db.insert("customers", {
    orgId,
    name: "John Doe",
    phone: "555-1234",
  });
  const vehicleId = await ctx.db.insert("vehicles", {
    orgId,
    customerId,
    year: "2020",
    make: "Toyota",
    model: "Camry",
  });
  const roId = await ctx.db.insert("repairOrders", {
    orgId,
    customerId,
    vehicleId,
    roNumber: "RO-0001",
    status: "invoiced",
    priority: "normal",
    complaint: "Oil change",
    isMobile: false,
    laborLines: [{ description: "Oil change", laborHours: 1, laborRate: opts.subtotal }],
    partLines: [],
    shopFees: [],
    subtotal: opts.subtotal,
    taxAmount: opts.taxAmount,
    totalAmount: opts.total,
  });
  const invoiceId = await ctx.db.insert("invoices", {
    orgId,
    roId,
    customerId,
    invoiceNumber: "INV-0001",
    status: opts.amountPaid ? "partial" : "sent",
    issuedAt: new Date().toISOString(),
    subtotal: opts.subtotal,
    taxAmount: opts.taxAmount,
    total: opts.total,
    amountPaid: opts.amountPaid ?? 0,
    payments: [],
  });
  return { customerId, vehicleId, roId, invoiceId };
}

// ─── Payment Validation Tests ─────────────────────────────────────────────────

describe("addPayment validation", () => {
  test("rejects negative payment amounts", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|user1";

    await t.run(async (ctx) => {
      const { orgId } = await setupOrgAndUser(ctx, tokenId);
      await setupInvoice(ctx, orgId, { total: 108.25, subtotal: 100, taxAmount: 8.25 });
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });
    const invoices = await authed.query(api.invoices.listInvoices, { paginationOpts: { numItems: 10, cursor: null } });
    const invoiceId = invoices.page[0]._id;

    await expect(
      authed.mutation(api.invoices.addPayment, {
        invoiceId,
        method: "cash",
        amount: -50,
      })
    ).rejects.toThrow("Payment amount must be greater than zero");
  });

  test("rejects zero payment amounts", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|user2";

    await t.run(async (ctx) => {
      const { orgId } = await setupOrgAndUser(ctx, tokenId);
      await setupInvoice(ctx, orgId, { total: 200, subtotal: 200, taxAmount: 0 });
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });
    const invoices = await authed.query(api.invoices.listInvoices, { paginationOpts: { numItems: 10, cursor: null } });
    const invoiceId = invoices.page[0]._id;

    await expect(
      authed.mutation(api.invoices.addPayment, {
        invoiceId,
        method: "card",
        amount: 0,
      })
    ).rejects.toThrow("Payment amount must be greater than zero");
  });

  test("rejects overpayment beyond balance", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|user3";

    await t.run(async (ctx) => {
      const { orgId } = await setupOrgAndUser(ctx, tokenId);
      await setupInvoice(ctx, orgId, { total: 100, subtotal: 100, taxAmount: 0 });
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });
    const invoices = await authed.query(api.invoices.listInvoices, { paginationOpts: { numItems: 10, cursor: null } });
    const invoiceId = invoices.page[0]._id;

    await expect(
      authed.mutation(api.invoices.addPayment, {
        invoiceId,
        method: "cash",
        amount: 500,
      })
    ).rejects.toThrow("Payment amount cannot exceed the remaining balance");
  });

  test("marks invoice as paid when balance reaches zero", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|user4";

    await t.run(async (ctx) => {
      const { orgId } = await setupOrgAndUser(ctx, tokenId);
      await setupInvoice(ctx, orgId, { total: 54.13, subtotal: 50, taxAmount: 4.13 });
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });
    const invoices = await authed.query(api.invoices.listInvoices, { paginationOpts: { numItems: 10, cursor: null } });
    const invoiceId = invoices.page[0]._id;

    await authed.mutation(api.invoices.addPayment, {
      invoiceId,
      method: "cash",
      amount: 54.13,
    });

    // Verify the invoice is now paid
    const updated = await authed.query(api.invoices.getInvoice, { invoiceId });
    expect(updated?.status).toBe("paid");
    expect(updated?.amountPaid).toBe(54.13);
  });

  test("marks invoice as partial on partial payment", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|user5";

    await t.run(async (ctx) => {
      const { orgId } = await setupOrgAndUser(ctx, tokenId);
      await setupInvoice(ctx, orgId, { total: 200, subtotal: 200, taxAmount: 0 });
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });
    const invoices = await authed.query(api.invoices.listInvoices, { paginationOpts: { numItems: 10, cursor: null } });
    const invoiceId = invoices.page[0]._id;

    await authed.mutation(api.invoices.addPayment, {
      invoiceId,
      method: "card",
      amount: 100,
    });

    const updated = await authed.query(api.invoices.getInvoice, { invoiceId });
    expect(updated?.status).toBe("partial");
    expect(updated?.amountPaid).toBe(100);
  });
});

// ─── Clock In/Out Tests ────────────────────────────────────────────────────────

describe("timeclock", () => {
  test("prevents double clock-in", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|tech1";

    await t.run(async (ctx) => {
      const { orgId, userId } = await setupOrgAndUser(ctx, tokenId);
      const memberId = await ctx.db.insert("orgMembers", {
        orgId,
        userId,
        role: "mechanic",
        isActive: true,
      });
      // Simulate already clocked in
      await ctx.db.insert("timeEntries", {
        orgId,
        memberId,
        clockInAt: new Date().toISOString(),
      });
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });
    await expect(
      authed.mutation(api.timeclock.clockIn, {})
    ).rejects.toThrow("Already clocked in");
  });

  test("prevents clock-out when not clocked in", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|tech2";

    await t.run(async (ctx) => {
      const { orgId, userId } = await setupOrgAndUser(ctx, tokenId);
      await ctx.db.insert("orgMembers", {
        orgId,
        userId,
        role: "mechanic",
        isActive: true,
      });
      // No time entry — not clocked in
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });
    await expect(
      authed.mutation(api.timeclock.clockOut, {})
    ).rejects.toThrow("Not clocked in");
  });

  test("calculates totalHours correctly on clock-out", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|tech3";
    let entryId: Id<"timeEntries">;

    await t.run(async (ctx) => {
      const { orgId, userId } = await setupOrgAndUser(ctx, tokenId);
      const memberId = await ctx.db.insert("orgMembers", {
        orgId,
        userId,
        role: "mechanic",
        isActive: true,
      });
      // Clock in 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      entryId = await ctx.db.insert("timeEntries", {
        orgId,
        memberId,
        clockInAt: twoHoursAgo,
      });
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });
    await authed.mutation(api.timeclock.clockOut, {});

    // Verify hours calculation
    await t.run(async (ctx) => {
      const entry = await ctx.db.get(entryId);
      expect(entry?.clockOutAt).toBeDefined();
      expect(entry?.totalHours).toBeGreaterThanOrEqual(1.99);
      expect(entry?.totalHours).toBeLessThanOrEqual(2.02);
    });
  });
});

// ─── Authentication Tests ──────────────────────────────────────────────────────

describe("authentication", () => {
  test("rejects unauthenticated payment attempts", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|auth_user";
    let invoiceId: Id<"invoices">;

    await t.run(async (ctx) => {
      const { orgId } = await setupOrgAndUser(ctx, tokenId);
      const result = await setupInvoice(ctx, orgId, { total: 100, subtotal: 100, taxAmount: 0 });
      invoiceId = result.invoiceId;
    });

    // No identity — should fail
    await expect(
      t.mutation(api.invoices.addPayment, {
        invoiceId: invoiceId!,
        method: "cash",
        amount: 50,
      })
    ).rejects.toThrow("Not authenticated");
  });

  test("rejects payment on another org's invoice", async () => {
    const t = makeConvexTest();
    const tokenA = "https://testissuer|user_a";
    const tokenB = "https://testissuer|user_b";
    let invoiceId: Id<"invoices">;

    await t.run(async (ctx) => {
      // Setup org A
      await setupOrgAndUser(ctx, tokenA);

      // Setup org B with an invoice
      const orgBId = await ctx.db.insert("organizations", {
        name: "Shop B",
        ownerId: "" as Id<"users">,
        taxRate: 0,
        laborRate: 100,
        bayCount: 1,
        bayNames: ["Bay 1"],
        isActive: true,
      });
      const userBId = await ctx.db.insert("users", {
        tokenIdentifier: tokenB,
        name: "User B",
        currentOrgId: orgBId,
      });
      await ctx.db.patch(orgBId, { ownerId: userBId });
      await ctx.db.insert("orgMembers", { orgId: orgBId, userId: userBId, role: "owner", isActive: true });

      const result = await setupInvoice(ctx, orgBId, { total: 100, subtotal: 100, taxAmount: 0 });
      invoiceId = result.invoiceId;
    });

    // User A tries to pay org B's invoice
    const authedA = t.withIdentity({ tokenIdentifier: tokenA });
    await expect(
      authedA.mutation(api.invoices.addPayment, {
        invoiceId: invoiceId!,
        method: "cash",
        amount: 50,
      })
    ).rejects.toThrow("Invoice not found");
  });
});

// ─── Invoice Numbering Tests ──────────────────────────────────────────────────

describe("invoice numbering", () => {
  test("creates sequential invoice numbers", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|seq_user";

    await t.run(async (ctx) => {
      const { orgId } = await setupOrgAndUser(ctx, tokenId);
      const customerId = await ctx.db.insert("customers", { orgId, name: "Seq Customer" });
      const vehicleId = await ctx.db.insert("vehicles", {
        orgId, customerId, year: "2021", make: "Toyota", model: "RAV4",
      });
      // Create two completed ROs
      await ctx.db.insert("repairOrders", {
        orgId, customerId, vehicleId, roNumber: "RO-0001",
        status: "completed", priority: "normal", complaint: "Service A",
        isMobile: false,
        laborLines: [{ description: "Work", laborHours: 1, laborRate: 100 }],
        partLines: [], shopFees: [],
        subtotal: 100, taxAmount: 0, totalAmount: 100,
      });
      await ctx.db.insert("repairOrders", {
        orgId, customerId, vehicleId, roNumber: "RO-0002",
        status: "completed", priority: "normal", complaint: "Service B",
        isMobile: false,
        laborLines: [{ description: "Work B", laborHours: 2, laborRate: 100 }],
        partLines: [], shopFees: [],
        subtotal: 200, taxAmount: 0, totalAmount: 200,
      });
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });

    // Get the ROs
    const ros = await authed.query(api.repairOrders.listROs, { paginationOpts: { numItems: 10, cursor: null } });
    const ro1 = ros.page.find((r) => r.roNumber === "RO-0001")!;
    const ro2 = ros.page.find((r) => r.roNumber === "RO-0002")!;

    // Create invoices sequentially
    const inv1Id = await authed.mutation(api.invoices.createInvoiceFromRO, { roId: ro1._id });
    const inv2Id = await authed.mutation(api.invoices.createInvoiceFromRO, { roId: ro2._id });

    const inv1 = await authed.query(api.invoices.getInvoice, { invoiceId: inv1Id });
    const inv2 = await authed.query(api.invoices.getInvoice, { invoiceId: inv2Id });

    expect(inv1?.invoiceNumber).toBe("INV-0001");
    expect(inv2?.invoiceNumber).toBe("INV-0002");
  });

  test("prevents duplicate invoice for same RO", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|dup_user";

    await t.run(async (ctx) => {
      const { orgId } = await setupOrgAndUser(ctx, tokenId);
      const customerId = await ctx.db.insert("customers", { orgId, name: "Dup Customer" });
      const vehicleId = await ctx.db.insert("vehicles", {
        orgId, customerId, year: "2022", make: "Kia", model: "Sportage",
      });
      await ctx.db.insert("repairOrders", {
        orgId, customerId, vehicleId, roNumber: "RO-0100",
        status: "completed", priority: "normal", complaint: "Brake job",
        isMobile: false,
        laborLines: [{ description: "Brakes", laborHours: 2, laborRate: 100 }],
        partLines: [], shopFees: [],
        subtotal: 200, taxAmount: 0, totalAmount: 200,
      });
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });
    const ros = await authed.query(api.repairOrders.listROs, { paginationOpts: { numItems: 10, cursor: null } });
    const roId = ros.page[0]._id;

    // First invoice should work
    await authed.mutation(api.invoices.createInvoiceFromRO, { roId });

    // Second attempt should fail
    await expect(
      authed.mutation(api.invoices.createInvoiceFromRO, { roId })
    ).rejects.toThrow("Invoice already exists for this RO");
  });
});
