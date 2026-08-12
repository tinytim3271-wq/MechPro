import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Sheet, SheetContent,
} from "@/components/ui/sheet.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Download, CreditCard, Banknote, Hash, DollarSign,
  CheckCircle2, Send, Ban, SplitSquareHorizontal, Mail, ExternalLink, BellOff, Bell, Copy, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { generateInvoicePDF } from "./invoicePDF.ts";
import InvoicePreviewDialog from "./InvoicePreviewDialog.tsx";

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-400",
  partial: "bg-yellow-500/15 text-yellow-400",
  paid: "bg-green-500/15 text-green-400",
  void: "bg-destructive/15 text-destructive",
};

const METHOD_ICONS: Record<string, React.ReactNode> = {
  cash: <Banknote size={14} />,
  card: <CreditCard size={14} />,
  check: <Hash size={14} />,
  other: <DollarSign size={14} />,
};

type PaymentMethod = "cash" | "card" | "check" | "other";

// ─── Method grid sub-component ────────────────────────────────────────────────

function MethodGrid({
  value,
  onChange,
}: {
  value: PaymentMethod;
  onChange: (v: PaymentMethod) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {(["cash", "card", "check", "other"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            "flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer",
            value === m
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40"
          )}
        >
          {METHOD_ICONS[m]}
          <span className="capitalize">{m}</span>
        </button>
      ))}
    </div>
  );
}

// ─── POS Payment Panel ─────────────────────────────────────────────────────────

