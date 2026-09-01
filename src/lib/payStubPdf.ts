import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type PayStubPdfData = {
  stubId: string;
  employeeName: string;
  employmentType: string;
  ssnMasked?: string | null;
  jobTitle?: string | null;
  payAddress?: string | null;
  orgName: string;
  orgAddress?: string;
  checkDate: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  regularHours: number;
  overtimeHours: number;
  regularRate: number;
  overtimeRate: number;
  regularPay: number;
  overtimePay: number;
  bonusOrOther: number;
  grossPay: number;
  federalIncomeTax: number;
  socialSecurityTax: number;
  medicareTax: number;
  stateIncomeTax: number;
  otherDeductions: number;
  advancesDeducted: number;
  totalDeductions: number;
  netPay: number;
  ytdGross: number;
  ytdDeductions: number;
  ytdNet: number;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function downloadPayStubPdf(stub: PayStubPdfData): void {
  const doc = new jsPDF();
  const pageW = 210;
  const margin = 15;

  doc.setFillColor(220, 80, 40);
  doc.rect(0, 0, pageW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("MechPro", margin, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("PAY STUB", pageW - margin, 14, { align: "right" });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(stub.orgName, margin, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  if (stub.orgAddress) doc.text(stub.orgAddress, margin, 37);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`Employee: ${stub.employeeName}`, margin, 48);
  doc.text(`Type: ${stub.employmentType.toUpperCase()}`, margin, 54);
  if (stub.ssnMasked) doc.text(`SSN: ${stub.ssnMasked}`, margin, 60);
  if (stub.jobTitle) doc.text(`Title: ${stub.jobTitle}`, margin, 66);

  doc.text(`Check date: ${stub.checkDate}`, pageW - margin, 48, { align: "right" });
  doc.text(`Period: ${stub.payPeriodStart} – ${stub.payPeriodEnd}`, pageW - margin, 54, { align: "right" });

  autoTable(doc, {
    startY: 74,
    head: [["Earnings", "Hours", "Rate", "Amount"]],
    body: [
      ["Regular", stub.regularHours.toFixed(2), money(stub.regularRate), money(stub.regularPay)],
      ["Overtime", stub.overtimeHours.toFixed(2), money(stub.overtimeRate), money(stub.overtimePay)],
      ["Other", "—", "—", money(stub.bonusOrOther)],
      ["Gross", "", "", money(stub.grossPay)],
    ],
    theme: "grid",
    headStyles: { fillColor: [40, 40, 40] },
  });

  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
    head: [["Deductions", "This period"]],
    body: [
      ["Federal income tax", money(stub.federalIncomeTax)],
      ["Social Security", money(stub.socialSecurityTax)],
      ["Medicare", money(stub.medicareTax)],
      ["State income tax", money(stub.stateIncomeTax)],
      ["Advances / loans", money(stub.advancesDeducted)],
      ["Other", money(stub.otherDeductions)],
      ["Total deductions", money(stub.totalDeductions)],
    ],
    theme: "grid",
    headStyles: { fillColor: [40, 40, 40] },
  });

  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Net pay: ${money(stub.netPay)}`, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `YTD gross ${money(stub.ytdGross)}  ·  YTD deductions ${money(stub.ytdDeductions)}  ·  YTD net ${money(stub.ytdNet)}`,
    margin,
    y + 8,
  );
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "Estimate for shop records. Confirm withholdings with a payroll processor or CPA before filing.",
    margin,
    y + 16,
  );

  doc.save(`pay-stub-${stub.checkDate}-${stub.employeeName.replace(/\s+/g, "-")}.pdf`);
}
