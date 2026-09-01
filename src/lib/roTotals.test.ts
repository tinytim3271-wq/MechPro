import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeRoTotals, invoiceBalance, nextPaymentStatus } from "./roTotals.ts";

describe("RO / invoice totals", () => {
  it("sums labor, parts, fees, and tax", () => {
    const t = computeRoTotals({
      laborLines: [
        { description: "Brakes", laborHours: 1.5, laborRate: 120 },
        { description: "Bleed", laborHours: 0.5, laborRate: 120 },
      ],
      partLines: [
        { description: "Pads", quantity: 1, unitCost: 40, unitPrice: 80 },
        { description: "Rotors", quantity: 2, unitCost: 50, unitPrice: 95 },
      ],
      shopFees: [{ description: "Shop supplies", amount: 12.5 }],
      taxRatePercent: 8.25,
    });
    assert.equal(t.laborTotal, 240);
    assert.equal(t.partsTotal, 270);
    assert.equal(t.partsCost, 140);
    assert.equal(t.feesTotal, 12.5);
    assert.equal(t.subtotal, 522.5);
    assert.equal(t.taxAmount, 43.11);
    assert.equal(t.totalAmount, 565.61);
  });

  it("treats zero tax as passthrough", () => {
    const t = computeRoTotals({
      laborLines: [{ description: "Diag", laborHours: 1, laborRate: 100 }],
      partLines: [],
      shopFees: [],
      taxRatePercent: 0,
    });
    assert.equal(t.subtotal, 100);
    assert.equal(t.taxAmount, 0);
    assert.equal(t.totalAmount, 100);
  });

  it("tracks invoice balance and paid/partial status", () => {
    assert.equal(invoiceBalance(200, 50), 150);
    assert.equal(nextPaymentStatus(200, 0), "sent");
    assert.equal(nextPaymentStatus(200, 50), "partial");
    assert.equal(nextPaymentStatus(200, 200), "paid");
  });
});
