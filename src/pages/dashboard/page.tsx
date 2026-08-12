import { lazy, Suspense, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useLocationFilter } from "@/hooks/use-location-filter.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Wrench, DollarSign, AlertCircle, Users, Clock,
  UserCog, Car, Layers, Plus, ArrowRight, Settings, UserPlus, X,
  Package, Share2, Copy, Check, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import NewIntakeWizard from "./_components/NewIntakeWizard.tsx";
import RevenueComparison from "./_components/RevenueComparison.tsx";
import SetupChecklist from "./_components/SetupChecklist.tsx";
import WhatsNew from "./_components/WhatsNew.tsx";
import { useNavigate } from "react-router-dom";

// Lazy-load heavy detail panel — only downloaded when someone clicks a repair order
const RODetailSheet = lazy(() => import("@/pages/jobs/_components/RODetailSheet.tsx"));

const statusColors: Record<string, string> = {
  estimate: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  approved: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  in_progress: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  waiting_parts: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  invoiced: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

const statusLabels: Record<string, string> = {
  estimate: "Estimate",
  approved: "Approved",
  in_progress: "In Progress",
  waiting_parts: "Waiting Parts",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

export default function Dashboard() {
  const { selectedLocationId } = useLocationFilter();
  const locArgs = selectedLocationId ? { locationId: selectedLocationId } : {};
  const stats = useQuery(api.dashboard.getDashboardStats, locArgs);
  const recentROs = useQuery(api.dashboard.getRecentROs, locArgs);
  const bayBoard = useQuery(api.dashboard.getBayBoard, locArgs);
  const alerts = useQuery(api.dashboard.getActionAlerts, locArgs);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [selectedROId, setSelectedROId] = useState<Id<"repairOrders"> | null>(null);
  const navigate = useNavigate();

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Setup Checklist — persistent until all steps complete */}
      <SetupChecklist onStartIntake={() => setIntakeOpen(true)} />

      {/* What's New — dismissible per update */}
      <WhatsNew />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-bold text-foreground"
            style={{ fontFamily: "Rajdhani, sans-serif" }}
          >
            {stats?.orgName ?? "Dashboard"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <Button
          size="lg"
          className="cursor-pointer shrink-0 gap-2 text-base font-semibold px-5"
          style={{ fontFamily: "Rajdhani, sans-serif" }}
          onClick={() => setIntakeOpen(true)}
        >
          <Plus size={18} />
          New Intake
        </Button>
      </div>

      {/* Action Needed */}
      {alerts && (alerts.overdueInvoices > 0 || alerts.lowStockParts > 0 || alerts.overdueJobs > 0) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
              Action Needed
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
          {alerts.overdueInvoices > 0 && (
            <button
              onClick={() => navigate("/invoices")}
              className="flex items-center gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-left hover:bg-red-500/20 transition-colors cursor-pointer"
            >
              <DollarSign size={16} className="text-red-400 shrink-0" />
              <span className="text-sm font-medium text-red-300">
                {alerts.overdueInvoices} overdue invoice{alerts.overdueInvoices !== 1 ? "s" : ""}
              </span>
            </button>
          )}
          {alerts.lowStockParts > 0 && (
            <button
              onClick={() => navigate("/parts")}
              className="flex items-center gap-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-left hover:bg-yellow-500/20 transition-colors cursor-pointer"
            >
              <Package size={16} className="text-yellow-400 shrink-0" />
              <span className="text-sm font-medium text-yellow-300">
                {alerts.lowStockParts} part{alerts.lowStockParts !== 1 ? "s" : ""} low on stock
              </span>
            </button>
          )}
          {alerts.overdueJobs > 0 && (
            <button
              onClick={() => navigate("/jobs")}
              className="flex items-center gap-2.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 text-left hover:bg-orange-500/20 transition-colors cursor-pointer"
            >
              <Clock size={16} className="text-orange-400 shrink-0" />
              <span className="text-sm font-medium text-orange-300">
                {alerts.overdueJobs} job{alerts.overdueJobs !== 1 ? "s" : ""} past promise time
              </span>
            </button>
          )}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {stats === undefined ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : stats === null ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <p className="text-muted-foreground text-sm col-span-4">We couldn't load your shop data. Try refreshing the page.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Wrench} label="Today's ROs" value={stats.todayROsCount} iconClass="text-primary" />
          <StatCard icon={Clock} label="In Progress" value={stats.inProgressCount} iconClass="text-orange-400" />
          <StatCard icon={AlertCircle} label="Estimates" value={stats.estimateCount} iconClass="text-blue-400" />
          <StatCard icon={AlertCircle} label="Waiting Parts" value={stats.waitingPartsCount} iconClass="text-yellow-400" />
          <StatCard
            icon={DollarSign}
            label="Revenue Collected"
            value={`$${stats.paidRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            iconClass="text-green-400"
          />
          <StatCard
            icon={AlertCircle}
            label="Outstanding"
            value={`$${stats.outstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            iconClass="text-red-400"
          />
          <StatCard icon={UserCog} label="Active Staff" value={stats.activeStaff} iconClass="text-blue-400" />
          <StatCard icon={Users} label="Total Customers" value={stats.totalCustomers} iconClass="text-purple-400" />
        </div>
      )}

      {/* Quick Share Links */}
      {stats && <QuickShareBar orgId={stats.orgId} />}

      {/* Revenue Period Comparison */}
      <RevenueComparison locationId={selectedLocationId ?? undefined} />

      {/* Bay Board */}
      {bayBoard && bayBoard.bayNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle
              className="text-lg flex items-center gap-2"
              style={{ fontFamily: "Rajdhani, sans-serif" }}
            >
              <Layers size={20} className="text-primary" />
              Bay Board
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {bayBoard.bayNames.map((bayName) => {
                const ro = bayBoard.bayMap[bayName];
                return (
                  <div
                    key={bayName}
                    className={cn(
                      "rounded-lg border p-3 min-h-[90px] flex flex-col justify-between transition-colors",
                      ro
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-secondary/30"
                    )}
                  >
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {bayName}
                    </p>
                    {ro ? (
                      <div className="mt-1 space-y-1">
                        <p className="text-xs font-medium text-foreground truncate">
                          {ro.roNumber}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] px-1.5 py-0", statusColors[ro.status])}
                        >
                          {statusLabels[ro.status]}
                        </Badge>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-auto">Open</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Repair Orders */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
              <Wrench size={20} className="text-primary" />
              Recent Repair Orders
            </CardTitle>
            <Button
              size="sm"
              variant="secondary"
              className="cursor-pointer gap-1.5"
              onClick={() => setIntakeOpen(true)}
            >
              <Plus size={13} /> New Intake
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentROs === undefined ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : recentROs.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Car size={20} className="text-primary" />
              </div>
              <p className="text-muted-foreground text-sm">No repair orders yet.</p>
              <Button
                size="sm"
                onClick={() => setIntakeOpen(true)}
                className="cursor-pointer"
              >
                <Plus size={13} className="mr-1" /> Create First Intake
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentROs.map((ro) => (
                <button
                  key={ro._id}
                  onClick={() => setSelectedROId(ro._id)}
                  className="w-full flex items-center justify-between p-3 rounded-md bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Car size={14} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {ro.roNumber} — {ro.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {ro.vehicleSummary} {ro.isMobile ? "· Mobile" : ro.bayName ? `· ${ro.bayName}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 ml-3">
                    <Badge
                      variant="outline"
                      className={cn("text-xs capitalize", statusColors[ro.status])}
                    >
                      {statusLabels[ro.status]}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <NewIntakeWizard open={intakeOpen} onOpenChange={setIntakeOpen} />
      {selectedROId && (
        <Suspense fallback={null}>
          <RODetailSheet roId={selectedROId} onClose={() => setSelectedROId(null)} />
        </Suspense>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  iconClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon size={18} className={iconClass} />
        </div>
        <p
          className="text-2xl font-bold text-foreground"
          style={{ fontFamily: "Rajdhani, sans-serif" }}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function QuickShareBar({ orgId }: { orgId: string }) {
  const [copiedBooking, setCopiedBooking] = useState(false);
  const [copiedPortal, setCopiedPortal] = useState(false);
  const baseUrl = window.location.origin;
  const bookingUrl = `${baseUrl}/book?org=${orgId}`;
  const portalUrl = `${baseUrl}/portal?org=${orgId}`;

  const copyLink = (url: string, type: "booking" | "portal") => {
    navigator.clipboard.writeText(url);
    if (type === "booking") {
      setCopiedBooking(true);
      setTimeout(() => setCopiedBooking(false), 2000);
    } else {
      setCopiedPortal(true);
      setTimeout(() => setCopiedPortal(false), 2000);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1 flex items-center gap-3 rounded-lg border border-border bg-card p-3">
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Calendar size={14} className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">Booking Page</p>
          <p className="text-xs text-muted-foreground truncate">{bookingUrl}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer shrink-0"
          onClick={() => copyLink(bookingUrl, "booking")}
        >
          {copiedBooking ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </Button>
      </div>
      <div className="flex-1 flex items-center gap-3 rounded-lg border border-border bg-card p-3">
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Share2 size={14} className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">Customer Portal</p>
          <p className="text-xs text-muted-foreground truncate">{portalUrl}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer shrink-0"
          onClick={() => copyLink(portalUrl, "portal")}
        >
          {copiedPortal ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </Button>
      </div>
    </div>
  );
}
