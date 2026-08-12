import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel.d.ts";

async function setupEstimate(
  ctx: Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0],
  tokenIdentifier: string,
  approvalToken?: string,
) {
  const orgId = await ctx.db.insert("organizations", {
    name: "Test Shop",
    ownerId: "" as Id<"users">,
    taxRate: 8.25,
    laborRate: 100,
    bayCount: 1,
    bayNames: ["Bay 1"],
    isActive: true,
  });
  const userId = await ctx.db.insert("users", {
    tokenIdentifier,
    name: "Owner",
    currentOrgId: orgId,
  });
  await ctx.db.patch(orgId, { ownerId: userId });
  await ctx.db.insert("orgMembers", {
    orgId,
    userId,
    role: "owner",
    isActive: true,
  });

  const customerId = await ctx.db.insert("customers", {
    orgId,
    name: "Jane Customer",
    phone: "555-9876",
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
    roNumber: "RO-0001",
    customerId,
    vehicleId,
    isMobile: false,
    status: "estimate",
    priority: "normal",
    complaint: "Brake noise",
    laborLines: [],
    partLines: [],
    shopFees: [],
    subtotal: 100,
    taxAmount: 8.25,
    totalAmount: 108.25,
    approvalToken,
  });

  return { orgId, userId, roId };
}

describe("estimate approval tokens", () => {
  test("public estimate requires a valid token", async () => {
    const t = convexTest(schema);
    const tokenId = "https://testissuer|owner1";

    const { roId } = await t.run(async (ctx) => setupEstimate(ctx, tokenId, "secret-token"));

    const withoutToken = await t.query(api.estimates.getEstimatePublic, { roId, token: "wrong" });
    expect(withoutToken).toBeNull();

    const withToken = await t.query(api.estimates.getEstimatePublic, { roId, token: "secret-token" });
    expect(withToken?.roNumber).toBe("RO-0001");
  });

  test("approveEstimate rejects invalid tokens", async () => {
    const t = convexTest(schema);
    const tokenId = "https://testissuer|owner2";

    const { roId } = await t.run(async (ctx) => setupEstimate(ctx, tokenId, "good-token"));

    await expect(
      t.mutation(api.estimates.approveEstimate, {
        roId,
        token: "bad-token",
        customerName: "Jane",
      }),
    ).rejects.toThrow();

    await t.mutation(api.estimates.approveEstimate, {
      roId,
      token: "good-token",
      customerName: "Jane Customer",
    });

    const approved = await t.query(api.estimates.getEstimatePublic, { roId, token: "good-token" });
    expect(approved?.status).toBe("approved");
  });
});

describe("invoice org isolation", () => {
  test("createInvoiceFromRO rejects cross-org repair orders", async () => {
    const t = convexTest(schema);
    const ownerA = "https://testissuer|ownerA";
    const ownerB = "https://testissuer|ownerB";

    const { roId: foreignRoId } = await t.run(async (ctx) => setupEstimate(ctx, ownerA, "tok"));
    await t.run(async (ctx) => {
      const orgB = await ctx.db.insert("organizations", {
        name: "Other Shop",
        ownerId: "" as Id<"users">,
        taxRate: 8,
        laborRate: 90,
        bayCount: 1,
        bayNames: ["Bay 1"],
        isActive: true,
      });
      const userB = await ctx.db.insert("users", {
        tokenIdentifier: ownerB,
        name: "Other Owner",
        currentOrgId: orgB,
      });
      await ctx.db.patch(orgB, { ownerId: userB });
      await ctx.db.insert("orgMembers", {
        orgId: orgB,
        userId: userB,
        role: "owner",
        isActive: true,
      });
    });

    const authedB = t.withIdentity({ tokenIdentifier: ownerB });
    await expect(
      authedB.mutation(api.invoices.createInvoiceFromRO, { roId: foreignRoId }),
    ).rejects.toThrow();
  });
});
