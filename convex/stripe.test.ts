import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { getCheckoutAmountCents, validateRedirectUrl } from "./stripe";

function openInvoice(overrides: Record<string, unknown> = {}) {
  return {
    status: "sent" as const,
    subtotal: 100,
    taxAmount: 8.25,
    total: 108.25,
    amountPaid: 0,
    ro: {
      laborLines: [{ laborHours: 1, laborRate: 100 }],
      partLines: [],
      shopFees: [],
    },
    ...overrides,
  };
}

describe("invoice checkout validation", () => {
  test("derives the open balance from invoice line items in cents", () => {
    expect(getCheckoutAmountCents(openInvoice({ status: "partial", amountPaid: 20 }))).toBe(8_825);
  });

  test.each(["draft", "paid", "void"] as const)("rejects %s invoices", (status) => {
    expect(() => getCheckoutAmountCents(openInvoice({ status }))).toThrow(
      "Invoice is not open for payment",
    );
  });

  test("rejects a writable invoice total that disagrees with line items", () => {
    expect(() => getCheckoutAmountCents(openInvoice({ total: 1 }))).toThrow(
      "Invoice total does not match its line items",
    );
  });

  test.each([
    { subtotal: 0.49, total: 0.49, laborRate: 0.49 },
    { subtotal: 1_000_000, total: 1_000_000, laborRate: 1_000_000 },
  ])("rejects a balance outside Stripe's USD bounds", ({ subtotal, total, laborRate }) => {
    const invoice = openInvoice({
      subtotal,
      total,
      taxAmount: 0,
      ro: {
        laborLines: [{ laborHours: 1, laborRate }],
        partLines: [],
        shopFees: [],
      },
    });

    expect(() => getCheckoutAmountCents(invoice)).toThrow(
      "Invoice balance is outside the supported payment range",
    );
  });
});

describe("checkout redirect validation", () => {
  const frontendUrl = "https://app.example.com";

  test("accepts paths and absolute URLs on the configured frontend origin", () => {
    expect(validateRedirectUrl(undefined, "/pay?success=1", frontendUrl)).toBe(
      "https://app.example.com/pay?success=1",
    );
    expect(
      validateRedirectUrl("https://app.example.com/pay?cancel=1", "/pay", frontendUrl),
    ).toBe("https://app.example.com/pay?cancel=1");
  });

  test.each([
    "https://attacker.example/pay",
    "javascript:alert(1)",
    "https://user:password@app.example.com/pay",
  ])("rejects an untrusted redirect URL: %s", (redirectUrl) => {
    expect(() => validateRedirectUrl(redirectUrl, "/pay", frontendUrl)).toThrow(ConvexError);
  });
});