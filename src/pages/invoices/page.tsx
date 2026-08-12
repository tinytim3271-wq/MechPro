import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { Authenticated, Unauthenticated } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useLocationFilter } from "@/hooks/use-location-filter.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  FileText, Plus, Search, DollarSign, CheckCircle2, Clock,
  AlertCircle, ChevronRight, FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import InvoiceDetailSheet from "./_components/InvoiceDetailSheet.tsx";
import QuickBooksExportDialog from "./_components/QuickBooksExportDialog.tsx";

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-400",
  partial: "bg-yellow-500/15 text-yellow-400",
  paid: "bg-green-500/15 text-green-400",
  void: "bg-destructive/15 text-destructive",
};

// ─── Generate Invoice Dialog ──────────────────────────────────────────────────

function GenerateInvoiceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { results: completedROs } = usePaginatedQuery(api.repairOrders.listROs, {}, { initialNumItems: 100 });
  const createInvoice = useMutation(api.invoices.createInvoiceFromRO);

  const [roId, setRoId] = useState<Id<"repairOrders"> | "">("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);

  // Only show ROs that are completed or in_progress (not already invoiced)
  const eligibleROs = (completedROs ?? []).filter(
    (r) => r.status === "completed" || r.status === "approved" || r.status === "in_progress"
  );

  const handleClose = () => {
    setRoId("");
    setDueAt("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!roId) { toast.error("Select a repair order"); return; }
    setSaving(true);
    try {
      await createInvoice({
        roId: roId as Id<"repairOrders">,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      toast.success("Invoice created");
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create invoice";
      toast.error(msg.includes("already exists") ? "An invoice already exists for this RO" : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Invoice from Repair Order</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
          <Label>Repair Order *</Label>
            <Select
              value={roId || "none"}
              onValueChange={(v) => setRoId(v === "none" ? "" : v as Id<"repairOrders">)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a repair order..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select repair order...</SelectItem>
                {eligibleROs.map((ro) => (
                  <SelectItem key={ro._id} value={ro._id}>
                    {ro.roNumber} — {ro.customerName} · {ro.vehicleSummary}
                    {ro.totalAmount > 0 ? ` ($${ro.totalAmount.toFixed(2)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {eligibleROs.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No eligible repair orders found. Complete a repair order first.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Due Date (optional)</Label>
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !roId}>
            {saving ? "Creating..." : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Summary Stats ─────────────────────────────────────────────────────────────

type InvoiceSummary = {
  _id: Id<"invoices">;
  invoiceNumber: string;
  status: string;
  total: number;
  amountPaid: number;
  balance: number;
  customerName: string;
  roNumber: string;
  vehicleSummary: string;
  issuedAt: string;
};

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-bold mt-0.5", color ?? "text-foreground")}>{value}</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function InvoicesInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedLocationId } = useLocationFilter();
  const { results: invoices, status, loadMore } = usePaginatedQuery(
    api.invoices.listInvoices,
    selectedLocationId ? { locationId: selectedLocationId } : {},
    { initialNumItems: 50 }
  );
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showGenerate, setShowGenerate] = useState(false);
  const [showQBExport, setShowQBExport] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<Id<"invoices"> | null>(null);

  // Auto-open invoice from URL parameter (e.g. after navigating from RO)
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) {
      setSelectedInvoiceId(openId as Id<"invoices">);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const list = invoices ?? [];

  const filtered = list.filter((inv) => {
    const matchesStatus = filterStatus === "all" || inv.status === filterStatus;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.customerName.toLowerCase().includes(q) ||
      inv.roNumber.toLowerCase().includes(q) ||
      inv.vehicleSummary.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  // Stats
  const totalRevenue = list
    .filter((i) => i.status === "paid" || i.status === "partial")
    .reduce((s, i) => s + i.amountPaid, 0);
  const outstanding = list
    .filter((i) => i.status !== "paid" && i.status !== "void")
    .reduce((s, i) => s + i.balance, 0);
  const paidCount = list.filter((i) => i.status === "paid").length;
  const openCount = list.filter((i) => ["draft", "sent", "partial"].includes(i.status)).length;

  const isLoading = status === "LoadingFirstPage";

  const FILTER_OPTIONS = [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "sent", label: "Sent" },
    { value: "partial", label: "Partial" },
    { value: "paid", label: "Paid" },
    { value: "void", label: "Void" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2 shrink-0" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            <FileText size={22} className="text-primary" /> Invoices
          </h1>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowQBExport(true)} className="cursor-pointer hidden sm:flex">
              <FileSpreadsheet size={14} className="mr-1" /> QuickBooks Export
            </Button>
            <Button size="icon" variant="secondary" onClick={() => setShowQBExport(true)} className="cursor-pointer sm:hidden h-8 w-8">
              <FileSpreadsheet size={14} />
            </Button>
            <Button size="sm" onClick={() => setShowGenerate(true)} className="cursor-pointer">
              <Plus size={14} className="mr-1" /> <span className="hidden sm:inline">New Invoice</span><span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard label="Total Revenue" value={`$${totalRevenue.toFixed(2)}`} color="text-green-400" />
          <StatCard label="Outstanding" value={`$${outstanding.toFixed(2)}`} color={outstanding > 0 ? "text-yellow-400" : "text-foreground"} />
          <StatCard label="Paid Invoices" value={String(paidCount)} color="text-primary" />
          <StatCard label="Open Invoices" value={String(openCount)} />
        </div>

        {/* Search + filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer",
                filterStatus === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><FileText /></EmptyMedia>
              <EmptyTitle>{search || filterStatus !== "all" ? "No results" : "No invoices yet"}</EmptyTitle>
              <EmptyDescription>
                {search || filterStatus !== "all"
                  ? "Try adjusting your search or filter."
                  : "Generate your first invoice from a completed repair order."}
              </EmptyDescription>
            </EmptyHeader>
            {!search && filterStatus === "all" && (
              <EmptyContent>
                <Button size="sm" onClick={() => setShowGenerate(true)}>
                  <Plus size={14} className="mr-1" /> New Invoice
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((inv) => (
              <button
                key={inv._id}
                onClick={() => setSelectedInvoiceId(inv._id)}
                className="w-full text-left px-4 py-3 hover:bg-accent/20 transition-colors flex items-center gap-3"
              >
                {/* Status indicator */}
                <div className={cn(
                  "w-1.5 h-10 rounded-full shrink-0",
                  inv.status === "paid" ? "bg-green-400" :
                  inv.status === "partial" ? "bg-yellow-400" :
                  inv.status === "sent" ? "bg-blue-400" :
                  inv.status === "void" ? "bg-destructive" : "bg-muted"
                )} />

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{inv.invoiceNumber}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[inv.status])}>
                      {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                    </span>
                    <span className="text-xs text-muted-foreground">{inv.roNumber}</span>
                  </div>
                  <p className="font-semibold text-foreground truncate">{inv.customerName}</p>
                  <p className="text-xs text-muted-foreground truncate">{inv.vehicleSummary}</p>
                </div>

                {/* Amounts */}
                <div className="text-right shrink-0">
                  <p className="font-bold text-foreground">${inv.total.toFixed(2)}</p>
                  {inv.balance > 0 && inv.status !== "void" && (
                    <p className="text-xs text-red-400">Due: ${inv.balance.toFixed(2)}</p>
                  )}
                  {inv.status === "paid" && (
                    <p className="text-xs text-green-400 flex items-center gap-1 justify-end">
                      <CheckCircle2 size={10} /> Paid
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(inv.issuedAt).toLocaleDateString()}
                  </p>
                </div>

                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
              </button>
            ))}
            {status === "CanLoadMore" && (
              <div className="flex justify-center p-4">
                <Button variant="secondary" size="sm" onClick={() => loadMore(50)} className="cursor-pointer">
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <GenerateInvoiceDialog open={showGenerate} onClose={() => setShowGenerate(false)} />
      <QuickBooksExportDialog open={showQBExport} onClose={() => setShowQBExport(false)} />
      {selectedInvoiceId && (
        <InvoiceDetailSheet
          invoiceId={selectedInvoiceId}
          onClose={() => setSelectedInvoiceId(null)}
        />
      )}
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center"><SignInButton /></div>
      </Unauthenticated>
      <Authenticated>
        <InvoicesInner />
      </Authenticated>
    </>
  );
}
