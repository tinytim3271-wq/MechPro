/**
 * Repair-order and invoice math used by the shop counter and tests.
 * Mirrors convex/repairOrders.ts line-total behavior.
 */

export type LaborLine = {
  description: string;
  laborHours: number;
  laborRate: number;
};

export type PartLine = {
  description: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
};

export type ShopFee = {
  description: string;
  amount: number;
};

export type RoTotals = {
  laborTotal: number;
  partsTotal: number;
  partsCost: number;
  feesTotal: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
};

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeRoTotals(opts: {
  laborLines: LaborLine[];
  partLines: PartLine[];
  shopFees: ShopFee[];
  taxRatePercent: number;
}): RoTotals {
  const laborTotal = round2(
    opts.laborLines.reduce((s, l) => s + l.laborHours * l.laborRate, 0),
  );
  const partsTotal = round2(
    opts.partLines.reduce((s, p) => s + p.quantity * p.unitPrice, 0),
  );
  const partsCost = round2(
    opts.partLines.reduce((s, p) => s + p.quantity * p.unitCost, 0),
  );
  const feesTotal = round2(opts.shopFees.reduce((s, f) => s + f.amount, 0));
  const subtotal = round2(laborTotal + partsTotal + feesTotal);
  const taxAmount = round2(subtotal * (Math.max(0, opts.taxRatePercent) / 100));
  const totalAmount = round2(subtotal + taxAmount);
  return { laborTotal, partsTotal, partsCost, feesTotal, subtotal, taxAmount, totalAmount };
}

export function invoiceBalance(total: number, amountPaid: number): number {
  return round2(Math.max(0, total - amountPaid));
}

export function nextPaymentStatus(
  total: number,
  amountPaid: number,
): "draft" | "sent" | "partial" | "paid" {
  if (amountPaid <= 0) return "sent";
  if (amountPaid + 0.009 >= total) return "paid";
  return "partial";
}
