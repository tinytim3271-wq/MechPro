/**
 * Money is represented as an integer number of cents, never a float.
 *
 * The original MechPro stored every monetary value as a double, which drifts
 * once you multiply by a tax rate and sum line items. Integer cents make the
 * arithmetic exact and the database column (`bigint`) a faithful record.
 *
 * Rates are basis points (1 bps = 0.01%), so 8.25% tax is 825 and is likewise
 * free of float error.
 */

declare const centsBrand: unique symbol;

export type Cents = number & { readonly [centsBrand]: true };

/** Basis points: 1/100th of a percent. 825 bps === 8.25%. */
export type Bps = number & { readonly __bps: true };

const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function assertSafe(value: number, context: string): void {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`${context}: value is not finite (${value})`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${context}: value is not an integer (${value})`);
  }
  if (Math.abs(value) > MAX_SAFE_CENTS) {
    throw new MoneyError(`${context}: value exceeds safe integer range`);
  }
}

/** Round half away from zero, the convention US invoicing expects. */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export const Money = {
  zero: 0 as Cents,

  fromCents(value: number): Cents {
    assertSafe(value, "fromCents");
    return value as Cents;
  },

  /**
   * Parse user input such as "1,234.56", "$1234.5", "-12" into cents.
   * Rejects anything with more than two decimal places rather than silently
   * truncating, so a typo surfaces instead of quietly losing money.
   */
  parse(input: string | number): Cents {
    if (typeof input === "number") {
      if (!Number.isFinite(input)) {
        throw new MoneyError(`parse: value is not finite (${input})`);
      }
      return Money.fromCents(roundHalfAwayFromZero(input * 100));
    }

    const cleaned = input.trim().replace(/[$,\s]/g, "");
    if (cleaned === "") throw new MoneyError("parse: empty value");

    const match = /^(-?)(\d*)(?:\.(\d+))?$/.exec(cleaned);
    if (!match) throw new MoneyError(`parse: not a valid amount (${input})`);

    const [, sign, whole = "", fraction] = match;
    if (whole === "" && fraction === undefined) {
      throw new MoneyError(`parse: not a valid amount (${input})`);
    }
    if (fraction !== undefined && fraction.length > 2) {
      throw new MoneyError(`parse: more than two decimal places (${input})`);
    }

    const cents =
      Number(whole || "0") * 100 + Number((fraction ?? "").padEnd(2, "0"));
    return Money.fromCents(sign === "-" ? -cents : cents);
  },

  toDollars(value: Cents): number {
    return value / 100;
  },

  /** Render as "1,234.56" with no currency symbol. */
  format(value: Cents): string {
    const negative = value < 0;
    const abs = Math.abs(value);
    const whole = Math.trunc(abs / 100);
    const fraction = String(abs % 100).padStart(2, "0");
    const grouped = whole.toLocaleString("en-US");
    return `${negative ? "-" : ""}${grouped}.${fraction}`;
  },

  /** Render as "$1,234.56". */
  formatCurrency(value: Cents): string {
    const negative = value < 0;
    return `${negative ? "-" : ""}$${Money.format(Math.abs(value) as Cents)}`;
  },

  add(a: Cents, b: Cents): Cents {
    return Money.fromCents(a + b);
  },

  subtract(a: Cents, b: Cents): Cents {
    return Money.fromCents(a - b);
  },

  sum(values: readonly Cents[]): Cents {
    let total = 0;
    for (const value of values) total += value;
    return Money.fromCents(total);
  },

  /** Multiply by a whole quantity (e.g. 3 units of a part). */
  multiply(value: Cents, quantity: number): Cents {
    if (!Number.isFinite(quantity)) {
      throw new MoneyError(`multiply: quantity is not finite (${quantity})`);
    }
    return Money.fromCents(roundHalfAwayFromZero(value * quantity));
  },

  /** Apply a basis-point rate, e.g. tax or a shop-supply percentage. */
  percentOf(value: Cents, rate: Bps): Cents {
    return Money.fromCents(roundHalfAwayFromZero((value * rate) / 10_000));
  },

  /** Clamp to a maximum, used for fee caps. */
  capAt(value: Cents, cap: Cents | null | undefined): Cents {
    if (cap === null || cap === undefined) return value;
    return value > cap ? cap : value;
  },

  /**
   * Split an amount into n parts with no cents lost. Remainder pennies are
   * distributed one each to the earliest parts.
   */
  allocate(value: Cents, parts: number): Cents[] {
    if (!Number.isInteger(parts) || parts <= 0) {
      throw new MoneyError(`allocate: parts must be a positive integer`);
    }
    const base = Math.trunc(value / parts);
    let remainder = value - base * parts;
    const step = remainder < 0 ? -1 : 1;
    remainder = Math.abs(remainder);

    return Array.from({ length: parts }, (_, index) =>
      Money.fromCents(base + (index < remainder ? step : 0)),
    );
  },

  isZero: (value: Cents): boolean => value === 0,
  isNegative: (value: Cents): boolean => value < 0,
  isPositive: (value: Cents): boolean => value > 0,
  max: (a: Cents, b: Cents): Cents => (a > b ? a : b),
  min: (a: Cents, b: Cents): Cents => (a < b ? a : b),
} as const;

export const Rate = {
  /** Build a rate from a human percentage, e.g. 8.25 -> 825 bps. */
  fromPercent(percent: number): Bps {
    if (!Number.isFinite(percent)) {
      throw new MoneyError(`fromPercent: value is not finite (${percent})`);
    }
    const bps = roundHalfAwayFromZero(percent * 100);
    if (Math.abs(bps) > 1_000_000) {
      throw new MoneyError(`fromPercent: rate out of range (${percent}%)`);
    }
    return bps as Bps;
  },

  toPercent(bps: Bps): number {
    return bps / 100;
  },

  format(bps: Bps): string {
    const percent = Rate.toPercent(bps);
    return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
  },

  zero: 0 as Bps,
} as const;
