import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent,
} from "@/components/ui/empty.tsx";
import {
  DollarSign, Plus, Banknote, Shirt, Wrench, MoreHorizontal,
  CheckCircle2, XCircle, AlertTriangle, ChevronRight, Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import { format } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

type DeductionType = "advance" | "uniform" | "tools" | "other";
type StatusFilter = "active" | "paid_off" | "cancelled" | undefined;

const TYPE_CONFIG: Record<DeductionType, { label: string; icon: typeof DollarSign; cls: string }> = {
  advance: { label: "Advance", icon: Banknote, cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  uniform: { label: "Uniform", icon: Shirt, cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  tools:   { label: "Tools", icon: Wrench, cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  other:   { label: "Other", icon: MoreHorizontal, cls: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
};

const STATUS_CONFIG = {
  active:    { label: "Active", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  paid_off:  { label: "Paid Off", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground border-border" },
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DeductionsPanel({ orgId }: { orgId: Id<"organizations"> }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState<Id<"payrollDeductions"> | null>(null);
  const [detailOpen, setDetailOpen] = useState<Id<"payrollDeductions"> | null>(null);

  const deductions = useQuery(api.deductions.getOrgDeductions, { statusFilter });
  const employees = useQuery(api.employees.listMembers, { orgId });

  if (deductions === undefined || employees === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  const totalActive = deductions.filter((d) => d.status === "active").length;
  const totalOwed = deductions
    .filter((d) => d.status === "active")
    .reduce((sum, d) => sum + (d.totalAmount - d.amountApplied), 0);

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <DollarSign size={16} className="text-primary mx-auto mb-1" />
          <div className="text-xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            ${totalOwed.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">Outstanding Balance</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <Receipt size={16} className="text-primary mx-auto mb-1" />
          <div className="text-xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            {totalActive}
          </div>
          <div className="text-xs text-muted-foreground">Active Deductions</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        <Select value={statusFilter ?? "all"} onValueChange={(v) => setStatusFilter(v === "all" ? undefined : v as StatusFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paid_off">Paid Off</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setCreateOpen(true)} className="cursor-pointer gap-2">
          <Plus size={16} />
          New Deduction
        </Button>
      </div>

      {/* Deductions list */}
      {deductions.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Banknote /></EmptyMedia>
            <EmptyTitle>No deductions</EmptyTitle>
            <EmptyDescription>
              {statusFilter === "active"
                ? "No active advances or deductions. Create one to track employee payroll deductions."
                : "No deductions match this filter."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="cursor-pointer">
              Create Deduction
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-2">
          {deductions.map((d) => {
            const config = TYPE_CONFIG[d.type as DeductionType];
            const statusCfg = STATUS_CONFIG[d.status as keyof typeof STATUS_CONFIG];
            const remaining = d.totalAmount - d.amountApplied;
            const progress = d.totalAmount > 0 ? (d.amountApplied / d.totalAmount) * 100 : 0;
            const Icon = config.icon;

            return (
              <Card key={d._id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", config.cls)}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="font-semibold text-sm text-foreground truncate">{d.description}</p>
                        <Badge variant="outline" className={cn("text-[10px] shrink-0", statusCfg.cls)}>
                          {statusCfg.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{d.memberName} · {config.label}</p>

                      {/* Progress bar */}
                      {d.status === "active" && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="text-muted-foreground">
                              ${d.amountApplied.toFixed(2)} of ${d.totalAmount.toFixed(2)} applied
                            </span>
                            <span className="font-semibold text-foreground">
                              ${remaining.toFixed(2)} left
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                          {d.amountPerCheck && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              ${d.amountPerCheck.toFixed(2)} per check
                            </p>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      {d.status === "active" && (
                        <div className="flex items-center gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-xs cursor-pointer gap-1"
                            onClick={() => setPaymentOpen(d._id)}
                          >
                            <DollarSign size={12} /> Apply Payment
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs cursor-pointer gap-1"
                            onClick={() => setDetailOpen(d._id)}
                          >
                            <ChevronRight size={12} /> Details
                          </Button>
                        </div>
                      )}
                      {d.status !== "active" && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Created {format(new Date(d.createdAt), "MMM d, yyyy")}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <CreateDeductionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        employees={employees.filter((e) => e.isActive)}
      />

      {/* Apply Payment Dialog */}
      {paymentOpen && (
        <ApplyPaymentDialog
          deductionId={paymentOpen}
          onClose={() => setPaymentOpen(null)}
        />
      )}

      {/* Detail Dialog */}
      {detailOpen && (
        <DeductionDetailDialog
          deductionId={detailOpen}
          onClose={() => setDetailOpen(null)}
        />
      )}
    </div>
  );
}

// ─── Create Deduction Dialog ─────────────────────────────────────────────────

type Employee = { _id: Id<"orgMembers">; userName?: string; inviteEmail?: string; role: string };

function CreateDeductionDialog({
  open,
  onClose,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
}) {
  const createDeduction = useMutation(api.deductions.createDeduction);
  const [memberId, setMemberId] = useState("");
  const [type, setType] = useState<DeductionType>("advance");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [splitPayments, setSplitPayments] = useState(false);
  const [amountPerCheck, setAmountPerCheck] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!memberId) { toast.error("Select an employee"); return; }
    if (!description.trim()) { toast.error("Enter a description"); return; }
    const total = parseFloat(totalAmount);
    if (!total || total <= 0) { toast.error("Enter a valid amount"); return; }

    const perCheck = splitPayments ? parseFloat(amountPerCheck) : undefined;
    if (splitPayments && (!perCheck || perCheck <= 0)) {
      toast.error("Enter a valid per-check amount");
      return;
    }

    setSaving(true);
    try {
      await createDeduction({
        memberId: memberId as Id<"orgMembers">,
        type,
        description: description.trim(),
        totalAmount: total,
        amountPerCheck: perCheck,
        notes: notes.trim() || undefined,
      });
      toast.success("Deduction created");
      onClose();
      // Reset form
      setMemberId("");
      setDescription("");
      setTotalAmount("");
      setAmountPerCheck("");
      setNotes("");
      setSplitPayments(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create deduction";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Deduction / Advance</DialogTitle>
          <DialogDescription>
            Create a payroll deduction to track advances, uniforms, tools, or other expenses.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Employee */}
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp._id} value={emp._id}>
                    {emp.userName ?? emp.inviteEmail ?? "Unknown"} ({emp.role.replace("_", " ")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as DeductionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="advance">Cash Advance</SelectItem>
                <SelectItem value="uniform">Uniform / Clothing</SelectItem>
                <SelectItem value="tools">Tools / Equipment</SelectItem>
                <SelectItem value="other">Other Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              placeholder="e.g. Cash advance 7/15, Work shirts x3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Total Amount */}
          <div className="space-y-2">
            <Label>Total Amount ($)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              placeholder="250.00"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
            />
          </div>

          {/* Split Payments */}
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <input
              type="checkbox"
              id="split-payments"
              checked={splitPayments}
              onChange={(e) => setSplitPayments(e.target.checked)}
              className="h-4 w-4 rounded border-border cursor-pointer"
            />
            <label htmlFor="split-payments" className="text-sm cursor-pointer flex-1">
              Split across multiple paychecks
            </label>
          </div>

          {splitPayments && (
            <div className="space-y-2">
              <Label>Amount per Check ($)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="50.00"
                value={amountPerCheck}
                onChange={(e) => setAmountPerCheck(e.target.value)}
              />
              {totalAmount && amountPerCheck && parseFloat(amountPerCheck) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Will take approximately {Math.ceil(parseFloat(totalAmount) / parseFloat(amountPerCheck))} paychecks to pay off
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Internal notes..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button onClick={handleCreate} disabled={saving} className="w-full cursor-pointer">
            {saving ? "Creating..." : "Create Deduction"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Apply Payment Dialog ────────────────────────────────────────────────────

function ApplyPaymentDialog({
  deductionId,
  onClose,
}: {
  deductionId: Id<"payrollDeductions">;
  onClose: () => void;
}) {
  const applyPayment = useMutation(api.deductions.applyDeductionPayment);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleApply = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast.error("Enter a valid amount"); return; }

    setSaving(true);
    try {
      const result = await applyPayment({
        deductionId,
        amount: val,
        note: note.trim() || undefined,
      });
      if (result.isPaidOff) {
        toast.success("Deduction fully paid off!");
      } else {
        toast.success(`$${result.amountApplied.toFixed(2)} applied`);
      }
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to apply payment";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Apply Payment</DialogTitle>
          <DialogDescription>
            Record money deducted from a paycheck against this balance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Amount ($)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              placeholder="50.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Input
              placeholder="e.g. Pay period 7/1 – 7/15"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button onClick={handleApply} disabled={saving} className="w-full cursor-pointer">
            {saving ? "Applying..." : "Apply Payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Deduction Detail Dialog ─────────────────────────────────────────────────

function DeductionDetailDialog({
  deductionId,
  onClose,
}: {
  deductionId: Id<"payrollDeductions">;
  onClose: () => void;
}) {
  const payments = useQuery(api.deductions.getDeductionPayments, { deductionId });
  const cancelDeduction = useMutation(api.deductions.cancelDeduction);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelDeduction({ deductionId });
      toast.success("Deduction cancelled — remaining balance forgiven");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to cancel";
      toast.error(msg);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payment History</DialogTitle>
          <DialogDescription>
            All payments applied against this deduction.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {payments === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No payments applied yet.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {payments.map((p) => (
                <div key={p._id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">${p.amount.toFixed(2)}</p>
                    {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(p.appliedAt), "MMM d, yyyy")}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive cursor-pointer gap-2"
              onClick={handleCancel}
              disabled={cancelling}
            >
              <XCircle size={14} />
              {cancelling ? "Cancelling..." : "Cancel Deduction (Forgive Balance)"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
