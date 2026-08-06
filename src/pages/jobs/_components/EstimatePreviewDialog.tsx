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
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
  Car, Wrench, Hammer, Package, Receipt, Eye, Pencil, Save, X,
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
  partId?: string;
  partNumber?: string;
  description: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
};

type ShopFee = {
  description: string;
  amount: number;
};

type EstimatePreviewData = {
  roId: Id<"repairOrders">;
  roNumber: string;
  complaint: string;
  cause?: string;
  vehicleSummary: string;
  customerName: string;
  laborLines: LaborLine[];
  partLines: PartLine[];
  shopFees: ShopFee[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  orgName: string;
  orgPhone?: string;
  orgLogoUrl?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  data: EstimatePreviewData;
  onSaved?: () => void;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

// ─── Editable Line Items ────────────────────────────────────────────────────

function EditableLaborSection({
  lines,
  editing,
  onChange,
}: {
  lines: LaborLine[];
  editing: boolean;
  onChange: (lines: LaborLine[]) => void;
}) {
  if (lines.length === 0) return null;

  const updateLine = (i: number, field: keyof LaborLine, value: string | number) => {
    const updated = lines.map((l, idx) => (idx === i ? { ...l, [field]: value } : l));
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <Hammer size={12} />
        Labor
      </div>
      {lines.map((line, i) => (
        <div key={i} className="flex items-start justify-between gap-3 text-sm">
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-1">
                <Input
                  className="h-7 text-sm"
                  value={line.description}
                  onChange={(e) => updateLine(i, "description", e.target.value)}
                />
                <div className="flex gap-2">
                  <div className="flex items-center gap-1">
                    <Label className="text-[10px]">Hrs</Label>
                    <Input
                      type="number"
                      step="0.1"
                      className="h-6 text-xs w-16"
                      value={line.laborHours}
                      onChange={(e) => updateLine(i, "laborHours", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-[10px]">Rate</Label>
                    <Input
                      type="number"
                      step="1"
                      className="h-6 text-xs w-20"
                      value={line.laborRate}
                      onChange={(e) => updateLine(i, "laborRate", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="text-foreground">{line.description}</p>
                <p className="text-xs text-muted-foreground">
                  {line.laborHours} hr x {formatCurrency(line.laborRate)}/hr
                </p>
              </>
            )}
          </div>
          <span className="font-medium shrink-0">{formatCurrency(line.laborHours * line.laborRate)}</span>
        </div>
      ))}
    </div>
  );
}

function EditablePartsSection({
  lines,
  editing,
  onChange,
}: {
  lines: PartLine[];
  editing: boolean;
  onChange: (lines: PartLine[]) => void;
}) {
  if (lines.length === 0) return null;

  const updateLine = (i: number, field: keyof PartLine, value: string | number) => {
    const updated = lines.map((l, idx) => (idx === i ? { ...l, [field]: value } : l));
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <Package size={12} />
        Parts
      </div>
      {lines.map((line, i) => (
        <div key={i} className="flex items-start justify-between gap-3 text-sm">
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-1">
                <Input
                  className="h-7 text-sm"
                  value={line.description}
                  onChange={(e) => updateLine(i, "description", e.target.value)}
                />
                <div className="flex gap-2">
                  <div className="flex items-center gap-1">
                    <Label className="text-[10px]">Qty</Label>
                    <Input
                      type="number"
                      className="h-6 text-xs w-14"
                      value={line.quantity}
                      onChange={(e) => updateLine(i, "quantity", parseFloat(e.target.value) || 1)}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-[10px]">Price</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-6 text-xs w-20"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(i, "unitPrice", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="text-foreground">{line.description}</p>
                <p className="text-xs text-muted-foreground">
                  Qty {line.quantity} x {formatCurrency(line.unitPrice)}
                </p>
              </>
            )}
          </div>
          <span className="font-medium shrink-0">{formatCurrency(line.quantity * line.unitPrice)}</span>
        </div>
      ))}
    </div>
  );
}

function EditableFeesSection({
  lines,
  editing,
  onChange,
}: {
  lines: ShopFee[];
  editing: boolean;
  onChange: (lines: ShopFee[]) => void;
}) {
  if (lines.length === 0) return null;

  const updateLine = (i: number, field: keyof ShopFee, value: string | number) => {
    const updated = lines.map((l, idx) => (idx === i ? { ...l, [field]: value } : l));
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <Receipt size={12} />
        Shop Fees
      </div>
      {lines.map((line, i) => (
        <div key={i} className="flex items-center justify-between gap-3 text-sm">
          {editing ? (
            <div className="flex-1 flex gap-2">
              <Input
                className="h-7 text-sm flex-1"
                value={line.description}
                onChange={(e) => updateLine(i, "description", e.target.value)}
              />
              <Input
                type="number"
                step="0.01"
                className="h-7 text-xs w-24"
                value={line.amount}
                onChange={(e) => updateLine(i, "amount", parseFloat(e.target.value) || 0)}
              />
            </div>
          ) : (
            <>
              <span className="text-foreground">{line.description}</span>
              <span className="font-medium shrink-0">{formatCurrency(line.amount)}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Dialog ────────────────────────────────────────────────────────────

export default function EstimatePreviewDialog({ open, onClose, data, onSaved }: Props) {
  const updateROLines = useMutation(api.repairOrders.updateROLines);

  const [editing, setEditing] = useState(false);
  const [laborLines, setLaborLines] = useState<LaborLine[]>(data.laborLines);
  const [partLines, setPartLines] = useState<PartLine[]>(data.partLines);
  const [shopFees, setShopFees] = useState<ShopFee[]>(data.shopFees);
  const [saving, setSaving] = useState(false);

  // Calculate totals from current editable lines
  const laborTotal = laborLines.reduce((s, l) => s + l.laborHours * l.laborRate, 0);
  const partsTotal = partLines.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
  const feesTotal = shopFees.reduce((s, f) => s + f.amount, 0);
  const subtotal = laborTotal + partsTotal + feesTotal;
  const taxAmount = subtotal * (data.taxRate / 100);
  const total = subtotal + taxAmount;

  const hasLineItems = laborLines.length > 0 || partLines.length > 0 || shopFees.length > 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateROLines({
        roId: data.roId,
        laborLines,
        partLines,
        shopFees,
      });
      toast.success("Estimate updated");
      setEditing(false);
      onSaved?.();
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setLaborLines(data.laborLines);
    setPartLines(data.partLines);
    setShopFees(data.shopFees);
    setEditing(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye size={16} className="text-primary" />
              Estimate Preview
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
                  <Pencil size={11} className="mr-1" /> Edit
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            This is what your customer will see when they open the estimate link.
          </p>
        </DialogHeader>

        {/* Preview content — mirrors the /approve page layout */}
        <div className="p-4 space-y-4">
          {/* Shop header */}
          <div className="text-center space-y-1.5">
            {data.orgLogoUrl ? (
              <img src={data.orgLogoUrl} alt={data.orgName} className="h-8 mx-auto object-contain" />
            ) : (
              <h2 className="text-lg font-bold text-primary" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                {data.orgName}
              </h2>
            )}
            <p className="text-[10px] text-muted-foreground">Estimate for Customer Approval</p>
          </div>

          {/* Estimate card */}
          <Card className="border-border">
            <CardContent className="p-4 space-y-4">
              {/* RO header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench size={14} className="text-primary" />
                  <span className="font-bold text-base" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                    {data.roNumber}
                  </span>
                </div>
                <Badge className="bg-yellow-500/15 text-yellow-400 text-[10px]">
                  Pending Approval
                </Badge>
              </div>

              {/* Vehicle */}
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Car size={12} />
                  <span>{data.vehicleSummary}</span>
                </div>
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground">Concern: </span>
                  {data.complaint}
                </div>
              </div>

              {/* Diagnosis */}
              {data.cause && (
                <div className="bg-muted/40 border border-border rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    <Wrench size={10} />
                    Inspection Findings
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                    {data.cause}
                  </div>
                </div>
              )}

              {/* Line items */}
              {hasLineItems ? (
                <div className={cn("space-y-4 border-t border-border pt-3", editing && "bg-primary/5 rounded-lg p-3 border-primary/20")}>
                  {editing && (
                    <p className="text-[10px] text-primary font-medium uppercase tracking-wide">Editing Mode</p>
                  )}
                  <EditableLaborSection lines={laborLines} editing={editing} onChange={setLaborLines} />
                  <EditablePartsSection lines={partLines} editing={editing} onChange={setPartLines} />
                  <EditableFeesSection lines={shopFees} editing={editing} onChange={setShopFees} />
                </div>
              ) : (
                <div className="border-t border-border pt-3 text-sm text-muted-foreground text-center py-4">
                  No line items have been added yet.
                </div>
              )}

              {/* Totals */}
              {hasLineItems && (
                <div className="border-t border-border pt-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {taxAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax ({data.taxRate}%)</span>
                      <span>{formatCurrency(taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold border-t border-border pt-2">
                    <span>Estimated Total</span>
                    <span className="text-primary">{formatCurrency(total)}</span>
                  </div>
                </div>
              )}

              {/* Approval section preview */}
              <div className="border-t border-border pt-4 space-y-2 opacity-60">
                <p className="text-[10px] text-muted-foreground">
                  By approving, you authorize <strong>{data.orgName}</strong> to perform the work described above.
                </p>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Your Name</Label>
                  <Input
                    disabled
                    placeholder={data.customerName}
                    className="h-9 opacity-60"
                  />
                </div>
                <Button disabled className="w-full h-11 text-sm font-bold">
                  Approve Estimate
                </Button>
                <p className="text-[9px] text-center text-muted-foreground/60">
                  (This button is disabled in preview)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Fine print */}
          <p className="text-[9px] text-muted-foreground/60 text-center px-4">
            Final charges may differ slightly if additional repairs are needed during service. Your mechanic will contact you before proceeding with any additional work.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
