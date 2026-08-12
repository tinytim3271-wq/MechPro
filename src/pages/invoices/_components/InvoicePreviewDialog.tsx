import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Eye, Pencil, Save, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";

// ─── Types ──────────────────────────────────────────────────────────────────

type LaborLine = {
  description: string;
  laborHours: number;
  laborRate: number;
  techNotes?: string;
};

type PartLine = {
  description: string;
  partNumber?: string;
  quantity: number;
  unitPrice: number;
};

type ShopFee = {
  description: string;
  amount: number;
};

type InvoicePreviewData = {
  invoiceId: Id<"invoices">;
  roId?: Id<"repairOrders">;
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
    laborLines: LaborLine[];
    partLines: PartLine[];
    shopFees: ShopFee[];
  } | null;
  org: { name: string; phone?: string; email?: string; address?: string; city?: string; state?: string; zip?: string } | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  payments: { method: string; amount: number; paidAt: string; reference?: string }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  data: InvoicePreviewData;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

// ─── Main Dialog ────────────────────────────────────────────────────────────

export default function InvoicePreviewDialog({ open, onClose, data }: Props) {
  const updateNotes = useMutation(api.invoices.updateInvoiceNotes);

  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(data.notes ?? "");
  const [saving, setSaving] = useState(false);

  const balance = data.total - data.amountPaid;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateNotes({ invoiceId: data.invoiceId, notes });
      toast.success("Invoice notes updated");
      setEditing(false);
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setNotes(data.notes ?? "");
    setEditing(false);
  };

  const statusColor =
    data.status === "paid" ? "text-green-600" :
    data.status === "partial" ? "text-yellow-600" :
    data.status === "void" ? "text-red-600" :
    "text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye size={16} className="text-primary" />
              Invoice Preview
            </DialogTitle>
            <div className="flex gap-1.5">
              {editing ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs cursor-pointer"
                    onClick={handleCancel}
                  >
                    <X size={11} className="mr-1" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs cursor-pointer"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    <Save size={11} className="mr-1" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs cursor-pointer"
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={11} className="mr-1" /> Edit Notes
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            This is how the invoice will appear when sent to the customer.
          </p>
        </DialogHeader>

        {/* Invoice preview — HTML render of the PDF layout */}
        <div className="p-4">
          <div className="bg-white text-black rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Header bar */}
            <div className="bg-[#DC5028] px-6 py-3 flex items-center justify-between">
              <span className="text-white font-bold text-lg">
                {data.org?.name ?? "Shop"}
              </span>
              <span className="text-white/90 text-sm font-medium">INVOICE</span>
            </div>

            <div className="p-6 space-y-5">
              {/* Shop info & Invoice meta */}
              <div className="flex justify-between gap-4">
                <div className="text-sm space-y-0.5">
                  <p className="font-bold text-gray-900">{data.org?.name ?? "Shop"}</p>
                  {data.org?.phone && <p className="text-gray-600">{data.org.phone}</p>}
                  {data.org?.email && <p className="text-gray-600">{data.org.email}</p>}
                  {data.org?.address && (
                    <p className="text-gray-600">
                      {[data.org.address, data.org.city, data.org.state, data.org.zip].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <div className="text-sm text-right space-y-0.5">
                  <p className="font-bold text-gray-900">Invoice #: {data.invoiceNumber}</p>
                  <p className="text-gray-600">Date: {new Date(data.issuedAt).toLocaleDateString()}</p>
                  {data.dueAt && <p className="text-gray-600">Due: {new Date(data.dueAt).toLocaleDateString()}</p>}
                  {data.ro && <p className="text-gray-600">RO: {data.ro.roNumber}</p>}
                  <p className={cn("font-bold uppercase", statusColor)}>
                    Status: {data.status.replace("_", " ")}
                  </p>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200" />

              {/* Bill To & Vehicle */}
              <div className="grid grid-cols-2 gap-6">
                <div className="text-sm space-y-0.5">
                  <p className="text-xs font-bold text-gray-500 uppercase">Bill To</p>
                  {data.customer && (
                    <>
                      <p className="text-gray-900">{data.customer.name}</p>
                      {data.customer.phone && <p className="text-gray-600">{data.customer.phone}</p>}
                      {data.customer.email && <p className="text-gray-600">{data.customer.email}</p>}
                      {data.customer.address && (
                        <p className="text-gray-600">
                          {[data.customer.address, data.customer.city, data.customer.state, data.customer.zip].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="text-sm space-y-0.5">
                  <p className="text-xs font-bold text-gray-500 uppercase">Vehicle</p>
                  {data.vehicle && (
                    <>
                      <p className="text-gray-900">{data.vehicle.year} {data.vehicle.make} {data.vehicle.model}</p>
                      {data.vehicle.vin && <p className="text-gray-600">VIN: {data.vehicle.vin}</p>}
                      {data.vehicle.licensePlate && <p className="text-gray-600">Plate: {data.vehicle.licensePlate}</p>}
                      {data.ro?.mileageIn && <p className="text-gray-600">Mileage In: {data.ro.mileageIn.toLocaleString()}</p>}
                      {data.ro?.mileageOut && <p className="text-gray-600">Mileage Out: {data.ro.mileageOut.toLocaleString()}</p>}
                    </>
                  )}
                </div>
              </div>

              {/* Complaint */}
              {data.ro?.complaint && (
                <div className="text-sm">
                  <span className="font-bold text-gray-700">Complaint: </span>
                  <span className="text-gray-600">{data.ro.complaint}</span>
                </div>
              )}

              {/* Labor table */}
              {data.ro && data.ro.laborLines.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-bold text-gray-900">Labor</p>
                  <table className="w-full text-sm border border-gray-200">
                    <thead>
                      <tr className="bg-gray-800 text-white text-xs">
                        <th className="text-left px-2 py-1.5">Description</th>
                        <th className="text-center px-2 py-1.5 w-16">Hours</th>
                        <th className="text-right px-2 py-1.5 w-24">Rate</th>
                        <th className="text-right px-2 py-1.5 w-24">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ro.laborLines.map((l, i) => (
                        <tr key={i} className="border-t border-gray-200">
                          <td className="px-2 py-1.5 text-gray-700">
                            {l.description}
                            {l.techNotes && <span className="block text-xs text-gray-500">({l.techNotes})</span>}
                          </td>
                          <td className="text-center px-2 py-1.5 text-gray-600">{l.laborHours.toFixed(1)}</td>
                          <td className="text-right px-2 py-1.5 text-gray-600">${l.laborRate.toFixed(2)}/hr</td>
                          <td className="text-right px-2 py-1.5 text-gray-900 font-medium">
                            ${(l.laborHours * l.laborRate).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Parts table */}
              {data.ro && data.ro.partLines.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-bold text-gray-900">Parts</p>
                  <table className="w-full text-sm border border-gray-200">
                    <thead>
                      <tr className="bg-gray-800 text-white text-xs">
                        <th className="text-left px-2 py-1.5">Part #</th>
                        <th className="text-left px-2 py-1.5">Description</th>
                        <th className="text-center px-2 py-1.5 w-12">Qty</th>
                        <th className="text-right px-2 py-1.5 w-24">Unit Price</th>
                        <th className="text-right px-2 py-1.5 w-24">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ro.partLines.map((p, i) => (
                        <tr key={i} className="border-t border-gray-200">
                          <td className="px-2 py-1.5 text-gray-600 font-mono text-xs">{p.partNumber ?? ""}</td>
                          <td className="px-2 py-1.5 text-gray-700">{p.description}</td>
                          <td className="text-center px-2 py-1.5 text-gray-600">{p.quantity}</td>
                          <td className="text-right px-2 py-1.5 text-gray-600">${p.unitPrice.toFixed(2)}</td>
                          <td className="text-right px-2 py-1.5 text-gray-900 font-medium">
                            ${(p.quantity * p.unitPrice).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Shop fees */}
              {data.ro && data.ro.shopFees.length > 0 && (
                <div className="space-y-1">
                  <table className="w-full text-sm border border-gray-200">
                    <thead>
                      <tr className="bg-gray-800 text-white text-xs">
                        <th className="text-left px-2 py-1.5">Shop Fees</th>
                        <th className="text-right px-2 py-1.5 w-24">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ro.shopFees.map((f, i) => (
                        <tr key={i} className="border-t border-gray-200">
                          <td className="px-2 py-1.5 text-gray-700">{f.description}</td>
                          <td className="text-right px-2 py-1.5 text-gray-900 font-medium">${f.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals */}
              <div className="flex justify-end">
                <div className="border border-gray-200 bg-gray-50 rounded px-4 py-3 w-56 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal:</span>
                    <span>${data.subtotal.toFixed(2)}</span>
                  </div>
                  {data.taxAmount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Tax:</span>
                      <span>${data.taxAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base text-gray-900 border-t border-gray-200 pt-1">
                    <span>TOTAL:</span>
                    <span className="text-[#DC5028]">${data.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Payments */}
              {data.payments.length > 0 && (
                <div className="space-y-1 text-sm">
                  <p className="font-bold text-gray-700">Payments Received:</p>
                  {data.payments.map((p, i) => (
                    <p key={i} className="text-gray-600">
                      {new Date(p.paidAt).toLocaleDateString()} - {p.method.toUpperCase()}
                      {p.reference ? ` (${p.reference})` : ""} — ${p.amount.toFixed(2)}
                    </p>
                  ))}
                  {balance > 0 ? (
                    <p className="font-bold text-red-600 pt-1">Balance Due: ${balance.toFixed(2)}</p>
                  ) : (
                    <p className="font-bold text-green-600 pt-1">PAID IN FULL</p>
                  )}
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1">
                {editing ? (
                  <div className="space-y-1.5 bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <Label className="text-xs text-blue-700 font-semibold">Invoice Notes (editable)</Label>
                    <Textarea
                      placeholder="Add notes for the customer..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="bg-white border-blue-200 text-gray-700"
                    />
                  </div>
                ) : (
                  notes && (
                    <p className="text-xs italic text-gray-500">Note: {notes}</p>
                  )
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-[#DC5028] px-6 py-2 text-center">
              <p className="text-white/90 text-[10px]">
                Thank you for your business! — Powered by MechPro
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
