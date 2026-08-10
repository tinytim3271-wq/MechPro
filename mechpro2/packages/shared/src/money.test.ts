import { describe, expect, it } from "vitest";

import { Money, MoneyError, Rate } from "./money.js";

describe("Money.parse", () => {
  it("parses plain and decorated amounts", () => {
    expect(Money.parse("12.34")).toBe(1234);
    expect(Money.parse("$1,234.56")).toBe(123456);
    expect(Money.parse(" 0.05 ")).toBe(5);
    expect(Money.parse("7")).toBe(700);
    expect(Money.parse(".5")).toBe(50);
    expect(Money.parse("-12.34")).toBe(-1234);
  });

  it("rejects more than two decimal places instead of truncating", () => {
    expect(() => Money.parse("1.005")).toThrow(MoneyError);
  });

  it("rejects junk", () => {
    expect(() => Money.parse("")).toThrow(MoneyError);
    expect(() => Money.parse("abc")).toThrow(MoneyError);
    expect(() => Money.parse("1.2.3")).toThrow(MoneyError);
  });
});

describe("Money formatting", () => {
  it("pads cents and groups thousands", () => {
    expect(Money.format(Money.fromCents(5))).toBe("0.05");
    expect(Money.format(Money.fromCents(1234567))).toBe("12,345.67");
    expect(Money.formatCurrency(Money.fromCents(-1234567))).toBe("-$12,345.67");
  });
});

describe("Money arithmetic", () => {
  it("sums exactly where floating point would drift", () => {
    // 0.1 + 0.2 !== 0.3 in float; in cents it is simply 10 + 20 === 30.
    const total = Money.sum([
      Money.parse("0.10"),
      Money.parse("0.20"),
    ]);
    expect(total).toBe(30);
    expect(Money.format(total)).toBe("0.30");
  });

  it("stays exact across many line items", () => {
    const lines = Array.from({ length: 1000 }, () => Money.parse("19.99"));
    expect(Money.sum(lines)).toBe(1_999_000);
  });

  it("multiplies by quantity with half-away-from-zero rounding", () => {
    expect(Money.multiply(Money.parse("19.99"), 3)).toBe(5997);
    expect(Money.multiply(Money.fromCents(5), 0.5)).toBe(3);
    expect(Money.multiply(Money.fromCents(-5), 0.5)).toBe(-3);
  });
});

describe("Money.percentOf", () => {
  it("computes tax at a basis-point rate", () => {
    const subtotal = Money.parse("100.00");
    expect(Money.percentOf(subtotal, Rate.fromPercent(8.25))).toBe(825);
  });

  it("rounds a half-cent away from zero", () => {
    // 10.10 at 5% is exactly 0.505 -> 0.51
    expect(Money.percentOf(Money.parse("10.10"), Rate.fromPercent(5))).toBe(51);
  });

  it("caps fees", () => {
    const fee = Money.percentOf(Money.parse("1000.00"), Rate.fromPercent(10));
    expect(fee).toBe(10_000);
    expect(Money.capAt(fee, Money.parse("35.00"))).toBe(3500);
    expect(Money.capAt(fee, null)).toBe(10_000);
  });
});

describe("Money.allocate", () => {
  it("splits without losing or inventing cents", () => {
    const parts = Money.allocate(Money.parse("10.00"), 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(Money.sum(parts)).toBe(1000);
  });

  it("handles negative amounts", () => {
    const parts = Money.allocate(Money.fromCents(-1000), 3);
    expect(Money.sum(parts)).toBe(-1000);
  });

  it("rejects a non-positive split", () => {
    expect(() => Money.allocate(Money.parse("1.00"), 0)).toThrow(MoneyError);
  });
});

describe("Rate", () => {
  it("round-trips percentages", () => {
    expect(Rate.fromPercent(8.25)).toBe(825);
    expect(Rate.toPercent(Rate.fromPercent(8.25))).toBe(8.25);
    expect(Rate.format(Rate.fromPercent(7))).toBe("7%");
    expect(Rate.format(Rate.fromPercent(8.25))).toBe("8.25%");
  });
});
