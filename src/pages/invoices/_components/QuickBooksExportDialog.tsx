import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog.tsx";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/export-csv.ts";
import { format, subDays } from "date-fns";

type ExportInvoice = {
  invoiceNumber: string;
  status: string;
  issuedAt: string;
  dueAt?: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  payments: Array<{ method: string; amount: number; paidAt: string; reference?: string }>;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  roNumber: string;
  laborLines: Array<{ description: string; laborHours: number; laborRate: number }>;
  partLines: Array<{ description: string; quantity: number; unitCost: number; unitPrice: number; partNumber?: string }>;
  shopFees: Array<{ description: string; amount: number }>;
  vehicleSummary: string;
};

/**
 * Transforms invoice data into QuickBooks Online Invoice import format.
 * Each line item becomes a separate row. Rows share the same InvoiceNo for grouping.
 * Reference: https://quickbooks.intuit.com/learn-support/en-us/import-or-export-data/
 */
function buildQuickBooksRows(invoices: ExportInvoice[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];

  for (const inv of invoices) {
    const issueDate = format(new Date(inv.issuedAt), "MM/dd/yyyy");
    const dueDate = inv.dueAt ? format(new Date(inv.dueAt), "MM/dd/yyyy") : issueDate;

    const baseRow = {
      InvoiceNo: inv.invoiceNumber,
      Customer: inv.customerName,
      InvoiceDate: issueDate,
      DueDate: dueDate,
      Memo: `RO: ${inv.roNumber} | ${inv.vehicleSummary}`,
    };

    // Labor lines → Service items
    for (const labor of inv.laborLines) {
      rows.push({
        ...baseRow,
        ItemName: "Labor",
        ItemDescription: labor.description,
        ItemQuantity: labor.laborHours,
        ItemRate: labor.laborRate,
        ItemAmount: Number((labor.laborHours * labor.laborRate).toFixed(2)),
        ItemAccountRef: "Service Revenue",
        ItemTaxCode: "",
      });
    }

    // Part lines → Product/Inventory items
    for (const part of inv.partLines) {
      rows.push({
        ...baseRow,
        ItemName: part.partNumber || "Parts",
        ItemDescription: part.description,
        ItemQuantity: part.quantity,
        ItemRate: part.unitPrice,
        ItemAmount: Number((part.quantity * part.unitPrice).toFixed(2)),
        ItemAccountRef: "Parts Revenue",
        ItemTaxCode: "",
      });
    }

    // Shop fees → Other charges
    for (const fee of inv.shopFees) {
      rows.push({
        ...baseRow,
        ItemName: "Shop Fees",
        ItemDescription: fee.description,
        ItemQuantity: 1,
        ItemRate: fee.amount,
        ItemAmount: fee.amount,
        ItemAccountRef: "Shop Fees Revenue",
        ItemTaxCode: "",
      });
    }

    // Tax as a line item if present
    if (inv.taxAmount > 0) {
      rows.push({
        ...baseRow,
        ItemName: "Sales Tax",
        ItemDescription: "Sales Tax",
        ItemQuantity: 1,
        ItemRate: inv.taxAmount,
        ItemAmount: inv.taxAmount,
        ItemAccountRef: "Sales Tax Payable",
        ItemTaxCode: "TAX",
      });
    }

    // If no line items at all, add a single row with the total
    if (inv.laborLines.length === 0 && inv.partLines.length === 0 && inv.shopFees.length === 0 && inv.taxAmount === 0) {
      rows.push({
        ...baseRow,
        ItemName: "Service",
        ItemDescription: "Automotive Service",
        ItemQuantity: 1,
        ItemRate: inv.total,
        ItemAmount: inv.total,
        ItemAccountRef: "Service Revenue",
        ItemTaxCode: "",
      });
    }
  }

  return rows;
}

export default function QuickBooksExportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);

  const invoices = useQuery(
    api.invoices.getInvoicesForExport,
    open ? { startDate, endDate } : "skip"
  );

  const handleExport = () => {
    if (!invoices || invoices.length === 0) {
      toast.error("No invoices found for the selected date range");
      return;
    }

    const rows = buildQuickBooksRows(invoices as ExportInvoice[]);
    const filename = `quickbooks-export-${startDate}-to-${endDate}.csv`;
    downloadCsv(rows, filename);
    toast.success(`Exported ${invoices.length} invoice(s) to QuickBooks CSV`);
    onClose();
  };

  const paidCount = invoices?.filter((i) => i.status === "paid").length ?? 0;
  const totalAmount = invoices?.reduce((sum, i) => sum + i.total, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-primary" />
            Export to QuickBooks
          </DialogTitle>
          <DialogDescription>
            Export invoices as a CSV formatted for QuickBooks Online import. Select a date range below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={endDate}
              />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                max={today}
              />
            </div>
          </div>

          {/* Preview summary */}
          {invoices !== undefined && (
            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <p className="text-sm font-medium text-foreground">
                {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} found
              </p>
              <p className="text-xs text-muted-foreground">
                {paidCount} paid | Total: ${totalAmount.toFixed(2)}
              </p>
            </div>
          )}

          {invoices === undefined && open && (
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">Loading invoices...</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={!invoices || invoices.length === 0}
            className="cursor-pointer"
          >
            <Download size={14} className="mr-1.5" />
            Export CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
