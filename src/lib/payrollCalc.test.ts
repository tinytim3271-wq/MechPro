import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyAdvances,
  calculateEarnings,
  calculatePayStub,
  calculateTaxWithholdings,
  federalIncomeTaxAnnual,
  last4,
  maskSsn,
  round2,
  splitHours,
  yearEndFromStubs,
} from "./payrollCalc.ts";

describe("payrollCalc", () => {
  it("rounds to cents", () => {
    assert.equal(round2(1.235), 1.24);
    assert.equal(round2(10.1 * 0.062), 0.63);
  });

  it("splits overtime above 40 hours", () => {
    assert.deepEqual(splitHours(46), { regularHours: 40, overtimeHours: 6 });
    assert.deepEqual(splitHours(32), { regularHours: 32, overtimeHours: 0 });
  });

  it("pays overtime at 1.5x", () => {
    const e = calculateEarnings({ hours: 46, hourlyRate: 20 });
    assert.equal(e.regularPay, 800);
    assert.equal(e.overtimePay, 180);
    assert.equal(e.grossPay, 980);
  });

  it("uses period salary when no hours are logged", () => {
    const e = calculateEarnings({ hours: 0, hourlyRate: 0, periodSalary: 2500 });
    assert.equal(e.grossPay, 2500);
  });

  it("withholds nothing for 1099 contractors", () => {
    const t = calculateTaxWithholdings({ grossPay: 2000, employmentType: "1099" });
    assert.equal(t.totalTaxes, 0);
    assert.equal(t.federalIncomeTax, 0);
    assert.equal(t.socialSecurityTax, 0);
  });

  it("withholds SS + Medicare + federal + state for W-2", () => {
    const t = calculateTaxWithholdings({
      grossPay: 2000,
      employmentType: "w2",
      frequency: "biweekly",
      stateTaxRate: 0.03,
    });
    assert.equal(t.socialSecurityTax, 124);
    assert.equal(t.medicareTax, 29);
    assert.ok(t.federalIncomeTax > 0);
    assert.equal(t.stateIncomeTax, 60);
    assert.equal(t.totalTaxes, round2(t.federalIncomeTax + 124 + 29 + 60));
  });

  it("caps Social Security at the wage base", () => {
    const t = calculateTaxWithholdings({
      grossPay: 5000,
      employmentType: "w2",
      ytdSocialSecurityWages: 174_000,
    });
    // Room left: 176100 - 174000 = 2100 * 6.2% = 130.20
    assert.equal(t.socialSecurityTax, 130.2);
  });

  it("computes progressive federal tax", () => {
    const low = federalIncomeTaxAnnual(10_000, "single");
    const mid = federalIncomeTaxAnnual(50_000, "single");
    assert.ok(mid > low);
    assert.equal(round2(low), 1000);
  });

  it("applies advances without exceeding net", () => {
    const { applied, total } = applyAdvances(200, [
      { id: "a", description: "Cash advance", remaining: 150, amountPerCheck: 100 },
      { id: "b", description: "Tools", remaining: 80 },
    ]);
    assert.equal(applied.length, 2);
    assert.equal(applied[0].amount, 100);
    assert.equal(applied[1].amount, 80);
    assert.equal(total, 180);
  });

  it("builds a W-2 stub with YTD and advance deduction", () => {
    const stub = calculatePayStub({
      employmentType: "w2",
      hours: 40,
      hourlyRate: 25,
      ytdGross: 10_000,
      ytdDeductions: 2500,
      ytdNet: 7500,
      advances: [{ id: "adv1", description: "Uniform", remaining: 40, amountPerCheck: 40 }],
    });
    assert.equal(stub.grossPay, 1000);
    assert.ok(stub.deductions.total > 40);
    assert.equal(stub.deductions.advances, 40);
    assert.equal(stub.netPay, round2(stub.grossPay - stub.deductions.total));
    assert.equal(stub.yearToDate.grossPay, 11_000);
  });

  it("builds a 1099 stub with gross = net minus advances only", () => {
    const stub = calculatePayStub({
      employmentType: "1099",
      hours: 20,
      hourlyRate: 50,
      advances: [{ id: "loan", description: "Loan", remaining: 50, amountPerCheck: 50 }],
    });
    assert.equal(stub.grossPay, 1000);
    assert.equal(stub.deductions.federalIncomeTax, 0);
    assert.equal(stub.deductions.advances, 50);
    assert.equal(stub.netPay, 950);
  });

  it("rolls stubs into W-2 and 1099 year-end boxes", () => {
    const w2 = yearEndFromStubs("w2", [
      { grossPay: 1000, deductions: { federalIncomeTax: 80, socialSecurityTax: 62, medicareTax: 14.5 } },
      { grossPay: 1000, deductions: { federalIncomeTax: 80, socialSecurityTax: 62, medicareTax: 14.5 } },
    ]);
    assert.equal(w2.wages, 2000);
    assert.equal(w2.federalWithheld, 160);
    assert.equal(w2.nonemployeeCompensation, 0);

    const nec = yearEndFromStubs("1099", [
      { grossPay: 3000, deductions: { federalIncomeTax: 0, socialSecurityTax: 0, medicareTax: 0 } },
    ]);
    assert.equal(nec.nonemployeeCompensation, 3000);
    assert.equal(nec.wages, 0);
  });

  it("extracts last-4 identifiers only", () => {
    assert.equal(last4("123-45-6789"), "6789");
    assert.equal(maskSsn("6789"), "***-**-6789");
    assert.equal(last4("12"), null);
  });
});
