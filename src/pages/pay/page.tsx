import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  FileText, CreditCard, CheckCircle2, AlertCircle, Phone, Clock,
  Car, Wrench, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

// ─── Success Screen ────────────────────────────────────────────────────────────

function PaymentSuccess({ orgName, invoiceNumber }: { orgName: string; invoiceNumber: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-6 max-w-sm mx-auto"
    >
      <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center">
        <CheckCircle2 size={40} className="text-green-400" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
          Payment Received!
        </h2>
        <p className="text-muted-foreground">
          Your payment for <strong>{invoiceNumber}</strong> has been processed successfully.
        </p>
        <p className="text-sm text-muted-foreground">
          Thank you for your business with <strong>{orgName}</strong>.
        </p>
      </div>
      <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-3 w-full">
        <p>A receipt will be sent to your email shortly.</p>
        <p className="mt-1">You can safely close this page.</p>
      </div>
    </motion.div>
  );
}

// ─── Verification Gate ─────────────────────────────────────────────────────────

function VerificationGate({
  invoiceId,
  orgName,
  orgLogoUrl,
  invoiceNumber,
  onVerified,
}: {
  invoiceId: Id<"invoices">;
  orgName: string;
  orgLogoUrl?: string;
  invoiceNumber: string;
  onVerified: (phoneLast4: string) => void;
}) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  // We verify by checking if the query returns data
  const result = useQuery(
    api.invoices.getInvoicePublic,
    checking && digits.length === 4 ? { invoiceId, phoneLast4: digits } : "skip"
  );

  // When result comes back, check if verified
  if (checking && result !== undefined) {
    if (result !== null) {
      onVerified(digits);
    } else {
      setError(true);
      setChecking(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (digits.length !== 4) {
      toast.error("Please enter exactly 4 digits");
      return;
    }
    setError(false);
    setChecking(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-sm mx-auto px-4 py-12 space-y-6"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        {orgLogoUrl ? (
          <img src={orgLogoUrl} alt={orgName} className="h-10 mx-auto object-contain" />
        ) : (
          <h1 className="text-xl font-bold text-primary" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            {orgName}
          </h1>
        )}
        <p className="text-xs text-muted-foreground">Invoice {invoiceNumber}</p>
      </div>

      <Card className="border-border">
        <CardContent className="p-6 space-y-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck size={24} className="text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Verify Your Identity</h2>
              <p className="text-sm text-muted-foreground mt-1">
                For your security, please enter the last 4 digits of the phone number on file for this invoice.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="Last 4 digits"
                value={digits}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setDigits(val);
                  setError(false);
                  setChecking(false);
                }}
                className="text-center text-2xl tracking-[0.3em] font-mono h-14"
                autoFocus
              />
              {error && (
                <p className="text-destructive text-xs text-center">
                  That doesn&apos;t match our records. Please try again.
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full h-12 cursor-pointer"
              disabled={digits.length !== 4 || checking}
            >
              {checking ? "Verifying..." : "Continue to Invoice"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Don&apos;t know the phone number? Contact the shop directly.
      </p>
      <div className="text-center space-y-1">
        <p className="text-xs text-muted-foreground">
          This verification protects your privacy — only you can view your invoice details.
        </p>
      </div>
    </motion.div>
  );
}

// ─── Invoice Payment Card ──────────────────────────────────────────────────────

function InvoicePaymentCard({ invoiceId, phoneLast4 }: { invoiceId: Id<"invoices">; phoneLast4?: string }) {
  const invoice = useQuery(api.invoices.getInvoicePublic, { invoiceId, phoneLast4 });
  const createPaymentLink = useAction(api.stripe.createInvoicePaymentLink);
  const [paying, setPaying] = useState(false);

  if (invoice === undefined) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 space-y-4">
        <Skeleton className="h-10 w-48 mx-auto" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (invoice === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-4">
        <AlertCircle size={40} className="text-destructive" />
        <h2 className="text-xl font-bold">Invoice Not Found</h2>
        <p className="text-muted-foreground text-sm">
          This payment link may be invalid or expired.
        </p>
      </div>
    );
  }

  const isPaid = invoice.status === "paid";
  const isVoid = invoice.status === "void";

  const handlePay = async () => {
    if (!phoneLast4) {
      toast.error("Phone verification is required before paying online.");
      return;
    }
    setPaying(true);
    try {
      const result = await createPaymentLink({
        invoiceId,
        phoneLast4,
        successUrl: window.location.origin + `/pay?invoice=${invoiceId}&success=1`,
        cancelUrl: window.location.href,
      });
      window.location.href = result.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to process payment";
      if (msg.includes("STRIPE_SECRET_KEY")) {
        toast.error("Online payments are not configured for this shop yet.");
      } else {
        toast.error(msg);
      }
      setPaying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto px-4 py-8 space-y-6"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        {invoice.orgLogoUrl ? (
          <img src={invoice.orgLogoUrl} alt={invoice.orgName} className="h-10 mx-auto object-contain" />
        ) : (
          <h1 className="text-xl font-bold text-primary" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            {invoice.orgName}
          </h1>
        )}
        <p className="text-xs text-muted-foreground">Invoice Payment</p>
      </div>

      {/* Invoice Card */}
      <Card className="border-border">
        <CardContent className="p-6 space-y-5">
          {/* Invoice Number + Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-primary" />
              <span className="font-bold text-lg" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                {invoice.invoiceNumber}
              </span>
            </div>
            <Badge
              className={
                isPaid
                  ? "bg-green-500/15 text-green-400"
                  : isVoid
                    ? "bg-destructive/15 text-destructive"
                    : "bg-yellow-500/15 text-yellow-400"
              }
            >
              {isPaid ? "Paid" : isVoid ? "Void" : invoice.balance < invoice.total ? "Partial" : "Due"}
            </Badge>
          </div>

          {/* Details */}
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Wrench size={13} />
              <span>RO: {invoice.roNumber}</span>
            </div>
            {invoice.vehicleSummary && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Car size={13} />
                <span>{invoice.vehicleSummary}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock size={13} />
              <span>Issued: {new Date(invoice.issuedAt).toLocaleDateString()}</span>
            </div>
            {invoice.dueAt && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock size={13} />
                <span>Due: {new Date(invoice.dueAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Amounts */}
          <div className="border-t border-border pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">{formatCurrency(invoice.total)}</span>
            </div>
            {invoice.amountPaid > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="text-green-400 font-medium">-{formatCurrency(invoice.amountPaid)}</span>
              </div>
            )}
            {!isPaid && !isVoid && (
              <div className="flex justify-between text-base font-bold border-t border-border pt-2">
                <span>Amount Due</span>
                <span className="text-primary">{formatCurrency(invoice.balance)}</span>
              </div>
            )}
          </div>

          {/* Pay Button */}
          {!isPaid && !isVoid && invoice.balance > 0 && (
            <Button
              className="w-full h-14 text-lg font-bold cursor-pointer"
              onClick={handlePay}
              disabled={paying}
            >
              <CreditCard size={20} className="mr-2" />
              {paying ? "Redirecting to payment..." : `Pay ${formatCurrency(invoice.balance)}`}
            </Button>
          )}

          {isPaid && (
            <div className="bg-green-500/10 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle2 size={20} className="text-green-400 shrink-0" />
              <div>
                <p className="font-semibold text-green-400 text-sm">Fully Paid</p>
                <p className="text-xs text-muted-foreground">Thank you for your payment.</p>
              </div>
            </div>
          )}

          {isVoid && (
            <div className="bg-muted/30 rounded-lg p-4 text-center text-sm text-muted-foreground">
              This invoice has been voided. No payment is required.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contact info */}
      {invoice.orgPhone && (
        <div className="text-center">
          <a
            href={`tel:${invoice.orgPhone}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer"
          >
            <Phone size={13} />
            Questions? Call {invoice.orgPhone}
          </a>
        </div>
      )}

      {/* Security assurance */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck size={12} className="text-green-400" />
        <span>Payments are securely processed by Stripe. Your card info is never stored by the shop.</span>
      </div>
    </motion.div>
  );
}

// ─── Success Wrapper ──────────────────────────────────────────────────────────

function SuccessWrapper({ invoiceId }: { invoiceId: Id<"invoices"> }) {
  const invoice = useQuery(api.invoices.getInvoicePublicPreview, { invoiceId });
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <PaymentSuccess
        orgName={invoice?.orgName ?? "Your mechanic"}
        invoiceNumber={invoice?.invoiceNumber ?? ""}
      />
    </div>
  );
}

// ─── Page Root ─────────────────────────────────────────────────────────────────

export default function PayPage() {
  const [searchParams] = useSearchParams();
  const invoiceId = searchParams.get("invoice") as Id<"invoices"> | null;
  const success = searchParams.get("success") === "1";
  const [phoneLast4, setPhoneLast4] = useState<string | null>(null);

  if (!invoiceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center space-y-4">
        <AlertCircle size={40} className="text-muted-foreground" />
        <h2 className="text-xl font-bold">No Invoice Specified</h2>
        <p className="text-muted-foreground text-sm">
          This page requires an invoice link. Please use the link provided by your mechanic.
        </p>
        <div className="mt-4 rounded-lg border border-border bg-card/50 p-4 max-w-sm text-left space-y-2">
          <p className="text-xs font-medium text-foreground">How do I pay my invoice?</p>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>Your mechanic will send you a payment link via text message or email when your service is complete.</p>
            <p>If you haven&apos;t received one, contact the shop directly and ask them to resend it.</p>
          </div>
        </div>
      </div>
    );
  }

  // Show success after Stripe redirect
  if (success) {
    return <SuccessWrapper invoiceId={invoiceId} />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <PayPageContent invoiceId={invoiceId} phoneLast4={phoneLast4} onVerified={setPhoneLast4} />
    </div>
  );
}

// ─── Inner content with verification logic ───────────────────────────────────

function PayPageContent({
  invoiceId,
  phoneLast4,
  onVerified,
}: {
  invoiceId: Id<"invoices">;
  phoneLast4: string | null;
  onVerified: (code: string) => void;
}) {
  const preview = useQuery(api.invoices.getInvoicePublicPreview, { invoiceId });

  if (preview === undefined) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 space-y-4">
        <Skeleton className="h-10 w-48 mx-auto" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (preview === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-4">
        <AlertCircle size={40} className="text-destructive" />
        <h2 className="text-xl font-bold">Invoice Not Found</h2>
        <p className="text-muted-foreground text-sm">
          This payment link may be invalid or expired.
        </p>
      </div>
    );
  }

  // Phone verification is required before viewing or paying an invoice online
  if (!preview.hasPhoneOnFile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-4 max-w-md mx-auto">
        <AlertCircle size={40} className="text-muted-foreground" />
        <h2 className="text-xl font-bold">Contact the Shop to Pay</h2>
        <p className="text-muted-foreground text-sm">
          Online payment requires a phone number on file for verification. Please contact{" "}
          <strong>{preview.orgName}</strong> to pay this invoice.
        </p>
      </div>
    );
  }

  // If not yet verified, show verification gate
  if (!phoneLast4) {
    return (
      <VerificationGate
        invoiceId={invoiceId}
        orgName={preview.orgName}
        orgLogoUrl={preview.orgLogoUrl}
        invoiceNumber={preview.invoiceNumber}
        onVerified={onVerified}
      />
    );
  }

  // Verified — show full invoice
  return <InvoicePaymentCard invoiceId={invoiceId} phoneLast4={phoneLast4} />;
}
