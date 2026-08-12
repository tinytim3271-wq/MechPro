import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Package, Truck, ShoppingCart, Sparkles, Plus, Search,
  AlertTriangle, ChevronDown, ChevronUp, Check, X, Pencil,
  Trash2, RefreshCw, Download, Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

type Part = {
  _id: Id<"parts">;
  name: string;
  partNumber?: string;
  sku?: string;
  category?: string;
  stockQty: number;
  lowStockThreshold: number;
  unitCost: number;
  unitPrice: number;
  supplier?: string;
  location?: string;
  description?: string;
};

type Supplier = {
  _id: Id<"suppliers">;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  website?: string;
  accountNumber?: string;
  notes?: string;
  isActive: boolean;
};

type POLine = {
  partId?: string;
  partNumber?: string;
  description: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
};

type PurchaseOrder = {
  _id: Id<"purchaseOrders">;
  poNumber: string;
  supplierId: Id<"suppliers">;
  supplierName: string;
  status: "draft" | "sent" | "partial" | "received" | "cancelled";
  lines: POLine[];
  subtotal: number;
  notes?: string;
  aiGenerated?: boolean;
  aiReason?: string;
  orderedAt?: string;
  expectedAt?: string;
  receivedAt?: string;
};

type AISuggestion = {
  supplierId: string;
  supplierName: string;
  summary: string;
  lines: Array<{
    partId: string;
    partNumber: string;
    description: string;
    currentStock: number;
    suggestedQty: number;
    unitCost: number;
    reason: string;
  }>;
  totalCost: number;
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

function POStatusBadge({ status }: { status: PurchaseOrder["status"] }) {
  const map: Record<PurchaseOrder["status"], { label: string; class: string }> = {
    draft: { label: "Draft", class: "bg-muted text-muted-foreground" },
    sent: { label: "Sent", class: "bg-blue-500/20 text-blue-400" },
    partial: { label: "Partial", class: "bg-yellow-500/20 text-yellow-400" },
    received: { label: "Received", class: "bg-green-500/20 text-green-400" },
    cancelled: { label: "Cancelled", class: "bg-destructive/20 text-destructive" },
  };
  const { label, class: cls } = map[status];
  return <span className={cn("px-2 py-0.5 rounded text-xs font-medium", cls)}>{label}</span>;
}

// ─── Part Form Dialog ─────────────────────────────────────────────────────────

function PartFormDialog({
  open, onOpenChange, part,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  part?: Part | null;
}) {
  const createPart = useMutation(api.parts.createPart);
  const updatePart = useMutation(api.parts.updatePart);
  const [form, setForm] = useState({
    name: part?.name ?? "",
    partNumber: part?.partNumber ?? "",
    sku: part?.sku ?? "",
    category: part?.category ?? "",
    stockQty: String(part?.stockQty ?? 0),
    lowStockThreshold: String(part?.lowStockThreshold ?? 2),
    unitCost: String(part?.unitCost ?? 0),
    unitPrice: String(part?.unitPrice ?? 0),
    supplier: part?.supplier ?? "",
    location: part?.location ?? "",
    description: part?.description ?? "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Part name is required"); return; }
    setSaving(true);
    try {
      const data = {
        name: form.name,
        partNumber: form.partNumber || undefined,
        sku: form.sku || undefined,
        category: form.category || undefined,
        stockQty: Number(form.stockQty),
        lowStockThreshold: Number(form.lowStockThreshold),
        unitCost: Number(form.unitCost),
        unitPrice: Number(form.unitPrice),
        supplier: form.supplier || undefined,
        location: form.location || undefined,
        description: form.description || undefined,
      };
      if (part) {
        await updatePart({ partId: part._id, ...data });
        toast.success("Part updated");
      } else {
        await createPart(data);
        toast.success("Part added");
      }
      onOpenChange(false);
    } catch {
      toast.error("Failed to save part");
    } finally {
      setSaving(false);
    }
  };

  const f = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{part ? "Edit Part" : "Add Part"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Part Name *</Label>
              <Input value={form.name} onChange={f("name")} placeholder="e.g. Brake Pad Set" />
            </div>
            <div>
              <Label>Part Number</Label>
              <Input value={form.partNumber} onChange={f("partNumber")} placeholder="e.g. BP-12345" />
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={f("sku")} placeholder="e.g. SKU-001" />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={form.category} onChange={f("category")} placeholder="e.g. Brakes" />
            </div>
            <div>
              <Label>Location (shelf/bin)</Label>
              <Input value={form.location} onChange={f("location")} placeholder="e.g. A3-B2" />
            </div>
            <div>
              <Label>Stock Qty</Label>
              <Input type="number" value={form.stockQty} onChange={f("stockQty")} min="0" />
            </div>
            <div>
              <Label>Low Stock Alert</Label>
              <Input type="number" value={form.lowStockThreshold} onChange={f("lowStockThreshold")} min="0" />
            </div>
            <div>
              <Label>Unit Cost ($)</Label>
              <Input type="number" value={form.unitCost} onChange={f("unitCost")} min="0" step="0.01" />
            </div>
            <div>
              <Label>Sale Price ($)</Label>
              <Input type="number" value={form.unitPrice} onChange={f("unitPrice")} min="0" step="0.01" />
            </div>
            <div className="col-span-2">
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={f("supplier")} placeholder="Supplier name" />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={f("description")} placeholder="Optional description" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Part"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Supplier Form Dialog ─────────────────────────────────────────────────────

function SupplierFormDialog({
  open, onOpenChange, supplier,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  supplier?: Supplier | null;
}) {
  const createSupplier = useMutation(api.parts.createSupplier);
  const updateSupplier = useMutation(api.parts.updateSupplier);
  const [form, setForm] = useState({
    name: supplier?.name ?? "",
    contactName: supplier?.contactName ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    website: supplier?.website ?? "",
    accountNumber: supplier?.accountNumber ?? "",
    notes: supplier?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Supplier name is required"); return; }
    setSaving(true);
    try {
      const data = {
        name: form.name,
        contactName: form.contactName || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        website: form.website || undefined,
        accountNumber: form.accountNumber || undefined,
        notes: form.notes || undefined,
      };
      if (supplier) {
        await updateSupplier({ supplierId: supplier._id, ...data });
        toast.success("Supplier updated");
      } else {
        await createSupplier(data);
        toast.success("Supplier added");
      }
      onOpenChange(false);
    } catch {
      toast.error("Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  const f = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{supplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label>Supplier Name *</Label>
            <Input value={form.name} onChange={f("name")} placeholder="e.g. AutoZone Pro" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contact Name</Label>
              <Input value={form.contactName} onChange={f("contactName")} placeholder="John Smith" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={f("phone")} placeholder="(555) 000-0000" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={f("email")} placeholder="parts@supplier.com" />
            </div>
            <div>
              <Label>Account #</Label>
              <Input value={form.accountNumber} onChange={f("accountNumber")} placeholder="ACC-12345" />
            </div>
          </div>
          <div>
            <Label>Website</Label>
            <Input value={form.website} onChange={f("website")} placeholder="https://supplier.com" />
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={f("notes")} placeholder="Any notes…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Supplier"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── PO Form Dialog (Create + Edit) ──────────────────────────────────────────

type POFormLine = { partId: string; partNumber: string; description: string; qtyOrdered: string; unitCost: string };

function POFormDialog({
  open, onOpenChange, suppliers, prefill, editPO,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suppliers: Supplier[];
  prefill?: AISuggestion | null;
  editPO?: PurchaseOrder | null;
}) {
  const createPO = useMutation(api.parts.createPurchaseOrder);
  const updatePO = useMutation(api.parts.updatePurchaseOrder);

  const isEdit = !!editPO;

  const [supplierId, setSupplierId] = useState(
    editPO?.supplierId ?? prefill?.supplierId ?? ""
  );
  const [notes, setNotes] = useState(
    editPO?.notes ?? prefill?.summary ?? ""
  );
  const [lines, setLines] = useState<POFormLine[]>(
    editPO
      ? editPO.lines.map((l) => ({
          partId: l.partId ?? "",
          partNumber: l.partNumber ?? "",
          description: l.description,
          qtyOrdered: String(l.qtyOrdered),
          unitCost: String(l.unitCost),
        }))
      : prefill
        ? prefill.lines.map((l) => ({
            partId: l.partId,
            partNumber: l.partNumber,
            description: l.description,
            qtyOrdered: String(l.suggestedQty),
            unitCost: String(l.unitCost),
          }))
        : [{ partId: "", partNumber: "", description: "", qtyOrdered: "1", unitCost: "0" }]
  );
  const [saving, setSaving] = useState(false);

  const addLine = () =>
    setLines((prev) => [...prev, { partId: "", partNumber: "", description: "", qtyOrdered: "1", unitCost: "0" }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: string) =>
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const subtotal = lines.reduce((s, l) => s + Number(l.qtyOrdered) * Number(l.unitCost), 0);

  const handleSave = async () => {
    if (!supplierId) { toast.error("Select a supplier"); return; }
    if (lines.every((l) => !l.description.trim())) { toast.error("Add at least one line item"); return; }
    setSaving(true);
    try {
      const cleanedLines = lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          partId: l.partId || undefined,
          partNumber: l.partNumber || undefined,
          description: l.description,
          qtyOrdered: Number(l.qtyOrdered),
          qtyReceived: 0,
          unitCost: Number(l.unitCost),
        }));

      if (isEdit) {
        await updatePO({
          poId: editPO._id,
          supplierId: supplierId as Id<"suppliers">,
          lines: cleanedLines,
          notes: notes || undefined,
        });
        toast.success("Purchase order updated");
      } else {
        await createPO({
          supplierId: supplierId as Id<"suppliers">,
          lines: cleanedLines,
          notes: notes || undefined,
          aiGenerated: !!prefill,
          aiReason: prefill?.summary,
        });
        toast.success("Purchase order created");
      }
      onOpenChange(false);
    } catch {
      toast.error(isEdit ? "Failed to update purchase order" : "Failed to create purchase order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!isEdit && prefill && <Sparkles size={16} className="text-primary" />}
            {isEdit ? `Edit ${editPO.poNumber}` : prefill ? "Create AI-Suggested PO" : "New Purchase Order"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {prefill && !isEdit && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm text-foreground">
              <span className="font-semibold text-primary">AI Reason: </span>{prefill.summary}
            </div>
          )}

          <div>
            <Label>Supplier *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Select supplier…" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Line Items</Label>
              <Button size="sm" variant="ghost" onClick={addLine} className="cursor-pointer">
                <Plus size={14} className="mr-1" /> Add Line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Input
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => updateLine(i, "description", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      placeholder="Part #"
                      value={line.partNumber}
                      onChange={(e) => updateLine(i, "partNumber", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={line.qtyOrdered}
                      min="1"
                      onChange={(e) => updateLine(i, "qtyOrdered", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Cost"
                      value={line.unitCost}
                      min="0"
                      step="0.01"
                      onChange={(e) => updateLine(i, "unitCost", e.target.value)}
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {lines.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removeLine(i)} className="cursor-pointer h-8 w-8 p-0">
                        <X size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-right text-sm font-semibold text-foreground">
              Subtotal: ${subtotal.toFixed(2)}
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save Changes" : "Create PO")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Receive Items Dialog ─────────────────────────────────────────────────────

function ReceiveItemsDialog({
  open, onOpenChange, po,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  po: PurchaseOrder;
}) {
  const receivePO = useMutation(api.parts.receivePurchaseOrder);
  const [receiving, setReceiving] = useState<Record<number, string>>(
    Object.fromEntries(po.lines.map((l, i) => [i, String(l.qtyOrdered - l.qtyReceived)]))
  );
  const [saving, setSaving] = useState(false);

  const handleReceive = async () => {
    setSaving(true);
    try {
      const updatedLines = po.lines.map((l, i) => ({
        ...l,
        qtyReceived: l.qtyReceived + Math.min(Number(receiving[i] ?? 0), l.qtyOrdered - l.qtyReceived),
      }));
      await receivePO({ poId: po._id, lines: updatedLines });
      toast.success("Items received — stock updated");
      onOpenChange(false);
    } catch {
      toast.error("Failed to receive items");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Inbox size={16} className="text-primary" />
            Receive Items — {po.poNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Enter the quantity received for each line. Stock will be updated automatically.
          </p>
          <div className="space-y-2">
            {po.lines.map((line, i) => {
              const remaining = line.qtyOrdered - line.qtyReceived;
              return (
                <div key={i} className="flex items-center gap-3 border border-border rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{line.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Ordered: {line.qtyOrdered} · Already received: {line.qtyReceived} · Remaining: {remaining}
                    </p>
                  </div>
                  <div className="w-20 shrink-0">
                    <Input
                      type="number"
                      min="0"
                      max={String(remaining)}
                      value={receiving[i] ?? "0"}
                      onChange={(e) => setReceiving((prev) => ({ ...prev, [i]: e.target.value }))}
                      className="text-center"
                      disabled={remaining === 0}
                    />
                  </div>
                  {remaining === 0 && (
                    <Check size={14} className="text-green-400 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleReceive} disabled={saving} className="cursor-pointer">
            {saving ? "Receiving…" : "Confirm Receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Export PO as text ────────────────────────────────────────────────────────

function exportPOText(po: PurchaseOrder) {
  const lines = [
    `PURCHASE ORDER: ${po.poNumber}`,
    `Supplier: ${po.supplierName}`,
    `Date: ${new Date().toLocaleDateString()}`,
    `Status: ${po.status.toUpperCase()}`,
    "",
    "ITEMS:",
    ...po.lines.map(
      (l) =>
        `  - ${l.description}${l.partNumber ? ` (${l.partNumber})` : ""}` +
        `  Qty: ${l.qtyOrdered}  Unit Cost: $${l.unitCost.toFixed(2)}  Total: $${(l.qtyOrdered * l.unitCost).toFixed(2)}`
    ),
    "",
    `SUBTOTAL: $${po.subtotal.toFixed(2)}`,
    po.notes ? `\nNotes: ${po.notes}` : "",
  ].join("\n");

  const blob = new Blob([lines], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${po.poNumber}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Stock Adjustment Dialog ──────────────────────────────────────────────────

type AdjustReason = "restock" | "write-off" | "correction" | "transfer";

const ADJUST_REASONS: { value: AdjustReason; label: string; sign: 1 | -1 | 0 }[] = [
  { value: "restock",    label: "Restock / Received",  sign: 1  },
  { value: "write-off",  label: "Write-off / Damaged",  sign: -1 },
  { value: "correction", label: "Inventory Correction", sign: 0  },
  { value: "transfer",   label: "Transfer Out",         sign: -1 },
];

function StockAdjustDialog({
  part,
  open,
  onOpenChange,
}: {
  part: Part;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const adjustStock = useMutation(api.parts.adjustStock);
  const [reason, setReason] = useState<AdjustReason>("restock");
  const [qty, setQty] = useState("1");
  const [saving, setSaving] = useState(false);

  const selectedReason = ADJUST_REASONS.find((r) => r.value === reason)!;
  const delta = selectedReason.sign === 0 ? Number(qty) - part.stockQty : selectedReason.sign * Math.abs(Number(qty));
  const newQty = Math.max(0, part.stockQty + delta);

  const handleApply = async () => {
    if (!qty || isNaN(Number(qty))) { toast.error("Enter a valid quantity"); return; }
    setSaving(true);
    try {
      await adjustStock({ partId: part._id, delta });
      toast.success(`Stock updated: ${part.stockQty} → ${newQty}`);
      onOpenChange(false);
    } catch {
      toast.error("Failed to adjust stock");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust Stock — {part.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-muted/30 rounded-lg px-4 py-3 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Current Stock</span>
            <span className="text-xl font-bold text-foreground">{part.stockQty}</span>
          </div>

          <div className="space-y-1">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as AdjustReason)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ADJUST_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>{selectedReason.sign === 0 ? "Set New Quantity" : "Quantity"}</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={selectedReason.sign === 0 ? "New total quantity" : "How many units?"}
            />
          </div>

          {qty && !isNaN(Number(qty)) && Number(qty) >= 0 && (
            <div className="rounded-lg border border-border px-4 py-3 flex justify-between items-center text-sm">
              <span className="text-muted-foreground">New Stock</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{part.stockQty}</span>
                <span className="text-muted-foreground">→</span>
                <span className={cn("font-bold text-lg", newQty <= part.lowStockThreshold ? "text-destructive" : "text-foreground")}>
                  {newQty}
                </span>
                {delta !== 0 && (
                  <span className={cn("text-xs font-medium", delta > 0 ? "text-green-400" : "text-red-400")}>
                    ({delta > 0 ? "+" : ""}{delta})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleApply} disabled={saving || delta === 0} className="cursor-pointer">
            {saving ? "Applying…" : "Apply Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inventory Tab ─────────────────────────────────────────────────────────────

function InventoryTab() {
  const [search, setSearch] = useState("");
  const [partForm, setPartForm] = useState<{ open: boolean; part: Part | null }>({ open: false, part: null });
  const [adjustForm, setAdjustForm] = useState<{ open: boolean; part: Part | null }>({ open: false, part: null });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; partId: Id<"parts"> | null; partName: string }>({ open: false, partId: null, partName: "" });
  const parts = useQuery(api.parts.listParts, { search: search || undefined }) as Part[] | undefined;
  const deletePart = useMutation(api.parts.deletePart);
  const adjustStock = useMutation(api.parts.adjustStock);

  const handleDelete = async (partId: Id<"parts">) => {
    await deletePart({ partId });
    toast.success("Part deleted");
    setDeleteConfirm({ open: false, partId: null, partName: "" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search parts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button className="cursor-pointer" onClick={() => setPartForm({ open: true, part: null })}>
          <Plus size={16} className="mr-2" /> Add Part
        </Button>
      </div>

      {parts === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : parts.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Package /></EmptyMedia>
            <EmptyTitle>No parts yet</EmptyTitle>
            <EmptyDescription>Add your first part to start tracking inventory</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setPartForm({ open: true, part: null })}>Add Part</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Part</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">Part #</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Category</th>
                <th className="text-center px-4 py-2 font-medium text-muted-foreground">Stock</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">Cost</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">Price</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part) => {
                const isLow = part.stockQty <= part.lowStockThreshold;
                return (
                  <tr key={part._id} className="border-t border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{part.name}</div>
                      {part.supplier && <div className="text-xs text-muted-foreground">{part.supplier}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{part.partNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{part.category ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          className="w-6 h-6 rounded bg-muted hover:bg-muted/70 text-foreground cursor-pointer flex items-center justify-center text-xs font-bold"
                          onClick={() => adjustStock({ partId: part._id, delta: -1 })}
                        >−</button>
                        <span className={cn("font-semibold text-sm w-8 text-center", isLow && "text-destructive")}>
                          {part.stockQty}
                        </span>
                        <button
                          className="w-6 h-6 rounded bg-muted hover:bg-muted/70 text-foreground cursor-pointer flex items-center justify-center text-xs font-bold"
                          onClick={() => adjustStock({ partId: part._id, delta: 1 })}
                        >+</button>
                        {isLow && <AlertTriangle size={12} className="text-destructive" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">${part.unitCost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-foreground hidden sm:table-cell">${part.unitPrice.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 cursor-pointer"
                          title="Adjust stock"
                          onClick={() => setAdjustForm({ open: true, part })}
                        >
                          <RefreshCw size={12} />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 cursor-pointer"
                          onClick={() => setPartForm({ open: true, part })}
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 cursor-pointer text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm({ open: true, partId: part._id, partName: part.name })}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PartFormDialog
        open={partForm.open}
        onOpenChange={(v) => setPartForm((p) => ({ ...p, open: v }))}
        part={partForm.part}
      />
      {adjustForm.part && (
        <StockAdjustDialog
          part={adjustForm.part}
          open={adjustForm.open}
          onOpenChange={(v) => setAdjustForm((p) => ({ ...p, open: v }))}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(o) => setDeleteConfirm((p) => ({ ...p, open: o }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Part?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteConfirm.partName}&quot;? This action cannot be undone and will remove all stock records for this part.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              onClick={() => deleteConfirm.partId && handleDelete(deleteConfirm.partId)}
            >
              Delete Part
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Suppliers Tab ─────────────────────────────────────────────────────────────

function SuppliersTab() {
  const suppliers = useQuery(api.parts.listSuppliers, {}) as Supplier[] | undefined;
  const deleteSupplier = useMutation(api.parts.deleteSupplier);
  const [form, setForm] = useState<{ open: boolean; supplier: Supplier | null }>({ open: false, supplier: null });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; supplierId: Id<"suppliers"> | null; supplierName: string }>({ open: false, supplierId: null, supplierName: "" });

  const handleDelete = async (supplierId: Id<"suppliers">) => {
    await deleteSupplier({ supplierId });
    toast.success("Supplier deleted");
    setDeleteConfirm({ open: false, supplierId: null, supplierName: "" });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="cursor-pointer" onClick={() => setForm({ open: true, supplier: null })}>
          <Plus size={16} className="mr-2" /> Add Supplier
        </Button>
      </div>

      {suppliers === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : suppliers.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Truck /></EmptyMedia>
            <EmptyTitle>No suppliers yet</EmptyTitle>
            <EmptyDescription>Add your parts suppliers to create purchase orders</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setForm({ open: true, supplier: null })}>Add Supplier</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <Card key={s._id} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 cursor-pointer" onClick={() => setForm({ open: true, supplier: s })}>
                      <Pencil size={12} />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 cursor-pointer text-destructive hover:text-destructive" onClick={() => setDeleteConfirm({ open: true, supplierId: s._id, supplierName: s.name })}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
                {s.contactName && <p className="text-sm text-muted-foreground">{s.contactName}</p>}
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {s.phone && <div className="text-muted-foreground">{s.phone}</div>}
                {s.email && <div className="text-muted-foreground truncate">{s.email}</div>}
                {s.accountNumber && <div className="text-xs text-muted-foreground">Acct: {s.accountNumber}</div>}
                {s.notes && <div className="text-xs text-muted-foreground italic">{s.notes}</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SupplierFormDialog
        open={form.open}
        onOpenChange={(v) => setForm((p) => ({ ...p, open: v }))}
        supplier={form.supplier}
      />

      {/* Delete supplier confirmation */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(o) => setDeleteConfirm((p) => ({ ...p, open: o }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteConfirm.supplierName}&quot;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              onClick={() => deleteConfirm.supplierId && handleDelete(deleteConfirm.supplierId)}
            >
              Delete Supplier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Purchase Orders Tab ──────────────────────────────────────────────────────

function PurchaseOrdersTab({ suppliers }: { suppliers: Supplier[] }) {
  const pos = useQuery(api.parts.listPurchaseOrders, {}) as (PurchaseOrder & { supplierName: string })[] | undefined;
  const updateStatus = useMutation(api.parts.updatePurchaseOrderStatus);
  const deletePO = useMutation(api.parts.deletePurchaseOrder);
  const [createOpen, setCreateOpen] = useState(false);
  const [editPO, setEditPO] = useState<PurchaseOrder | null>(null);
  const [receivePO, setReceivePO] = useState<PurchaseOrder | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirmPO, setDeleteConfirmPO] = useState<{ open: boolean; poId: Id<"purchaseOrders"> | null }>({ open: false, poId: null });

  const handleStatus = async (poId: Id<"purchaseOrders">, status: PurchaseOrder["status"]) => {
    await updateStatus({ poId, status });
    toast.success(`PO marked as ${status}`);
  };

  const handleDelete = async (poId: Id<"purchaseOrders">) => {
    await deletePO({ poId });
    toast.success("Purchase order deleted");
    setDeleteConfirmPO({ open: false, poId: null });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="cursor-pointer" onClick={() => setCreateOpen(true)}>
          <Plus size={16} className="mr-2" /> New PO
        </Button>
      </div>

      {pos === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : pos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ShoppingCart /></EmptyMedia>
            <EmptyTitle>No purchase orders</EmptyTitle>
            <EmptyDescription>Create a purchase order to restock your inventory</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setCreateOpen(true)}>New PO</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-2">
          {pos.map((po) => (
            <div key={po._id} className="border border-border rounded-lg overflow-hidden">
              {/* PO Header Row */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => setExpandedId(expandedId === po._id ? null : po._id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-foreground">{po.poNumber}</span>
                    <POStatusBadge status={po.status} />
                    {po.aiGenerated && (
                      <span className="flex items-center gap-1 text-xs text-primary">
                        <Sparkles size={10} /> AI
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {po.supplierName} · {po.lines.length} item{po.lines.length !== 1 ? "s" : ""} · ${po.subtotal.toFixed(2)}
                    {po.orderedAt && ` · Ordered ${new Date(po.orderedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {po.status === "draft" && (
                    <>
                      <Button
                        size="sm" variant="ghost"
                        className="cursor-pointer h-7 text-xs"
                        onClick={(e) => { e.stopPropagation(); setEditPO(po); }}
                      >
                        <Pencil size={11} className="mr-1" /> Edit
                      </Button>
                      <Button
                        size="sm" className="cursor-pointer h-7 text-xs"
                        onClick={(e) => { e.stopPropagation(); handleStatus(po._id, "sent"); }}
                      >
                        Mark Sent
                      </Button>
                    </>
                  )}
                  {(po.status === "sent" || po.status === "partial") && (
                    <Button
                      size="sm" className="cursor-pointer h-7 text-xs"
                      onClick={(e) => { e.stopPropagation(); setReceivePO(po); }}
                    >
                      <Inbox size={11} className="mr-1" /> Receive
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 w-7 p-0 cursor-pointer"
                    title="Export as text"
                    onClick={(e) => { e.stopPropagation(); exportPOText(po); }}
                  >
                    <Download size={11} />
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 w-7 p-0 cursor-pointer text-destructive hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmPO({ open: true, poId: po._id }); }}
                  >
                    <Trash2 size={12} />
                  </Button>
                  {expandedId === po._id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </div>

              {/* Expanded lines */}
              {expandedId === po._id && (
                <div className="border-t border-border bg-muted/10 px-4 py-3">
                  {po.aiReason && (
                    <div className="mb-3 text-xs text-primary flex items-center gap-1">
                      <Sparkles size={10} /> {po.aiReason}
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground text-xs">
                        <th className="text-left pb-1">Description</th>
                        <th className="text-left pb-1 hidden sm:table-cell">Part #</th>
                        <th className="text-center pb-1">Ordered</th>
                        <th className="text-center pb-1">Received</th>
                        <th className="text-right pb-1">Unit Cost</th>
                        <th className="text-right pb-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.lines.map((line, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="py-1.5 text-foreground">{line.description}</td>
                          <td className="py-1.5 text-muted-foreground hidden sm:table-cell">{line.partNumber ?? "—"}</td>
                          <td className="py-1.5 text-center">{line.qtyOrdered}</td>
                          <td className="py-1.5 text-center">
                            <span className={cn(line.qtyReceived >= line.qtyOrdered ? "text-green-400" : "text-muted-foreground")}>
                              {line.qtyReceived}
                            </span>
                          </td>
                          <td className="py-1.5 text-right text-muted-foreground">${line.unitCost.toFixed(2)}</td>
                          <td className="py-1.5 text-right font-medium">${(line.qtyOrdered * line.unitCost).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {po.notes && <p className="mt-2 text-xs text-muted-foreground italic">{po.notes}</p>}
                  {po.expectedAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Expected: {new Date(po.expectedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <POFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        suppliers={suppliers}
      />

      {editPO && (
        <POFormDialog
          open={!!editPO}
          onOpenChange={(v) => { if (!v) setEditPO(null); }}
          suppliers={suppliers}
          editPO={editPO}
        />
      )}

      {receivePO && (
        <ReceiveItemsDialog
          open={!!receivePO}
          onOpenChange={(v) => { if (!v) setReceivePO(null); }}
          po={receivePO}
        />
      )}

      {/* Delete PO confirmation */}
      <AlertDialog open={deleteConfirmPO.open} onOpenChange={(o) => setDeleteConfirmPO((p) => ({ ...p, open: o }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this purchase order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              onClick={() => deleteConfirmPO.poId && handleDelete(deleteConfirmPO.poId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── AI Ordering Tab ──────────────────────────────────────────────────────────

function AIOrderingTab({ suppliers }: { suppliers: Supplier[] }) {
  const lowStockParts = useQuery(api.parts.getLowStockParts, {}) as Part[] | undefined;
  const suggestOrders = useAction(api.partsAI.suggestOrders);
  const bulkCreate = useAction(api.partsAI.bulkCreateFromSuggestions);
  const [suggestions, setSuggestions] = useState<AISuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [createFor, setCreateFor] = useState<AISuggestion | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    setSuggestions(null);
    try {
      const result = await suggestOrders({});
      setSuggestions(result.suggestions);
      if (result.suggestions.length === 0) {
        toast.success("All stock levels look good — no orders needed!");
      }
    } catch {
      toast.error("Failed to analyze inventory");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptAll = async () => {
    if (!suggestions || suggestions.length === 0) return;
    setBulkLoading(true);
    try {
      const result = await bulkCreate({ suggestions });
      if (result.created > 0) {
        toast.success(`${result.created} purchase order${result.created !== 1 ? "s" : ""} created${result.skipped > 0 ? ` (${result.skipped} skipped — supplier not found)` : ""}`);
        setSuggestions(null);
      } else {
        toast.error("No orders created — suppliers may not be set up yet");
      }
    } catch {
      toast.error("Failed to create purchase orders");
    } finally {
      setBulkLoading(false);
    }
  };

  const totalCost = suggestions?.reduce((s, sg) => s + sg.totalCost, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Low Stock Alert Banner */}
      {lowStockParts !== undefined && lowStockParts.length > 0 && (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <AlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground text-sm">
              {lowStockParts.length} part{lowStockParts.length !== 1 ? "s" : ""} below threshold
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lowStockParts.map((p) => p.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* AI Analysis Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles size={18} className="text-primary" />
            AI-Powered Reorder Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The AI analyzes your inventory levels, low-stock thresholds, and supplier data to suggest optimal purchase orders — automatically grouped by supplier.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleAnalyze} disabled={loading || bulkLoading} className="cursor-pointer">
              {loading ? (
                <><RefreshCw size={16} className="mr-2 animate-spin" /> Analyzing Inventory…</>
              ) : (
                <><Sparkles size={16} className="mr-2" /> Analyze & Suggest Orders</>
              )}
            </Button>

            {suggestions !== null && suggestions.length > 0 && (
              <Button
                variant="secondary"
                onClick={handleAcceptAll}
                disabled={bulkLoading || loading}
                className="cursor-pointer"
              >
                {bulkLoading ? (
                  <><RefreshCw size={16} className="mr-2 animate-spin" /> Creating POs…</>
                ) : (
                  <><Check size={16} className="mr-2" /> Accept All ({suggestions.length} POs · ${totalCost.toFixed(2)})</>
                )}
              </Button>
            )}
          </div>

          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          )}

          {suggestions !== null && suggestions.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg p-3">
              <Check size={14} />
              All inventory levels are healthy — no reorders needed right now.
            </div>
          )}

          {suggestions !== null && suggestions.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {suggestions.length} suggested order{suggestions.length !== 1 ? "s" : ""} totaling{" "}
                <span className="font-semibold text-foreground">${totalCost.toFixed(2)}</span>.
                Review each below or click <strong>Accept All</strong> to create all POs at once.
              </p>
              {suggestions.map((suggestion, i) => (
                <div key={i} className="border border-primary/30 rounded-lg overflow-hidden bg-primary/5">
                  <div className="flex items-start justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Sparkles size={12} className="text-primary" />
                        <span className="font-semibold text-foreground text-sm">{suggestion.supplierName}</span>
                        <Badge variant="secondary" className="text-xs">${suggestion.totalCost.toFixed(2)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{suggestion.summary}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="cursor-pointer shrink-0"
                      onClick={() => { setCreateFor(suggestion); setCreateOpen(true); }}
                    >
                      <ShoppingCart size={12} className="mr-1" /> Review & Create PO
                    </Button>
                  </div>
                  <div className="border-t border-primary/20 px-4 py-2">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left pb-1">Part</th>
                          <th className="text-center pb-1">In Stock</th>
                          <th className="text-center pb-1">Suggest</th>
                          <th className="text-right pb-1">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suggestion.lines.map((line, j) => (
                          <tr key={j} className="border-t border-primary/10">
                            <td className="py-1.5">
                              <div className="font-medium text-foreground">{line.description}</div>
                              <div className="text-muted-foreground">{line.reason}</div>
                            </td>
                            <td className="py-1.5 text-center text-destructive font-semibold">{line.currentStock}</td>
                            <td className="py-1.5 text-center text-green-400 font-semibold">{line.suggestedQty}</td>
                            <td className="py-1.5 text-right">${(line.suggestedQty * line.unitCost).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {createFor && (
        <POFormDialog
          open={createOpen}
          onOpenChange={(v) => { setCreateOpen(v); if (!v) setCreateFor(null); }}
          suppliers={suppliers}
          prefill={createFor}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PartsPage() {
  const suppliers = useQuery(api.parts.listSuppliers, {}) as Supplier[] | undefined;
  const lowStockParts = useQuery(api.parts.getLowStockParts, {}) as Part[] | undefined;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Package className="text-primary" size={28} />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Parts & Inventory
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage inventory, suppliers, and AI-powered ordering
          </p>
        </div>
        {lowStockParts !== undefined && lowStockParts.length > 0 && (
          <Badge variant="destructive" className="ml-auto">
            <AlertTriangle size={12} className="mr-1" />
            {lowStockParts.length} low stock
          </Badge>
        )}
      </div>

      <Tabs defaultValue="inventory">
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="inventory" className="cursor-pointer">
            <Package size={14} className="mr-1.5" /> Inventory
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="cursor-pointer">
            <Truck size={14} className="mr-1.5" /> Suppliers
          </TabsTrigger>
          <TabsTrigger value="orders" className="cursor-pointer">
            <ShoppingCart size={14} className="mr-1.5" /> Purchase Orders
          </TabsTrigger>
          <TabsTrigger value="ai" className="cursor-pointer">
            <Sparkles size={14} className="mr-1.5" /> AI Ordering
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          <InventoryTab />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersTab />
        </TabsContent>
        <TabsContent value="orders">
          <PurchaseOrdersTab suppliers={suppliers ?? []} />
        </TabsContent>
        <TabsContent value="ai">
          <AIOrderingTab suppliers={suppliers ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
