import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Button } from "@/components/ui/button.tsx";
import { DollarSign, Clock, Wrench, Briefcase, FileText, Download, Banknote, Shirt, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { format } from "date-fns";
import { downloadCsv } from "@/lib/export-csv.ts";

type EmploymentType = "w2" | "1099" | undefined;

const EMPLOYMENT_BADGE: Record<NonNullable<EmploymentType>, { label: string; cls: string }> = {
  w2:  { label: "W-2 Employee",    cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  "1099": { label: "1099 Contractor", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
};

export default function MyPayTab() {
  const records = useQuery(api.payroll.getMyPayRecords, {});
  const deductions = useQuery(api.deductions.getMyDeductions, {});

  if (records === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><DollarSign /></EmptyMedia>
          <EmptyTitle>No pay records yet</EmptyTitle>
          <EmptyDescription>
            Pay records are created automatically when a customer invoice is marked as paid.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Aggregate totals
  const totalHours  = records.reduce((s, r) => s + r.totalHours, 0);
  const totalEarned = records.reduce((s, r) => s + r.totalEarned, 0);

  // Latest employment type (from most recent record)
  const latestType = records[0]?.employmentType as EmploymentType;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <DollarSign size={16} className="text-primary mx-auto mb-1" />
          <div className="text-xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            ${totalEarned.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">Total Earned</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <Clock size={16} className="text-primary mx-auto mb-1" />
          <div className="text-xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            {totalHours.toFixed(1)}h
          </div>
          <div className="text-xs text-muted-foreground">Flat-Rate Hours</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center col-span-2 sm:col-span-1">
          <Briefcase size={16} className="text-primary mx-auto mb-1" />
          {latestType ? (
            <div className={cn("text-xs px-2 py-0.5 rounded border font-semibold mx-auto w-fit mt-1", EMPLOYMENT_BADGE[latestType].cls)}>
              {EMPLOYMENT_BADGE[latestType].label}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground mt-1">Not set</div>
          )}
          <div className="text-xs text-muted-foreground mt-1">Employment Type</div>
        </div>
      </div>

      {/* Active Deductions */}
      {deductions && deductions.length > 0 && (
        <ActiveDeductionsSection deductions={deductions} />
      )}

      {/* Pay records list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Earnings History</h3>
          <Button
            size="sm"
            variant="secondary"
            className="cursor-pointer gap-1.5"
            onClick={() => {
              const today = format(new Date(), "yyyy-MM-dd");
              const rows = records.map((r) => ({
                "RO Number": r.roNumber,
                "Vehicle": r.vehicleSummary,
                "Customer": r.customerName,
                "Date Paid": new Date(r.paidAt).toLocaleDateString(),
                "Flat-Rate Hours": r.totalHours,
                "Total Earned ($)": r.totalEarned.toFixed(2),
                "Employment Type": r.employmentType ?? "Not set",
              }));
              downloadCsv(rows, `pay-records-${today}.csv`);
            }}
          >
            <Download size={14} />
            Export CSV
          </Button>
        </div>
        {records.map((r) => (
          <div
            key={r._id}
            className="bg-card border border-border rounded-lg p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Wrench size={13} className="text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                    {r.roNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.vehicleSummary} · {r.customerName}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-base text-primary">${r.totalEarned.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{r.totalHours.toFixed(1)}h flat-rate</p>
              </div>
            </div>

            {/* Labor breakdown */}
            {r.laborLines.length > 0 && (
              <div className="space-y-1 mt-2 border-t border-border pt-2">
                {r.laborLines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{l.description}</span>
                    <span className="text-foreground font-medium">
                      {l.laborHours}h × ${l.laborRate}/hr = <span className="text-primary">${l.amount.toFixed(2)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileText size={11} />
                Paid {format(new Date(r.paidAt), "MMM d, yyyy")}
              </div>
              {r.employmentType && (
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold", EMPLOYMENT_BADGE[r.employmentType].cls)}>
                  {EMPLOYMENT_BADGE[r.employmentType].label}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center pb-2">
        Showing all {records.length} pay record{records.length !== 1 ? "s" : ""}. Contact your manager with any discrepancies.
      </p>
    </div>
  );
}

// ─── Active Deductions Section ───────────────────────────────────────────────

type DeductionType = "advance" | "uniform" | "tools" | "other";

const DEDUCTION_ICONS: Record<DeductionType, typeof Banknote> = {
  advance: Banknote,
  uniform: Shirt,
  tools: Wrench,
  other: MoreHorizontal,
};

const DEDUCTION_LABELS: Record<DeductionType, string> = {
  advance: "Advance",
  uniform: "Uniform",
  tools: "Tools",
  other: "Other",
};

type Deduction = {
  _id: string;
  type: string;
  description: string;
  totalAmount: number;
  amountPerCheck?: number;
  amountApplied: number;
};

function ActiveDeductionsSection({ deductions }: { deductions: Deduction[] }) {
  const totalRemaining = deductions.reduce((sum, d) => sum + (d.totalAmount - d.amountApplied), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Active Deductions
        </h3>
        <span className="text-xs font-bold text-amber-400">
          -${totalRemaining.toFixed(2)} remaining
        </span>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 space-y-3">
        {deductions.map((d) => {
          const Icon = DEDUCTION_ICONS[d.type as DeductionType] ?? MoreHorizontal;
          const label = DEDUCTION_LABELS[d.type as DeductionType] ?? "Other";
          const remaining = d.totalAmount - d.amountApplied;
          const progress = d.totalAmount > 0 ? (d.amountApplied / d.totalAmount) * 100 : 0;

          return (
            <div key={d._id} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0">
                <Icon size={13} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{d.description}</p>
                  <span className="text-xs font-semibold text-amber-400 shrink-0">
                    -${remaining.toFixed(2)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {label} · ${d.amountApplied.toFixed(2)} of ${d.totalAmount.toFixed(2)} paid
                  {d.amountPerCheck ? ` · $${d.amountPerCheck.toFixed(2)}/check` : " · one-time"}
                </p>
                {/* Small progress bar */}
                <div className="w-full h-1 rounded-full bg-muted mt-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-muted-foreground text-center pt-1">
          Deductions are applied by your manager each pay period.
        </p>
      </div>
    </div>
  );
}
