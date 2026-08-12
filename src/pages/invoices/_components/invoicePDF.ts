import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type InvoiceData = {
  invoiceNumber: string;
  issuedAt: string;
  dueAt?: string;
  status: string;
  notes?: string;
  customer: { name: string; phone?: string; email?: string; address?: string; city?: string; state?: string; zip?: string } | null;
  vehicle: { year: string; make: string; model: string; vin?: string; licensePlate?: string } | null;
  ro: {
    roNumber: string;
    complaint: string;
    mileageIn?: number;
    mileageOut?: number;
    laborLines: { description: string; laborHours: number; laborRate: number; techNotes?: string }[];
    partLines: { description: string; partNumber?: string; quantity: number; unitPrice: number }[];
    shopFees: { description: string; amount: number }[];
  } | null;
  org: { name: string; phone?: string; email?: string; address?: string; city?: string; state?: string; zip?: string } | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  payments: { method: string; amount: number; paidAt: string; reference?: string }[];
};

export function generateInvoicePDF(inv: InvoiceData): void {
  const doc = new jsPDF();
  const pageW = 210;
  const margin = 15;
  let y = margin;

  // ── Header bar ───────────────────────────────────────────────────────────
  doc.setFillColor(220, 80, 40); // brand orange
  doc.rect(0, 0, pageW, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("⚙ MechPro", margin, 14);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("INVOICE", pageW - margin, 14, { align: "right" });

  y = 30;

  // ── Shop & Invoice info ───────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(inv.org?.name ?? "Shop", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  if (inv.org?.phone) { y += 5; doc.text(inv.org.phone, margin, y); }
  if (inv.org?.email) { y += 5; doc.text(inv.org.email, margin, y); }
  if (inv.org?.address) {
    y += 5;
    doc.text(
      [inv.org.address, inv.org.city, inv.org.state, inv.org.zip].filter(Boolean).join(", "),
      margin, y
    );
  }

  // Invoice details (right side)
  const rightX = pageW - margin;
  let ry = 30;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Invoice #: ${inv.invoiceNumber}`, rightX, ry, { align: "right" });
  ry += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Date: ${new Date(inv.issuedAt).toLocaleDateString()}`, rightX, ry, { align: "right" });
  if (inv.dueAt) {
    ry += 5;
    doc.text(`Due: ${new Date(inv.dueAt).toLocaleDateString()}`, rightX, ry, { align: "right" });
  }
  ry += 5;
  doc.text(`RO: ${inv.ro?.roNumber ?? ""}`, rightX, ry, { align: "right" });
  ry += 5;
  const statusLabel = inv.status.toUpperCase().replace("_", " ");
  doc.setTextColor(inv.status === "paid" ? 39 : inv.status === "partial" ? 180 : 80,
    inv.status === "paid" ? 174 : inv.status === "partial" ? 100 : 80,
    inv.status === "paid" ? 96 : inv.status === "partial" ? 20 : 80);
  doc.setFont("helvetica", "bold");
  doc.text(`Status: ${statusLabel}`, rightX, ry, { align: "right" });

  y = Math.max(y, ry) + 10;

  // ── Divider ───────────────────────────────────────────────────────────────
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  // ── Bill To & Vehicle ─────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO", margin, y);
  doc.text("VEHICLE", 110, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);

  const billLines: string[] = [];
  if (inv.customer) {
    billLines.push(inv.customer.name);
    if (inv.customer.phone) billLines.push(inv.customer.phone);
    if (inv.customer.email) billLines.push(inv.customer.email);
    const addr = [inv.customer.address, inv.customer.city, inv.customer.state, inv.customer.zip]
      .filter(Boolean).join(", ");
    if (addr) billLines.push(addr);
  }

  const vehLines: string[] = [];
  if (inv.vehicle) {
    vehLines.push(`${inv.vehicle.year} ${inv.vehicle.make} ${inv.vehicle.model}`);
    if (inv.vehicle.vin) vehLines.push(`VIN: ${inv.vehicle.vin}`);
    if (inv.vehicle.licensePlate) vehLines.push(`Plate: ${inv.vehicle.licensePlate}`);
    if (inv.ro?.mileageIn) vehLines.push(`Mileage In: ${inv.ro.mileageIn.toLocaleString()}`);
    if (inv.ro?.mileageOut) vehLines.push(`Mileage Out: ${inv.ro.mileageOut.toLocaleString()}`);
  }

  const maxLines = Math.max(billLines.length, vehLines.length);
  for (let i = 0; i < maxLines; i++) {
    if (billLines[i]) doc.text(billLines[i], margin, y + i * 5);
    if (vehLines[i]) doc.text(vehLines[i], 110, y + i * 5);
  }
  y += maxLines * 5 + 8;

  // ── Complaint ─────────────────────────────────────────────────────────────
  if (inv.ro?.complaint) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("COMPLAINT:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const wrapped = doc.splitTextToSize(inv.ro.complaint, pageW - margin * 2 - 25);
    doc.text(wrapped, margin + 26, y);
    y += (wrapped.length * 4) + 4;
  }

  // ── Labor table ───────────────────────────────────────────────────────────
  if (inv.ro && inv.ro.laborLines.length > 0) {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Labor", margin, y + 2);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Description", "Hours", "Rate", "Amount"]],
      body: inv.ro.laborLines.map((l) => [
        l.description + (l.techNotes ? `\n(${l.techNotes})` : ""),
        l.laborHours.toFixed(1),
        `$${l.laborRate.toFixed(2)}/hr`,
        `$${(l.laborHours * l.laborRate).toFixed(2)}`,
      ]),
      theme: "grid",
      headStyles: { fillColor: [40, 40, 60], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 20, halign: "center" },
        2: { cellWidth: 35, halign: "right" },
        3: { cellWidth: 35, halign: "right" },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }

  // ── Parts table ───────────────────────────────────────────────────────────
  if (inv.ro && inv.ro.partLines.length > 0) {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Parts", margin, y + 2);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Part #", "Description", "Qty", "Unit Price", "Amount"]],
      body: inv.ro.partLines.map((p) => [
        p.partNumber ?? "",
        p.description,
        p.quantity.toString(),
        `$${p.unitPrice.toFixed(2)}`,
        `$${(p.quantity * p.unitPrice).toFixed(2)}`,
      ]),
      theme: "grid",
      headStyles: { fillColor: [40, 40, 60], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 75 },
        2: { cellWidth: 15, halign: "center" },
        3: { cellWidth: 28, halign: "right" },
        4: { cellWidth: 28, halign: "right" },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }

  // ── Shop fees ─────────────────────────────────────────────────────────────
  if (inv.ro && inv.ro.shopFees.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Shop Fees", "Amount"]],
      body: inv.ro.shopFees.map((f) => [f.description, `$${f.amount.toFixed(2)}`]),
      theme: "grid",
      headStyles: { fillColor: [40, 40, 60], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 28, halign: "right" } },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalsX = 130;
  const totalsW = pageW - margin - totalsX;

  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(248, 248, 248);
  doc.rect(totalsX, y, totalsW, inv.taxAmount > 0 ? 30 : 22, "FD");

  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "normal");
  let ty = y + 7;
  doc.text("Subtotal:", totalsX + 4, ty);
  doc.text(`$${inv.subtotal.toFixed(2)}`, pageW - margin - 2, ty, { align: "right" });
  ty += 5;
  if (inv.taxAmount > 0) {
    doc.text("Tax:", totalsX + 4, ty);
    doc.text(`$${inv.taxAmount.toFixed(2)}`, pageW - margin - 2, ty, { align: "right" });
    ty += 5;
  }
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL:", totalsX + 4, ty + 2);
  doc.setTextColor(220, 80, 40);
  doc.text(`$${inv.total.toFixed(2)}`, pageW - margin - 2, ty + 2, { align: "right" });

  y += (inv.taxAmount > 0 ? 30 : 22) + 8;

  // ── Payments ──────────────────────────────────────────────────────────────
  if (inv.payments.length > 0) {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Payments Received:", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    for (const p of inv.payments) {
      doc.text(
        `${new Date(p.paidAt).toLocaleDateString()} · ${p.method.toUpperCase()}${p.reference ? ` (${p.reference})` : ""} — $${p.amount.toFixed(2)}`,
        margin, y
      );
      y += 5;
    }

    const balance = inv.total - inv.amountPaid;
    if (balance > 0) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(200, 60, 40);
      y += 2;
      doc.text(`Balance Due: $${balance.toFixed(2)}`, margin, y);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(39, 174, 96);
      y += 2;
      doc.text("PAID IN FULL", margin, y);
    }
    y += 8;
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (inv.notes) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const noteLines = doc.splitTextToSize(`Note: ${inv.notes}`, pageW - margin * 2);
    doc.text(noteLines, margin, y);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageH = 297;
  doc.setFillColor(220, 80, 40);
  doc.rect(0, pageH - 10, pageW, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("Thank you for your business! — Powered by MechPro", pageW / 2, pageH - 4, { align: "center" });

  doc.save(`${inv.invoiceNumber}.pdf`);
}
