import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  AlertCircle, CheckCircle2, Car, Wrench, Phone,
  Hammer, Package, Receipt, CreditCard, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { cn } from "@/lib/utils.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

// ─── Approval Success Screen ──────────────────────────────────────────────────

function ApprovalSuccess({
  orgName,
  roNumber,
  totalAmount,
  roId,
}: {
  orgName: string;
  roNumber: string;
  totalAmount: number;
  roId: Id<"repairOrders">;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-6 max-w-sm mx-auto"
    >
      <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center">
        <CheckCircle2 size={40} className="text-green-400" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
          Estimate Approved!
        </h2>
        <p className="text-muted-foreground">
          You have authorized <strong>{roNumber}</strong>. Work will begin shortly.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>{orgName}</strong> has been notified.
        </p>
      </div>
      <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-3 w-full space-y-1">
        <p>Your mechanic will reach out with updates on progress and timing.</p>
        <p>You can safely close this page.</p>
      </div>

      {/* Optional pay now CTA — links to existing /pay flow if invoice exists */}
      <div className="w-full pt-2">
        <p className="text-xs text-muted-foreground mb-2">
          Want to pay upfront? Your shop may send a payment link once the work is done.
        </p>
      </div>
    </motion.div>
  );
}

// ─── Line Item Components ────────────────────────────────────────────────────

function LaborSection({ lines }: { lines: Array<{ description: string; laborHours: number; laborRate: number }> }) {
  if (lines.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <Hammer size={12} />
        Labor
      </div>
      {lines.map((line, i) => (
        <div key={i} className="flex items-start justify-between gap-3 text-sm">
          <div className="flex-1 min-w-0">
            <p className="text-foreground">{line.description}</p>
            <p className="text-xs text-muted-foreground">
              {line.laborHours} hr × {formatCurrency(line.laborRate)}/hr
            </p>
          </div>
          <span className="font-medium shrink-0">{formatCurrency(line.laborHours * line.laborRate)}</span>
        </div>
      ))}
    </div>
  );
}

function PartsSection({ lines }: { lines: Array<{ description: string; quantity: number; unitPrice: number }> }) {
  if (lines.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <Package size={12} />
        Parts
      </div>
      {lines.map((line, i) => (
        <div key={i} className="flex items-start justify-between gap-3 text-sm">
          <div className="flex-1 min-w-0">
            <p className="text-foreground">{line.description}</p>
            <p className="text-xs text-muted-foreground">
              Qty {line.quantity} × {formatCurrency(line.unitPrice)}
            </p>
          </div>
          <span className="font-medium shrink-0">{formatCurrency(line.quantity * line.unitPrice)}</span>
        </div>
      ))}
    </div>
  );
}

