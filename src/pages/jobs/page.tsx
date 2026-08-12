import { useState } from "react";
import { usePaginatedQuery, useMutation } from "convex/react";
import { Authenticated, Unauthenticated } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useLocationFilter } from "@/hooks/use-location-filter.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import {
  Wrench, Plus, Search, Car, User, LayoutGrid, List,
  Clock, AlertTriangle, CheckCircle2, Package, XCircle, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import ROCreateDialog from "./_components/ROCreateDialog.tsx";
import RODetailSheet from "./_components/RODetailSheet.tsx";
import BayBoard from "./_components/BayBoard.tsx";

// ─── Promise time label ────────────────────────────────────────────────────────

function PromiseTimeLabel({ promisedAt }: { promisedAt: string }) {
  const isOverdue = new Date(promisedAt) < new Date();
  return (
    <div className={cn("flex items-center gap-1 text-xs font-medium", isOverdue ? "text-red-400" : "text-muted-foreground")}>
      <Clock size={11} />
      {isOverdue ? "Overdue — " : "Promise: "}
      {new Date(promisedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
    </div>
  );
}

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  estimate: "Estimate",
  approved: "Approved",
  in_progress: "In Progress",
  waiting_parts: "Waiting Parts",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  estimate: "bg-muted text-muted-foreground",
  approved: "bg-blue-500/15 text-blue-400",
  in_progress: "bg-primary/15 text-primary",
  waiting_parts: "bg-yellow-500/15 text-yellow-400",
  completed: "bg-green-500/15 text-green-400",
  invoiced: "bg-purple-500/15 text-purple-400",
  cancelled: "bg-destructive/15 text-destructive",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground",
  normal: "text-foreground",
  high: "text-red-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[status] ?? "bg-muted")}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── RO Card ──────────────────────────────────────────────────────────────────

type ROSummary = {
  _id: Id<"repairOrders">;
  roNumber: string;
  status: string;
  priority: string;
  complaint: string;
  customerName: string;
  vehicleSummary: string;
  bayName?: string;
  isMobile: boolean;
  totalAmount: number;
  scheduledAt?: string;
  promisedAt?: string;
  _creationTime: number;
};

function ROCard({ ro, onClick }: { ro: ROSummary; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-accent/20 transition-colors space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs text-muted-foreground shrink-0">{ro.roNumber}</span>
          <StatusBadge status={ro.status} />
          {ro.priority === "high" && <AlertTriangle size={13} className="text-red-400 shrink-0" />}
        </div>
        {ro.totalAmount > 0 && (
          <span className="text-sm font-semibold text-foreground shrink-0">
            ${ro.totalAmount.toFixed(2)}
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-foreground truncate">{ro.complaint}</p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><User size={11} />{ro.customerName}</span>
        <span className="flex items-center gap-1"><Car size={11} />{ro.vehicleSummary}</span>
        {ro.bayName && <span className="flex items-center gap-1"><LayoutGrid size={11} />{ro.bayName}</span>}
        {ro.isMobile && <span className="text-primary">Mobile</span>}
      </div>
      {ro.promisedAt && !["completed", "invoiced", "cancelled"].includes(ro.status) && (
        <PromiseTimeLabel promisedAt={ro.promisedAt} />
      )}
    </button>
  );
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTER_TABS = [
  { value: "active", label: "Active", statuses: ["estimate", "approved", "in_progress", "waiting_parts"] },
  { value: "completed", label: "Completed", statuses: ["completed", "invoiced"] },
  { value: "all", label: "All", statuses: [] },
];

// ─── Jobs Inner ───────────────────────────────────────────────────────────────

function JobsInner() {
  const { selectedLocationId } = useLocationFilter();
  const { results: ros, status, loadMore } = usePaginatedQuery(
    api.repairOrders.listROs,
    selectedLocationId ? { locationId: selectedLocationId } : {},
    { initialNumItems: 50 }
  );
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState("active");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedROId, setSelectedROId] = useState<Id<"repairOrders"> | null>(null);

  const tabConfig = FILTER_TABS.find((t) => t.value === filterTab)!;

  const filtered = (ros ?? []).filter((ro) => {
    const matchesTab =
      tabConfig.statuses.length === 0 || tabConfig.statuses.includes(ro.status);
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      ro.roNumber.toLowerCase().includes(q) ||
      ro.customerName.toLowerCase().includes(q) ||
      ro.vehicleSummary.toLowerCase().includes(q) ||
      ro.complaint.toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  const counts = {
    active: (ros ?? []).filter((r) =>
      ["estimate", "approved", "in_progress", "waiting_parts"].includes(r.status)
    ).length,
    completed: (ros ?? []).filter((r) => ["completed", "invoiced"].includes(r.status)).length,
    all: (ros ?? []).length,
  };

  const isLoading = status === "LoadingFirstPage";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            <Wrench size={22} className="text-primary" /> Repair Orders
          </h1>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant={viewMode === "board" ? "secondary" : "ghost"}
              className="h-8 w-8"
              onClick={() => setViewMode("board")}
              title="Bay Board"
            >
              <LayoutGrid size={15} />
            </Button>
            <Button
              size="icon"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              className="h-8 w-8"
              onClick={() => setViewMode("list")}
              title="List"
            >
              <List size={15} />
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} className="mr-1" /> New Repair Order
            </Button>
          </div>
        </div>

        {viewMode === "list" && (
          <>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Search by order #, customer, vehicle, complaint..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setFilterTab(tab.value)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer",
                    filterTab === tab.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label} ({counts[tab.value as keyof typeof counts]})
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === "board" ? (
          <BayBoard onSelectRO={(id) => setSelectedROId(id)} />
        ) : isLoading ? (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Wrench /></EmptyMedia>
              <EmptyTitle>{search ? "No results" : "No repair orders"}</EmptyTitle>
              <EmptyDescription>
                {search ? "Try a different search." : "Create your first repair order to get started."}
              </EmptyDescription>
            </EmptyHeader>
            {!search && (
              <EmptyContent>
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <Plus size={14} className="mr-1" /> New Repair Order
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((ro) => (
              <ROCard key={ro._id} ro={ro} onClick={() => setSelectedROId(ro._id)} />
            ))}
            {status === "CanLoadMore" && (
              <div className="col-span-full flex justify-center pt-2">
                <Button variant="secondary" size="sm" onClick={() => loadMore(50)} className="cursor-pointer">
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <ROCreateDialog open={showCreate} onClose={() => setShowCreate(false)} />
      {selectedROId && (
        <RODetailSheet
          roId={selectedROId}
          onClose={() => setSelectedROId(null)}
        />
      )}
    </div>
  );
}

export default function JobsPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center"><SignInButton /></div>
      </Unauthenticated>
      <Authenticated>
        <JobsInner />
      </Authenticated>
    </>
  );
}