function POSPanel({
  invoiceId,
  balance,
}: {
  invoiceId: Id<"invoices">;
  balance: number;
}) {
  const addPayment = useMutation(api.invoices.addPayment);
  const [splitMode, setSplitMode] = useState(false);

  // Single payment state
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [reference, setReference] = useState("");

  // Split payment state
  const [method1, setMethod1] = useState<PaymentMethod>("card");
  const [amount1, setAmount1] = useState((balance / 2).toFixed(2));
  const [reference1, setReference1] = useState("");
  const [method2, setMethod2] = useState<PaymentMethod>("cash");
  const [amount2, setAmount2] = useState((balance / 2).toFixed(2));
  const [reference2, setReference2] = useState("");

  const [saving, setSaving] = useState(false);

  const presets = [balance, balance / 2, 100, 50, 20].filter(
    (v, i, arr) => v > 0 && arr.indexOf(v) === i
  );

  const handleSinglePay = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > balance + 0.01) { toast.error(`Amount cannot exceed the remaining balance of $${balance.toFixed(2)}`); return; }
    setSaving(true);
    try {
      await addPayment({ invoiceId, method, amount: amt, reference: reference || undefined });
      toast.success(`Payment of $${amt.toFixed(2)} recorded`);
      setAmount(Math.max(0, balance - amt).toFixed(2));
      setReference("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to record payment";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSplitPay = async () => {
    const a1 = parseFloat(amount1);
    const a2 = parseFloat(amount2);
    if (isNaN(a1) || a1 <= 0 || isNaN(a2) || a2 <= 0) {
      toast.error("Enter valid amounts for both payments");
      return;
    }
    if (a1 + a2 > balance + 0.01) {
      toast.error(`Combined payments cannot exceed the remaining balance of $${balance.toFixed(2)}`);
      return;
    }
    setSaving(true);
    try {
      await addPayment({ invoiceId, method: method1, amount: a1, reference: reference1 || undefined });
      await addPayment({ invoiceId, method: method2, amount: a2, reference: reference2 || undefined });
      toast.success(`Split payment recorded: $${a1.toFixed(2)} + $${a2.toFixed(2)}`);
      setSplitMode(false);
    } catch {
      toast.error("Failed to record split payment");
    } finally {
      setSaving(false);
    }
  };

  const splitTotal = parseFloat(amount1 || "0") + parseFloat(amount2 || "0");

  return (
    <div className="space-y-4 p-4 border border-border rounded-xl bg-card">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <CreditCard size={16} className="text-primary" /> Record Payment
        </h3>
        <button
          type="button"
          onClick={() => setSplitMode(!splitMode)}
          className={cn(
            "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-colors cursor-pointer",
            splitMode
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40"
          )}
        >
          <SplitSquareHorizontal size={12} />
          Split
        </button>
      </div>

      {/* Balance due */}
      <div className="bg-muted/30 rounded-lg px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">Balance Due</p>
        <p className="text-3xl font-bold text-primary">${balance.toFixed(2)}</p>
      </div>

      {!splitMode ? (
        <>
          <MethodGrid value={method} onChange={setMethod} />

          <div className="space-y-1">
            <Label>Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                step="0.01"
                className="pl-7"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(p.toFixed(2))}
                  className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors cursor-pointer"
                >
                  ${p.toFixed(2)}
                </button>
              ))}
            </div>
          </div>

          {(method === "check" || method === "card") && (
            <div className="space-y-1">
              <Label>{method === "check" ? "Check Number" : "Last 4 Digits"}</Label>
              <Input
                placeholder={method === "check" ? "1042" : "4242"}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          )}

          <Button className="w-full cursor-pointer" onClick={handleSinglePay} disabled={saving}>
            {saving ? "Processing..." : `Collect $${parseFloat(amount || "0").toFixed(2)}`}
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Split the payment between two methods. Amounts can be any combination.
          </p>

          {/* Payment 1 */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment 1</p>
            <MethodGrid value={method1} onChange={setMethod1} />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                step="0.01"
                className="pl-7"
                value={amount1}
                onChange={(e) => {
                  setAmount1(e.target.value);
                  const remaining = balance - parseFloat(e.target.value || "0");
                  if (!isNaN(remaining) && remaining >= 0) setAmount2(remaining.toFixed(2));
                }}
              />
            </div>
            {(method1 === "check" || method1 === "card") && (
              <Input
                placeholder={method1 === "check" ? "Check #1042" : "Last 4 digits"}
                value={reference1}
                onChange={(e) => setReference1(e.target.value)}
              />
            )}
          </div>

          {/* Payment 2 */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment 2</p>
            <MethodGrid value={method2} onChange={setMethod2} />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                step="0.01"
                className="pl-7"
                value={amount2}
                onChange={(e) => setAmount2(e.target.value)}
              />
            </div>
            {(method2 === "check" || method2 === "card") && (
              <Input
                placeholder={method2 === "check" ? "Check #1042" : "Last 4 digits"}
                value={reference2}
                onChange={(e) => setReference2(e.target.value)}
              />
            )}
          </div>

          {/* Split total indicator */}
          <div className="flex justify-between text-sm px-1">
            <span className="text-muted-foreground">Split total</span>
            <span className={cn(
              "font-semibold",
              Math.abs(splitTotal - balance) < 0.01 ? "text-green-400" : "text-yellow-400"
            )}>
              ${splitTotal.toFixed(2)} / ${balance.toFixed(2)}
            </span>
          </div>

          <Button className="w-full cursor-pointer" onClick={handleSplitPay} disabled={saving}>
            {saving ? "Processing..." : "Record Split Payment"}
          </Button>
        </>
      )}
    </div>
  );
}

// ─── Invoice Detail Sheet ──────────────────────────────────────────────────────

type Props = {
  invoiceId: Id<"invoices">;
  onClose: () => void;
};

