import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel.d.ts";
import schema from "./schema";

describe("active organization membership", () => {
  test("an inactive member cannot read an organization repair order", async () => {
    const modules = import.meta.glob("./**/*.*s");
    const t = convexTest(schema, modules);
    const tokenIdentifier = "https://testissuer|removed-member";

    const roId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier,
        name: "Removed Member",
      });
      const orgId = await ctx.db.insert("organizations", {
        name: "Test Shop",
        ownerId: userId,
        taxRate: 8.25,
        laborRate: 120,
        bayCount: 1,
        bayNames: ["Bay 1"],
        isActive: true,
      });
      await ctx.db.patch(userId, { currentOrgId: orgId });
      await ctx.db.insert("orgMembers", {
        orgId,
        userId,
        role: "service_writer",
        isActive: false,
      });
      const customerId = await ctx.db.insert("customers", {
        orgId,
        name: "Customer",
        phone: "5550100",
      });
      const vehicleId = await ctx.db.insert("vehicles", {
        orgId,
        customerId,
        year: "2020",
        make: "Toyota",
        model: "Camry",
      });
      return ctx.db.insert("repairOrders", {
        orgId,
        roNumber: "RO-0001",
        customerId,
        vehicleId,
        isMobile: false,
        status: "estimate",
        priority: "normal",
        complaint: "Test",
        laborLines: [],
        partLines: [],
        shopFees: [],
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
      });
    });

    const result = await t
      .withIdentity({ tokenIdentifier })
      .query(api.repairOrders.getRO, { roId: roId as Id<"repairOrders"> });

    expect(result).toBeNull();
  });

  test("a mechanic cannot post an invoice payment", async () => {
    const modules = import.meta.glob("./**/*.*s");
    const t = convexTest(schema, modules);
    const tokenIdentifier = "https://testissuer|mechanic";

    const invoiceId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { tokenIdentifier });
      const orgId = await ctx.db.insert("organizations", {
        name: "Test Shop",
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
        role: "mechanic",
        isActive: true,
      });
      const customerId = await ctx.db.insert("customers", {
        orgId,
        name: "Customer",
        phone: "5550100",
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
        status: "invoiced",
        priority: "normal",
        complaint: "Test",
        laborLines: [],
        partLines: [],
        shopFees: [],
        subtotal: 100,
        taxAmount: 0,
        totalAmount: 100,
      });
      return ctx.db.insert("invoices", {
        orgId,
        roId,
        customerId,
        invoiceNumber: "INV-0001",
        status: "sent",
        issuedAt: new Date().toISOString(),
        subtotal: 100,
        taxAmount: 0,
        total: 100,
        amountPaid: 0,
        payments: [],
      });
    });

    await expect(
      t.withIdentity({ tokenIdentifier }).mutation(api.invoices.addPayment, {
        invoiceId,
        method: "cash",
        amount: 25,
      }),
    ).rejects.toThrow("Insufficient permissions");
  });

  test("repair order creation rejects a customer from another shop", async () => {
    const modules = import.meta.glob("./**/*.*s");
    const t = convexTest(schema, modules);
    const tokenIdentifier = "https://testissuer|owner";

    const ids = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { tokenIdentifier });
      const orgId = await ctx.db.insert("organizations", {
        name: "Owner Shop",
        ownerId,
        taxRate: 0,
        laborRate: 100,
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
      const otherOrgId = await ctx.db.insert("organizations", {
        name: "Other Shop",
        ownerId,
        taxRate: 0,
        laborRate: 100,
        bayCount: 1,
        bayNames: ["Bay 1"],
        isActive: true,
      });
      const customerId = await ctx.db.insert("customers", {
        orgId: otherOrgId,
        name: "Other Customer",
        phone: "5550101",
      });
      const ownCustomerId = await ctx.db.insert("customers", {
        orgId,
        name: "Owner Customer",
        phone: "5550102",
      });
      const vehicleId = await ctx.db.insert("vehicles", {
        orgId,
        customerId: ownCustomerId,
        year: "2022",
        make: "Honda",
        model: "Civic",
      });
      return { customerId, vehicleId };
    });

    await expect(
      t.withIdentity({ tokenIdentifier }).mutation(api.repairOrders.createRO, {
        customerId: ids.customerId,
        vehicleId: ids.vehicleId,
        isMobile: false,
        complaint: "Test",
        priority: "normal",
      }),
    ).rejects.toThrow("Customer not found");

    const repairOrderCount = await t.run(async (ctx) =>
      (await ctx.db.query("repairOrders").collect()).length,
    );
    expect(repairOrderCount).toBe(0);
  });

  test("tenant-indexed reads hide foreign messages and stock", async () => {
    const modules = import.meta.glob("./**/*.*s");
    const t = convexTest(schema, modules);
    const tokenIdentifier = "https://testissuer|shop-a-owner";

    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { tokenIdentifier });
      const orgId = await ctx.db.insert("organizations", {
        name: "Shop A",
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
      const foreignOrgId = await ctx.db.insert("organizations", {
        name: "Shop B",
        ownerId: userId,
        taxRate: 0,
        laborRate: 100,
        bayCount: 1,
        bayNames: ["Bay 1"],
        isActive: true,
      });
      const customerId = await ctx.db.insert("customers", {
        orgId: foreignOrgId,
        name: "Foreign Customer",
        phone: "5550103",
      });
      const vehicleId = await ctx.db.insert("vehicles", {
        orgId: foreignOrgId,
        customerId,
        year: "2023",
        make: "Ford",
        model: "Transit",
      });
      const roId = await ctx.db.insert("repairOrders", {
        orgId: foreignOrgId,
        roNumber: "RO-B-1",
        customerId,
        vehicleId,
        isMobile: false,
        status: "estimate",
        priority: "normal",
        complaint: "Private",
        laborLines: [],
        partLines: [],
        shopFees: [],
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
      });
      const foreignMemberId = await ctx.db.insert("orgMembers", {
        orgId: foreignOrgId,
        userId,
        role: "mechanic",
        isActive: true,
      });
      await ctx.db.insert("roMessages", {
        orgId: foreignOrgId,
        roId,
        senderId: foreignMemberId,
        senderName: "Foreign Tech",
        senderRole: "mechanic",
        body: "Private message",
        readByOffice: false,
        readByTech: true,
      });
      const partId = await ctx.db.insert("parts", {
        orgId: foreignOrgId,
        name: "Foreign Part",
        stockQty: 42,
        lowStockThreshold: 2,
        unitCost: 10,
        unitPrice: 20,
      });
      return { roId, partId };
    });

    const authed = t.withIdentity({ tokenIdentifier });
    await expect(authed.query(api.messages.getByRO, { roId: ids.roId })).resolves.toEqual([]);
    await expect(authed.query(api.parts.checkStock, { partIds: [ids.partId] })).resolves.toEqual([]);
  });
});