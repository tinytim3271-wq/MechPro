import { makeConvexTest } from "./testHarness";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel.d.ts";

async function setupOrg(
  ctx: Parameters<Parameters<ReturnType<typeof makeConvexTest>["run"]>[0]>[0],
  tokenIdentifier: string,
) {
  const userId = await ctx.db.insert("users", {
    tokenIdentifier,
    name: "Shop Owner",
  });
  const orgId = await ctx.db.insert("organizations", {
    name: "Test Shop",
    ownerId: userId,
    taxRate: 8.25,
    laborRate: 120,
    bayCount: 2,
    bayNames: ["Bay 1", "Bay 2"],
    isActive: true,
  });
  await ctx.db.patch(userId, { currentOrgId: orgId });
  const memberId = await ctx.db.insert("orgMembers", {
    orgId,
    userId,
    role: "owner",
    isActive: true,
    employmentType: "w2",
    hourlyRate: 25,
  });
  return { orgId, userId, memberId };
}

describe("createInvoiceFromRO", () => {
  test("copies RO totals and marks the RO invoiced", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|invoice-ro";
    let roId: Id<"repairOrders"> = "" as Id<"repairOrders">;

    await t.run(async (ctx) => {
      const { orgId } = await setupOrg(ctx, tokenId);
      const customerId = await ctx.db.insert("customers", { orgId, name: "Pat Customer" });
      const vehicleId = await ctx.db.insert("vehicles", {
        orgId, customerId, year: "2018", make: "Ford", model: "F-150",
      });
      roId = await ctx.db.insert("repairOrders", {
        orgId,
        customerId,
        vehicleId,
        roNumber: "RO-0100",
        status: "completed",
        priority: "normal",
        complaint: "Brakes",
        isMobile: false,
        laborLines: [{ description: "Pads", laborHours: 1.5, laborRate: 120 }],
        partLines: [{ description: "Pads", quantity: 1, unitCost: 40, unitPrice: 80 }],
        shopFees: [{ description: "Supplies", amount: 10 }],
        subtotal: 270,
        taxAmount: 22.275,
        totalAmount: 292.275,
      });
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });
    const invoiceId = await authed.mutation(api.invoices.createInvoiceFromRO, { roId });
    const invoice = await authed.query(api.invoices.getInvoice, { invoiceId });
    expect(invoice?._id).toBe(invoiceId);
    expect(invoice?.total).toBe(292.275);
    expect(invoice?.subtotal).toBe(270);
    expect(invoice?.status).toBe("draft");

    await t.run(async (ctx) => {
      const ro = await ctx.db.get(roId);
      expect(ro?.status).toBe("invoiced");
    });
  });
});

describe("generatePayroll", () => {
  test("creates W-2 stubs from clocked hours and applies advances", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|payroll";
    let memberId: Id<"orgMembers"> = "" as Id<"orgMembers">;

    await t.run(async (ctx) => {
      const setup = await setupOrg(ctx, tokenId);
      memberId = setup.memberId;
      await ctx.db.insert("timeEntries", {
        orgId: setup.orgId,
        memberId,
        clockInAt: "2026-04-01T08:00:00.000Z",
        clockOutAt: "2026-04-01T16:00:00.000Z",
        totalHours: 40,
      });
      await ctx.db.insert("payrollDeductions", {
        orgId: setup.orgId,
        memberId,
        type: "advance",
        description: "Cash advance",
        totalAmount: 50,
        amountPerCheck: 50,
        amountApplied: 0,
        status: "active",
        createdAt: "2026-03-15T00:00:00.000Z",
      });
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });
    const result = await authed.mutation(api.payroll.generatePayroll, {
      payPeriodStart: "2026-04-01",
      payPeriodEnd: "2026-04-15",
      checkDate: "2026-04-16",
    });
    expect(result.employeesProcessed).toBe(1);
    expect(result.totalGrossPay).toBe(1000);

    const run = await authed.query(api.payroll.getPayrollRun, { runId: result.runId });
    expect(run?.stubs).toHaveLength(1);
    const stub = run!.stubs[0];
    expect(stub.grossPay).toBe(1000);
    expect(stub.advancesDeducted).toBe(50);
    expect(stub.employmentType).toBe("w2");
    expect(stub.federalIncomeTax).toBeGreaterThan(0);
    expect(stub.netPay).toBeLessThan(stub.grossPay - 50);
  });
});