export default function InvoiceDetailSheet({ invoiceId, onClose }: Props) {
  const invoice = useQuery(api.invoices.getInvoice, { invoiceId });
  const markSent = useMutation(api.invoices.markSent);
  const voidInvoice = useMutation(api.invoices.voidInvoice);
  const markPaidInFull = useMutation(api.invoices.markPaidInFull);
  const updateNotes = useMutation(api.invoices.updateInvoiceNotes);
  const sendEmail = useAction(api.invoices.sendInvoiceEmailManual);
  const createPaymentLink = useAction(api.stripe.createInvoicePaymentLink);
  const sendReminder = useAction(api.invoices.sendReminderEmail);
  const toggleReminders = useMutation(api.invoices.toggleReminders);

  const [showVoid, setShowVoid] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [markPaidMethod, setMarkPaidMethod] = useState<PaymentMethod>("cash");
  const [markPaidReference, setMarkPaidReference] = useState("");
  const [markingPaid, setMarkingPaid] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [creatingPayLink, setCreatingPayLink] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const displayNotes = notes ?? invoice?.notes ?? "";

  const handleMarkSent = async () => {
    try {
      await markSent({ invoiceId });
      toast.success("Invoice marked as sent");
    } catch {
      toast.error("Failed to update invoice");
    }
  };

  const handleVoid = async () => {
    try {
      await voidInvoice({ invoiceId });
      toast.success("Invoice voided");
      setShowVoid(false);
    } catch {
      toast.error("Failed to void invoice");
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await updateNotes({ invoiceId, notes: displayNotes });
      toast.success("Notes saved");
      setNotes(null);
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    try {
      await sendEmail({ invoiceId });
      toast.success("Invoice emailed to customer");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send email";
      toast.error(msg.includes("No customer email") ? "No customer email on file" : msg);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSendReminder = async () => {
    setSendingReminder(true);
    try {
      await sendReminder({ invoiceId });
      toast.success("Payment reminder sent to customer");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send reminder";
      toast.error(msg.includes("No customer email") ? "No customer email on file" : msg);
    } finally {
      setSendingReminder(false);
    }
  };

  const handleToggleReminders = async (enabled: boolean) => {
    try {
      await toggleReminders({ invoiceId, enabled });
      toast.success(enabled ? "Reminders enabled" : "Reminders disabled");
    } catch {
      toast.error("Failed to update reminder setting");
    }
  };

  const handleSendPaymentLink = async () => {
    setCreatingPayLink(true);
    try {
      const result = await createPaymentLink({
        invoiceId,
        successUrl: window.location.origin + `/pay?invoice=${invoiceId}&success=1`,
        cancelUrl: window.location.origin + `/pay?invoice=${invoiceId}`,
      });
      window.open(result.url, "_blank");
      toast.success("Payment link opened — share it with your customer");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create payment link";
      if (msg.includes("STRIPE_SECRET_KEY")) {
        toast.error("Stripe not configured. Add STRIPE_SECRET_KEY in the Secrets tab.");
      } else {
        toast.error(msg);
      }
    } finally {
      setCreatingPayLink(false);
    }
  };

  const handleCopyPaymentLink = async () => {
    const payUrl = `${window.location.origin}/pay?invoice=${invoiceId}`;
    try {
      await navigator.clipboard.writeText(payUrl);
      toast.success("Payment link copied! Send it to your customer via text or email.");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleMarkPaidInFull = async () => {
    setMarkingPaid(true);
    try {
      await markPaidInFull({
        invoiceId,
        method: markPaidMethod,
        reference: markPaidReference || undefined,
      });
      toast.success("Invoice marked as paid in full");
      setShowMarkPaid(false);
      setMarkPaidReference("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to mark as paid";
      toast.error(msg);
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!invoice) return;
    generateInvoicePDF({
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      status: invoice.status,
      notes: invoice.notes,
      customer: invoice.customer,
      vehicle: invoice.vehicle,
      ro: invoice.ro
        ? {
            roNumber: invoice.ro.roNumber,
            complaint: invoice.ro.complaint,
            mileageIn: invoice.ro.mileageIn,
            mileageOut: invoice.ro.mileageOut,
            laborLines: invoice.ro.laborLines,
            partLines: invoice.ro.partLines,
            shopFees: invoice.ro.shopFees,
          }
        : null,
      org: invoice.org,
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      payments: invoice.payments,
    });
  };

  return (
    <>
      <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
          {invoice === undefined ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : invoice === null ? (
            <div className="p-6 text-muted-foreground">Invoice not found.</div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-4 border-b border-border">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-muted-foreground">{invoice.invoiceNumber}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[invoice.status])}>
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-foreground mt-1" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                      {invoice.customer?.name ?? "Unknown"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {invoice.ro?.roNumber} ·{" "}
                      {invoice.vehicle
                        ? `${invoice.vehicle.year} ${invoice.vehicle.make} ${invoice.vehicle.model}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">${invoice.total.toFixed(2)}</p>
                    {invoice.balance > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Balance: <span className="text-red-400 font-semibold">${invoice.balance.toFixed(2)}</span>
                      </p>
                    )}
                    {invoice.balance <= 0 && invoice.status === "paid" && (
                      <p className="text-xs text-green-400 flex items-center gap-1 justify-end">
                        <CheckCircle2 size={12} /> Paid in Full
                      </p>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" onClick={handleDownloadPDF} className="cursor-pointer">
                    <Download size={13} className="mr-1" /> PDF
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowPreview(true)} className="cursor-pointer">
                    <Eye size={13} className="mr-1" /> Preview
                  </Button>
                  {invoice.customer?.email && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleSendEmail}
                      disabled={sendingEmail}
                      className="cursor-pointer"
                    >
                      <Mail size={13} className="mr-1" />
                      {sendingEmail ? "Sending..." : "Email Invoice"}
                    </Button>
                  )}
                  {/* Send reminder button — only for unpaid/partial invoices with email */}
                  {invoice.customer?.email && ["sent", "partial", "draft"].includes(invoice.status) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleSendReminder}
                      disabled={sendingReminder}
                      className="cursor-pointer"
                    >
                      <Bell size={13} className="mr-1" />
                      {sendingReminder ? "Sending..." : "Send Reminder"}
                    </Button>
                  )}
                  {invoice.status !== "void" && invoice.status !== "paid" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleSendPaymentLink}
                      disabled={creatingPayLink}
                      className="cursor-pointer"
                    >
                      <ExternalLink size={13} className="mr-1" />
                      {creatingPayLink ? "Creating..." : "Payment Link"}
                    </Button>
                  )}
                  {invoice.status !== "void" && invoice.status !== "paid" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleCopyPaymentLink}
                      className="cursor-pointer"
                    >
                      <Copy size={13} className="mr-1" />
                      Copy Pay Link
                    </Button>
                  )}
                  {invoice.status !== "void" && invoice.status !== "paid" && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                      onClick={() => setShowMarkPaid(true)}
                    >
                      <CheckCircle2 size={13} className="mr-1" />
                      Mark Paid
                    </Button>
                  )}
                  {invoice.status === "draft" && (
                    <Button size="sm" variant="secondary" onClick={handleMarkSent} className="cursor-pointer">
                      <Send size={13} className="mr-1" /> Mark Sent
                    </Button>
                  )}
                  {invoice.status !== "void" && invoice.status !== "paid" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive cursor-pointer"
                      onClick={() => setShowVoid(true)}
                    >
                      <Ban size={13} className="mr-1" /> Void
                    </Button>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* POS payment panel — only if balance > 0 and not voided */}
                {invoice.balance > 0 && invoice.status !== "void" && (
                  <POSPanel invoiceId={invoiceId} balance={invoice.balance} />
                )}

                {/* Line items summary */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Line Items</h3>
                  <div className="space-y-2">
                    {(invoice.ro?.laborLines ?? []).map((l, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-foreground truncate mr-2">{l.description}</span>
                        <span className="text-muted-foreground shrink-0">
                          {l.laborHours}h × ${l.laborRate}/hr = ${(l.laborHours * l.laborRate).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {(invoice.ro?.partLines ?? []).map((p, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-foreground truncate mr-2">
                          {p.description} {p.partNumber ? `(${p.partNumber})` : ""}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {p.quantity} × ${p.unitPrice.toFixed(2)} = ${(p.quantity * p.unitPrice).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {(invoice.ro?.shopFees ?? []).map((f, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-foreground">{f.description}</span>
                        <span className="text-muted-foreground">${f.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="border-t border-border pt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>${invoice.subtotal.toFixed(2)}</span>
                    </div>
                    {invoice.taxAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tax</span>
                        <span>${invoice.taxAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold">
                      <span>Total</span>
                      <span className="text-primary">${invoice.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment history */}
                {invoice.payments.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payments</h3>
                    {invoice.payments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          {METHOD_ICONS[p.method]}
                          <span className="capitalize">{p.method}</span>
                          {p.reference && <span className="text-muted-foreground text-xs">#{p.reference}</span>}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-400">+${p.amount.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(p.paidAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-semibold pt-1">
                      <span>Amount Paid</span>
                      <span className="text-green-400">${invoice.amountPaid.toFixed(2)}</span>
                    </div>
                    {invoice.balance > 0 && (
                      <div className="flex justify-between text-sm font-bold">
                        <span>Balance Due</span>
                        <span className="text-red-400">${invoice.balance.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Invoice Notes</Label>
                  <Textarea
                    placeholder="Add notes for the customer..."
                    value={displayNotes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                  {notes !== null && (
                    <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes} className="cursor-pointer">
                      {savingNotes ? "Saving..." : "Save Notes"}
                    </Button>
                  )}
                </div>

                {/* Meta info */}
                <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-3">
                  <div>Issued: {new Date(invoice.issuedAt).toLocaleDateString()}</div>
                  {invoice.dueAt && <div>Due: {new Date(invoice.dueAt).toLocaleDateString()}</div>}
                  {invoice.lastReminderSentAt && (
                    <div>Last reminder sent: {new Date(invoice.lastReminderSentAt).toLocaleDateString()}</div>
                  )}
                  {/* Reminders toggle — only show for unpaid invoices with customer email */}
                  {invoice.customer?.email && ["sent", "partial", "draft"].includes(invoice.status) && (
                    <button
                      type="button"
                      onClick={() => handleToggleReminders(!(invoice.remindersEnabled ?? true))}
                      className={cn(
                        "flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer",
                        (invoice.remindersEnabled ?? true)
                          ? "border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                          : "border-primary/40 text-primary bg-primary/5"
                      )}
                    >
                      {(invoice.remindersEnabled ?? true)
                        ? <><BellOff size={11} /> Disable auto-reminders</>
                        : <><Bell size={11} /> Enable auto-reminders</>
                      }
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={showVoid} onOpenChange={setShowVoid}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will void the invoice and revert the repair order status to Completed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleVoid}>Void Invoice</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark Paid In Full Dialog */}
      <Dialog open={showMarkPaid} onOpenChange={setShowMarkPaid}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-500" />
              Mark Invoice Paid
            </DialogTitle>
            <DialogDescription>
              Record a full payment of{" "}
              <strong>${invoice ? (invoice.total - invoice.amountPaid).toFixed(2) : "0.00"}</strong>{" "}
              for this invoice. This will mark it as paid in full.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Payment Method</Label>
              <MethodGrid value={markPaidMethod} onChange={setMarkPaidMethod} />
            </div>
            {(markPaidMethod === "check" || markPaidMethod === "card") && (
              <div className="space-y-1">
                <Label className="text-sm">
                  {markPaidMethod === "check" ? "Check Number" : "Last 4 Digits"}
                </Label>
                <Input
                  placeholder={markPaidMethod === "check" ? "1042" : "4242"}
                  value={markPaidReference}
                  onChange={(e) => setMarkPaidReference(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="cursor-pointer"
              onClick={() => setShowMarkPaid(false)}
              disabled={markingPaid}
            >
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white cursor-pointer"
              onClick={handleMarkPaidInFull}
              disabled={markingPaid}
            >
              {markingPaid ? "Processing..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Preview Dialog */}
      {invoice && showPreview && (
        <InvoicePreviewDialog
          open={showPreview}
          onClose={() => setShowPreview(false)}
          data={{
            invoiceId,
            roId: invoice.roId,
            invoiceNumber: invoice.invoiceNumber,
            issuedAt: invoice.issuedAt,
            dueAt: invoice.dueAt,
            status: invoice.status,
            notes: invoice.notes,
            customer: invoice.customer,
            vehicle: invoice.vehicle,
            ro: invoice.ro
              ? {
                  roNumber: invoice.ro.roNumber,
                  complaint: invoice.ro.complaint,
                  mileageIn: invoice.ro.mileageIn,
                  mileageOut: invoice.ro.mileageOut,
                  laborLines: invoice.ro.laborLines,
                  partLines: invoice.ro.partLines,
                  shopFees: invoice.ro.shopFees,
                }
              : null,
            org: invoice.org,
            subtotal: invoice.subtotal,
            taxAmount: invoice.taxAmount,
            total: invoice.total,
            amountPaid: invoice.amountPaid,
            payments: invoice.payments,
          }}
        />
      )}
    </>
  );
}