function FeesSection({ lines }: { lines: Array<{ description: string; amount: number }> }) {
  if (lines.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <Receipt size={12} />
        Shop Fees
      </div>
      {lines.map((line, i) => (
        <div key={i} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-foreground">{line.description}</span>
          <span className="font-medium shrink-0">{formatCurrency(line.amount)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Estimate Card ───────────────────────────────────────────────────────────

function EstimateCard({ roId, token }: { roId: Id<"repairOrders">; token: string }) {
  const estimate = useQuery(api.estimates.getEstimatePublic, { roId, token });
  const approveEstimate = useMutation(api.estimates.approveEstimate);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [name, setName] = useState("");

  if (estimate === undefined) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 space-y-4">
        <Skeleton className="h-10 w-48 mx-auto" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (estimate === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-4">
        <AlertCircle size={40} className="text-destructive" />
        <h2 className="text-xl font-bold">Estimate Not Found</h2>
        <p className="text-muted-foreground text-sm">
          This estimate link may be invalid or expired. Please contact your mechanic.
        </p>
      </div>
    );
  }

  // Already approved or further along
  const isApproved = estimate.status !== "estimate";

  if (approved) {
    return (
      <ApprovalSuccess
        orgName={estimate.orgName}
        roNumber={estimate.roNumber}
        totalAmount={estimate.totalAmount}
        roId={roId}
      />
    );
  }

  if (isApproved) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-4 max-w-sm mx-auto"
      >
        <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
          <ShieldCheck size={32} className="text-green-400" />
        </div>
        <h2 className="text-xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
          Already Approved
        </h2>
        <p className="text-muted-foreground text-sm">
          This estimate for <strong>{estimate.roNumber}</strong> was approved
          {estimate.authorizationName ? ` by ${estimate.authorizationName}` : ""}.
          Work is underway.
        </p>
        {estimate.orgPhone && (
          <a
            href={`tel:${estimate.orgPhone}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer"
          >
            <Phone size={13} />
            Questions? Call {estimate.orgPhone}
          </a>
        )}
      </motion.div>
    );
  }

  const handleApprove = async () => {
    if (!name.trim()) {
      toast.error("Please enter your name to approve");
      return;
    }
    setApproving(true);
    try {
      await approveEstimate({ roId, token, customerName: name.trim() });
      setApproved(true);
      toast.success("Estimate approved!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to approve";
      toast.error(msg);
      setApproving(false);
    }
  };

  const hasLineItems = estimate.laborLines.length > 0 || estimate.partLines.length > 0 || estimate.shopFees.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-lg mx-auto px-4 py-8 space-y-5"
    >
      {/* Shop header */}
      <div className="text-center space-y-2">
        {estimate.orgLogoUrl ? (
          <img src={estimate.orgLogoUrl} alt={estimate.orgName} className="h-10 mx-auto object-contain" />
        ) : (
          <h1 className="text-xl font-bold text-primary" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            {estimate.orgName}
          </h1>
        )}
        <p className="text-xs text-muted-foreground">Estimate for Your Approval</p>
      </div>

      {/* Estimate card */}
      <Card className="border-border">
        <CardContent className="p-5 space-y-5">
          {/* RO header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench size={16} className="text-primary" />
              <span className="font-bold text-lg" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                {estimate.roNumber}
              </span>
            </div>
            <Badge className="bg-yellow-500/15 text-yellow-400">
              Pending Approval
            </Badge>
          </div>

          {/* Vehicle and concern */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Car size={13} />
              <span>{estimate.vehicleSummary}</span>
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">Concern: </span>
              {estimate.complaint}
            </div>
          </div>

          {/* Inspection findings / diagnosis */}
          {estimate.cause && (
            <div className="bg-muted/40 border border-border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Wrench size={12} />
                Inspection Findings
              </div>
              <div className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                {estimate.cause}
              </div>
            </div>
          )}

          {/* Line items */}
          {hasLineItems ? (
            <div className="space-y-4 border-t border-border pt-4">
              <LaborSection lines={estimate.laborLines} />
              <PartsSection lines={estimate.partLines} />
              <FeesSection lines={estimate.shopFees} />
            </div>
          ) : (
            <div className="border-t border-border pt-4 text-sm text-muted-foreground text-center py-4">
              No line items have been added yet. Your mechanic is preparing the estimate.
            </div>
          )}

          {/* Totals */}
          {hasLineItems && (
            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(estimate.subtotal)}</span>
              </div>
              {estimate.taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatCurrency(estimate.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t border-border pt-2">
                <span>Estimated Total</span>
                <span className="text-primary">{formatCurrency(estimate.totalAmount)}</span>
              </div>
            </div>
          )}

          {/* Approval section */}
          <div className="border-t border-border pt-5 space-y-3">
            <p className="text-xs text-muted-foreground">
              By approving, you authorize <strong>{estimate.orgName}</strong> to perform the work described above.
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="approve-name">
                Your Name
              </label>
              <Input
                id="approve-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={estimate.customerName}
                className="h-11"
              />
            </div>
            <Button
              className="w-full h-14 text-lg font-bold cursor-pointer"
              onClick={handleApprove}
              disabled={approving || !name.trim()}
            >
              <ShieldCheck size={20} className="mr-2" />
              {approving ? "Approving..." : "Approve Estimate"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Shop contact */}
      {estimate.orgPhone && (
        <div className="text-center">
          <a
            href={`tel:${estimate.orgPhone}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer"
          >
            <Phone size={13} />
            Questions? Call {estimate.orgPhone}
          </a>
        </div>
      )}

      {/* Fine print */}
      <p className="text-[10px] text-muted-foreground/60 text-center px-4">
        Final charges may differ slightly if additional repairs are needed during service. Your mechanic will contact you before proceeding with any additional work.
      </p>
    </motion.div>
  );
}

// ─── Page Root ────────────────────────────────────────────────────────────────

export default function ApprovePage() {
  const [searchParams] = useSearchParams();
  const roId = searchParams.get("ro") as Id<"repairOrders"> | null;
  const token = searchParams.get("token");

  if (!roId || !token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center space-y-4">
        <AlertCircle size={40} className="text-muted-foreground" />
        <h2 className="text-xl font-bold">No Estimate Specified</h2>
        <p className="text-muted-foreground text-sm">
          This page requires a valid estimate link. Please use the link provided by your mechanic.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-4">
      <EstimateCard roId={roId} token={token} />
    </div>
  );
}
