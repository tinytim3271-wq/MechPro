/**
 * Small-shop payroll engine (W-2 / 1099).
 *
 * Ported from Reliable Shop Systems generate-payroll + payStubGenerator
 * behavior, with progressive federal brackets instead of a flat 12%.
 * This is an estimate for shop owners — not a substitute for a CPA or
 * a full payroll processor (no FUTA, SUTA, or per-state withholding tables).
 */

export type EmploymentType = "w2" | "1099";
export type FilingStatus = "single" | "married" | "headOfHousehold";
export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

/** 2026 Social Security wage base (taxable wages). */
export const SS_WAGE_BASE = 176_100;
export const SS_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;
export const DEFAULT_STATE_TAX_RATE = 0.03;
export const DEFAULT_OVERTIME_MULTIPLIER = 1.5;
export const OVERTIME_WEEKLY_THRESHOLD = 40;

const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 15_000,
  married: 30_000,
  headOfHousehold: 22_500,
};

/** 2026 ordinary-income brackets (approximate, for withholding estimates). */
const FEDERAL_BRACKETS: Record<FilingStatus, Array<{ upTo: number; rate: number }>> = {
  single: [
    { upTo: 11_925, rate: 0.1 },
    { upTo: 48_475, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_525, rate: 0.32 },
    { upTo: 626_350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  married: [
    { upTo: 23_850, rate: 0.1 },
    { upTo: 96_950, rate: 0.12 },
    { upTo: 206_700, rate: 0.22 },
    { upTo: 394_600, rate: 0.24 },
    { upTo: 501_050, rate: 0.32 },
    { upTo: 751_600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  headOfHousehold: [
    { upTo: 17_000, rate: 0.1 },
    { upTo: 64_850, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_500, rate: 0.32 },
    { upTo: 626_350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
};

export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function last4(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

export function maskSsn(lastFour: string | null | undefined): string | null {
  if (!lastFour || lastFour.length !== 4) return null;
  return `***-**-${lastFour}`;
}

export function splitHours(
  totalHours: number,
  overtimeThreshold = OVERTIME_WEEKLY_THRESHOLD,
): { regularHours: number; overtimeHours: number } {
  const hours = Math.max(0, totalHours);
  const regularHours = round2(Math.min(hours, overtimeThreshold));
  const overtimeHours = round2(Math.max(0, hours - overtimeThreshold));
  return { regularHours, overtimeHours };
}

export function federalIncomeTaxAnnual(taxableIncome: number, filingStatus: FilingStatus): number {
  const brackets = FEDERAL_BRACKETS[filingStatus];
  let tax = 0;
  let remaining = Math.max(0, taxableIncome);
  let prev = 0;
  for (const b of brackets) {
    const slice = Math.min(remaining, b.upTo - prev);
    if (slice <= 0) break;
    tax += slice * b.rate;
    remaining -= slice;
    prev = b.upTo;
  }
  return tax;
}

export function federalWithholdingForPeriod(
  grossPay: number,
  filingStatus: FilingStatus,
  frequency: PayFrequency,
): number {
  const periods = PERIODS_PER_YEAR[frequency];
  const annualGross = grossPay * periods;
  const taxable = Math.max(0, annualGross - STANDARD_DEDUCTION[filingStatus]);
  return round2(federalIncomeTaxAnnual(taxable, filingStatus) / periods);
}

export type TaxWithholding = {
  federalIncomeTax: number;
  socialSecurityTax: number;
  medicareTax: number;
  stateIncomeTax: number;
  totalTaxes: number;
};

export function calculateTaxWithholdings(opts: {
  grossPay: number;
  employmentType: EmploymentType;
  filingStatus?: FilingStatus;
  frequency?: PayFrequency;
  stateTaxRate?: number;
  ytdSocialSecurityWages?: number;
}): TaxWithholding {
  const {
    grossPay,
    employmentType,
    filingStatus = "single",
    frequency = "biweekly",
    stateTaxRate = DEFAULT_STATE_TAX_RATE,
    ytdSocialSecurityWages = 0,
  } = opts;

  if (employmentType === "1099" || grossPay <= 0) {
    return {
      federalIncomeTax: 0,
      socialSecurityTax: 0,
      medicareTax: 0,
      stateIncomeTax: 0,
      totalTaxes: 0,
    };
  }

  const ssRoom = Math.max(0, SS_WAGE_BASE - ytdSocialSecurityWages);
  const ssWages = Math.min(grossPay, ssRoom);
  const socialSecurityTax = round2(ssWages * SS_RATE);
  const medicareTax = round2(grossPay * MEDICARE_RATE);
  const federalIncomeTax = federalWithholdingForPeriod(grossPay, filingStatus, frequency);
  const stateIncomeTax = round2(grossPay * stateTaxRate);
  const totalTaxes = round2(federalIncomeTax + socialSecurityTax + medicareTax + stateIncomeTax);

  return { federalIncomeTax, socialSecurityTax, medicareTax, stateIncomeTax, totalTaxes };
}

export type EarningsInput = {
  hours: number;
  hourlyRate: number;
  overtimeMultiplier?: number;
  overtimeThreshold?: number;
  bonusOrOther?: number;
  /** Salaried employees: period salary used when hours are 0. */
  periodSalary?: number;
};

export type Earnings = {
  regularHours: number;
  overtimeHours: number;
  regularRate: number;
  overtimeRate: number;
  regularPay: number;
  overtimePay: number;
  bonusOrOther: number;
  grossPay: number;
};

export function calculateEarnings(input: EarningsInput): Earnings {
  const rate = Math.max(0, input.hourlyRate);
  const multiplier = input.overtimeMultiplier ?? DEFAULT_OVERTIME_MULTIPLIER;
  const { regularHours, overtimeHours } = splitHours(
    input.hours,
    input.overtimeThreshold ?? OVERTIME_WEEKLY_THRESHOLD,
  );
  let regularPay = round2(regularHours * rate);
  const overtimeRate = round2(rate * multiplier);
  const overtimePay = round2(overtimeHours * overtimeRate);
  const bonusOrOther = round2(input.bonusOrOther ?? 0);

  if (regularHours === 0 && overtimeHours === 0 && (input.periodSalary ?? 0) > 0) {
    regularPay = round2(input.periodSalary!);
  }

  const grossPay = round2(regularPay + overtimePay + bonusOrOther);
  return {
    regularHours,
    overtimeHours,
    regularRate: rate,
    overtimeRate,
    regularPay,
    overtimePay,
    bonusOrOther,
    grossPay,
  };
}

export type AdvanceDeduction = {
  id: string;
  description: string;
  remaining: number;
  amountPerCheck?: number;
};

export function applyAdvances(
  grossAfterTax: number,
  advances: AdvanceDeduction[],
): { applied: Array<{ id: string; description: string; amount: number }>; total: number } {
  const applied: Array<{ id: string; description: string; amount: number }> = [];
  let remainingPay = Math.max(0, grossAfterTax);
  let total = 0;
  for (const adv of advances) {
    if (remainingPay <= 0) break;
    const remaining = Math.max(0, adv.remaining);
    if (remaining <= 0) continue;
    const cap = adv.amountPerCheck && adv.amountPerCheck > 0 ? adv.amountPerCheck : remaining;
    const amount = round2(Math.min(remaining, cap, remainingPay));
    if (amount <= 0) continue;
    applied.push({ id: adv.id, description: adv.description, amount });
    total = round2(total + amount);
    remainingPay = round2(remainingPay - amount);
  }
  return { applied, total };
}

export type PayStubCalcInput = {
  employmentType: EmploymentType;
  hours: number;
  hourlyRate: number;
  overtimeMultiplier?: number;
  overtimeThreshold?: number;
  bonusOrOther?: number;
  periodSalary?: number;
  filingStatus?: FilingStatus;
  frequency?: PayFrequency;
  stateTaxRate?: number;
  ytdGross?: number;
  ytdDeductions?: number;
  ytdNet?: number;
  ytdSocialSecurityWages?: number;
  advances?: AdvanceDeduction[];
  otherDeductions?: number;
};

export type PayStubCalc = Earnings & {
  employmentType: EmploymentType;
  deductions: {
    federalIncomeTax: number;
    socialSecurityTax: number;
    medicareTax: number;
    stateIncomeTax: number;
    other: number;
    advances: number;
    advancesDetail: Array<{ id: string; description: string; amount: number }>;
    total: number;
  };
  netPay: number;
  yearToDate: {
    grossPay: number;
    deductions: number;
    netPay: number;
  };
};

export function calculatePayStub(input: PayStubCalcInput): PayStubCalc {
  const earnings = calculateEarnings({
    hours: input.hours,
    hourlyRate: input.hourlyRate,
    overtimeMultiplier: input.overtimeMultiplier,
    overtimeThreshold: input.overtimeThreshold,
    bonusOrOther: input.bonusOrOther,
    periodSalary: input.periodSalary,
  });

  const taxes = calculateTaxWithholdings({
    grossPay: earnings.grossPay,
    employmentType: input.employmentType,
    filingStatus: input.filingStatus,
    frequency: input.frequency,
    stateTaxRate: input.stateTaxRate,
    ytdSocialSecurityWages: input.ytdSocialSecurityWages,
  });

  const other = round2(Math.max(0, input.otherDeductions ?? 0));
  const afterTax = round2(Math.max(0, earnings.grossPay - taxes.totalTaxes - other));
  const advances = applyAdvances(afterTax, input.advances ?? []);
  const totalDeductions = round2(taxes.totalTaxes + other + advances.total);
  const netPay = round2(Math.max(0, earnings.grossPay - totalDeductions));

  const ytdGross = round2((input.ytdGross ?? 0) + earnings.grossPay);
  const ytdDeductions = round2((input.ytdDeductions ?? 0) + totalDeductions);
  const ytdNet = round2((input.ytdNet ?? 0) + netPay);

  return {
    ...earnings,
    employmentType: input.employmentType,
    deductions: {
      federalIncomeTax: taxes.federalIncomeTax,
      socialSecurityTax: taxes.socialSecurityTax,
      medicareTax: taxes.medicareTax,
      stateIncomeTax: taxes.stateIncomeTax,
      other,
      advances: advances.total,
      advancesDetail: advances.applied,
      total: totalDeductions,
    },
    netPay,
    yearToDate: {
      grossPay: ytdGross,
      deductions: ytdDeductions,
      netPay: ytdNet,
    },
  };
}

export type YearEndBoxes = {
  wages: number;
  federalWithheld: number;
  socialSecurityWages: number;
  socialSecurityWithheld: number;
  medicareWages: number;
  medicareWithheld: number;
  nonemployeeCompensation: number;
};

export function yearEndFromStubs(
  employmentType: EmploymentType,
  stubs: Array<{
    grossPay: number;
    deductions: {
      federalIncomeTax: number;
      socialSecurityTax: number;
      medicareTax: number;
    };
  }>,
): YearEndBoxes {
  const wages = round2(stubs.reduce((s, x) => s + x.grossPay, 0));
  const federalWithheld = round2(stubs.reduce((s, x) => s + x.deductions.federalIncomeTax, 0));
  const socialSecurityWithheld = round2(stubs.reduce((s, x) => s + x.deductions.socialSecurityTax, 0));
  const medicareWithheld = round2(stubs.reduce((s, x) => s + x.deductions.medicareTax, 0));
  if (employmentType === "1099") {
    return {
      wages: 0,
      federalWithheld: 0,
      socialSecurityWages: 0,
      socialSecurityWithheld: 0,
      medicareWages: 0,
      medicareWithheld: 0,
      nonemployeeCompensation: wages,
    };
  }
  return {
    wages,
    federalWithheld,
    socialSecurityWages: wages,
    socialSecurityWithheld,
    medicareWages: wages,
    medicareWithheld,
    nonemployeeCompensation: 0,
  };
}