describe("diagnosticSessions", () => {
  test("persists a simulator scan and opens an estimate from DTCs", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|obd";
    let vehicleId: Id<"vehicles"> = "" as Id<"vehicles">;

    await t.run(async (ctx) => {
      const { orgId } = await setupOrg(ctx, tokenId);
      const customerId = await ctx.db.insert("customers", { orgId, name: "Scan Customer" });
      vehicleId = await ctx.db.insert("vehicles", {
        orgId, customerId, year: "2019", make: "Honda", model: "Civic", vin: "1HGBH41JXMN109186",
      });
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });
    const sessionId = await authed.mutation(api.diagnosticSessions.saveSession, {
      vehicleId,
      mode: "simulator",
      adapterType: "simulator",
      adapterStatus: "SIMULATOR — not a live vehicle",
      vin: "1HGBH41JXMN109186",
      dtcs: [{ code: "P0420", status: "confirmed", description: "Catalyst" }],
      readiness: { catalyst: "not_ready" },
    });
    const roId = await authed.mutation(api.diagnosticSessions.createEstimateFromSession, { sessionId });
    const session = await authed.query(api.diagnosticSessions.getSession, { sessionId });
    expect(session?.roId).toBe(roId);
    expect(session?.dtcs[0].code).toBe("P0420");

    await t.run(async (ctx) => {
      const ro = await ctx.db.get(roId);
      expect(ro?.status).toBe("estimate");
      expect(ro?.complaint).toContain("P0420");
    });
  });
});

describe("keyJobs authorization", () => {
  test("rejects unsigned ROs and allows signed customer authorization", async () => {
    const t = makeConvexTest();
    const tokenId = "https://testissuer|keys";
    let customerId: Id<"customers"> = "" as Id<"customers">;
    let vehicleId: Id<"vehicles"> = "" as Id<"vehicles">;
    let unsignedRo: Id<"repairOrders"> = "" as Id<"repairOrders">;
    let signedRo: Id<"repairOrders"> = "" as Id<"repairOrders">;

    await t.run(async (ctx) => {
      const { orgId } = await setupOrg(ctx, tokenId);
      customerId = await ctx.db.insert("customers", { orgId, name: "Key Customer" });
      vehicleId = await ctx.db.insert("vehicles", {
        orgId, customerId, year: "2016", make: "Toyota", model: "Camry",
      });
      unsignedRo = await ctx.db.insert("repairOrders", {
        orgId, customerId, vehicleId, roNumber: "RO-0200", status: "approved",
        priority: "normal", complaint: "Lost key", isMobile: false,
        laborLines: [], partLines: [], shopFees: [],
        subtotal: 0, taxAmount: 0, totalAmount: 0,
      });
      signedRo = await ctx.db.insert("repairOrders", {
        orgId, customerId, vehicleId, roNumber: "RO-0201", status: "approved",
        priority: "normal", complaint: "Add key", isMobile: false,
        laborLines: [], partLines: [], shopFees: [],
        subtotal: 0, taxAmount: 0, totalAmount: 0,
        authorizationName: "Key Customer",
        authorizationMethod: "signature",
        signedAt: "2026-04-01T12:00:00.000Z",
        customerSignature: "data:image/png;base64,aaa",
      });
    });

    const authed = t.withIdentity({ tokenIdentifier: tokenId });
    await expect(
      authed.mutation(api.keyJobs.createJob, {
        customerId,
        vehicleId,
        roId: unsignedRo,
        keyType: "transponder",
        operation: "add_key",
        mode: "simulator",
        adapterStatus: "SIMULATOR",
      }),
    ).rejects.toThrow(/authorize/);

    await expect(
      authed.mutation(api.keyJobs.createJob, {
        customerId,
        vehicleId,
        roId: signedRo,
        keyType: "transponder",
        operation: "immobilizer_bypass",
        mode: "simulator",
        adapterStatus: "SIMULATOR",
      }),
    ).rejects.toThrow(/not supported/);

    const jobId = await authed.mutation(api.keyJobs.createJob, {
      customerId,
      vehicleId,
      roId: signedRo,
      keyType: "transponder",
      operation: "add_key",
      mode: "simulator",
      adapterStatus: "SIMULATOR — not a live programmer",
      resultNotes: "Simulated add-key",
    });
    const jobs = await authed.query(api.keyJobs.listJobs, { roId: signedRo });
    expect(jobs[0]._id).toBe(jobId);
    expect(jobs[0].result).toBe("success");
    expect(jobs[0].authorizationName).toBe("Key Customer");
  });
});
