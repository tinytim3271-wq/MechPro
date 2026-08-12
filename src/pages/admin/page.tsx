import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Shield, Users, Wrench, DollarSign, TrendingUp, AlertTriangle,
  Package, CheckCircle2, Clock, Circle, Ban, ChevronDown,
  Settings, BarChart3, ClipboardList, FileText, UserCog, Download,
  Receipt, Activity, Percent, UserX, Gift, CreditCard, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { downloadCsv } from "@/lib/export-csv.ts";
import { format } from "date-fns";
import CustomerRetentionTab from "./_components/CustomerRetentionTab.tsx";
import FreeAccessTab from "./_components/FreeAccessTab.tsx";

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  estimate: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  approved: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  in_progress: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  waiting_parts: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  invoiced: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  estimate: "Estimate", approved: "Approved", in_progress: "In Progress",
  waiting_parts: "Waiting Parts", completed: "Completed", invoiced: "Invoiced", cancelled: "Cancelled",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner", admin: "Admin", service_writer: "Service Writer",
  mechanic: "Mechanic", mobile_mechanic: "Mobile Mechanic",
};

const PIE_COLORS = ["#ef4444", "#f97316", "#3b82f6", "#8b5cf6", "#22c55e", "#14b8a6", "#6b7280"];

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const stats = useQuery(api.admin.getAdminStats, {});

  if (stats === undefined) {
    return <div className="space-y-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  const roChartData = Object.entries(stats.roByStatus).map(([key, val]) => ({
    name: STATUS_LABELS[key] ?? key,
    value: val as number,
  })).filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Total Revenue" value={`$${stats.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} color="text-green-400" />
        <KpiCard icon={AlertTriangle} label="Outstanding" value={`$${stats.outstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} color="text-red-400" />
        <KpiCard icon={Wrench} label="Total ROs" value={stats.totalROs} color="text-primary" />
        <KpiCard icon={Users} label="Active Staff" value={stats.activeMembers} color="text-blue-400" />
        <KpiCard icon={CheckCircle2} label="Completed" value={stats.roByStatus.completed} color="text-green-400" />
        <KpiCard icon={Clock} label="In Progress" value={stats.roByStatus.in_progress} color="text-orange-400" />
        <KpiCard icon={Package} label="Low Stock Parts" value={stats.lowStockCount} color="text-yellow-400" />
        <KpiCard icon={ClipboardList} label="Pending POs" value={stats.pendingPOs} color="text-purple-400" />
      </div>

      {/* Revenue trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            <TrendingUp size={18} className="text-primary" /> Revenue — Last 30 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.revenueByDay.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">No payments recorded in the last 30 days.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.revenueByDay}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={(v: number) => `$${v}`} />
                <Tooltip
                  formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]}
                  contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  labelStyle={{ color: "var(--color-foreground)" }}
                />
                <Area type="monotone" dataKey="amount" stroke="var(--color-primary)" fill="url(#revenueGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* RO Status chart + Member breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base" style={{ fontFamily: "Rajdhani, sans-serif" }}>RO Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            {roChartData.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">No repair orders yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={roChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {roChartData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                    labelStyle={{ color: "var(--color-foreground)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base" style={{ fontFamily: "Rajdhani, sans-serif" }}>Staff by Role</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={Object.entries(stats.membersByRole).map(([role, count]) => ({ role: ROLE_LABELS[role] ?? role, count }))}>
                <XAxis dataKey="role" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  labelStyle={{ color: "var(--color-foreground)" }}
                />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

const EDITABLE_ROLES = ["admin", "service_writer", "mechanic", "mobile_mechanic"] as const;

function MembersTab() {
  const members = useQuery(api.admin.getAdminMembers, {});
  const updateMember = useMutation(api.employees.updateMember);

  const handleRoleChange = async (memberId: Id<"orgMembers">, role: typeof EDITABLE_ROLES[number]) => {
    try {
      await updateMember({ memberId, role });
      toast.success("Role updated");
    } catch {
      toast.error("Failed to update role");
    }
  };

  const handleToggleActive = async (memberId: Id<"orgMembers">, isActive: boolean) => {
    try {
      await updateMember({ memberId, isActive });
      toast.success(isActive ? "Member activated" : "Member deactivated");
    } catch {
      toast.error("Failed to update member");
    }
  };

  if (members === undefined) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {members.map((m) => (
          <Card key={m._id}>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Avatar + name */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                  m.isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {m.userName[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground">{m.userName}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.userEmail ?? "No email"}</p>
                  <p className="text-xs text-muted-foreground">{m.assignedJobs} active job{m.assignedJobs !== 1 ? "s" : ""}</p>
                </div>
              </div>

              {/* Role selector */}
              <div className="flex items-center gap-3">
                {m.role === "owner" ? (
                  <Badge variant="outline" className="text-yellow-400 border-yellow-400/40 bg-yellow-400/10">
                    Owner
                  </Badge>
                ) : (
                  <Select
                    value={m.role}
                    onValueChange={(v) => handleRoleChange(m._id, v as typeof EDITABLE_ROLES[number])}
                  >
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EDITABLE_ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="text-xs">{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Active toggle */}
                <button
                  onClick={() => handleToggleActive(m._id, !m.isActive)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-md border font-medium transition-colors cursor-pointer",
                    m.isActive
                      ? "border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                      : "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  )}
                >
                  {m.isActive ? <><Circle size={8} className="inline mr-1 fill-current" />Active</> : <><Ban size={10} className="inline mr-1" />Inactive</>}
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payroll Export */}
      <PayrollExportSection />

      {/* Billable Hours Report */}
      <BillableHoursReport />
    </div>
  );
}

// ─── Payroll Export Section ───────────────────────────────────────────────────

function PayrollExportSection() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const records = useQuery(
    api.payroll.getAllOrgPayRecords,
    {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    },
  );

  const handleExport = () => {
    if (!records || records.length === 0) {
      toast.error("No records to export");
      return;
    }
    const today = format(new Date(), "yyyy-MM-dd");
    const rows = records.map((r) => ({
      "Tech Name": r.memberName,
      "Role": ROLE_LABELS[r.role] ?? r.role,
      "RO Number": r.roNumber,
      "Vehicle": r.vehicleSummary,
      "Customer": r.customerName,
      "Date Paid": new Date(r.paidAt).toLocaleDateString(),
      "Hours": r.totalHours,
      "Earned ($)": r.totalEarned.toFixed(2),
      "Employment Type": r.employmentType ?? "Not set",
    }));
    downloadCsv(rows, `payroll-export-${today}.csv`);
    toast.success(`Exported ${rows.length} record${rows.length !== 1 ? "s" : ""}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
          <DollarSign size={18} className="text-primary" /> Payroll Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground"
            />
          </div>
          <Button
            size="sm"
            className="cursor-pointer gap-1.5"
            onClick={handleExport}
            disabled={records === undefined}
          >
            <Download size={14} />
            Export All Pay Records
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {records === undefined
            ? "Loading records..."
            : `${records.length} record${records.length !== 1 ? "s" : ""} found${startDate || endDate ? " in selected range" : ""}`}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Billable Hours Report ───────────────────────────────────────────────────

function BillableHoursReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedTech, setExpandedTech] = useState<string | null>(null);

  const report = useQuery(
    api.payroll.getBillableHoursReport,
    { startDate: startDate || undefined, endDate: endDate || undefined }
  );

  const totalHours = report?.reduce((s, t) => s + t.totalBillableHours, 0) ?? 0;
  const totalRevenue = report?.reduce((s, t) => s + t.totalLaborRevenue, 0) ?? 0;

  const handleExportCsv = () => {
    if (!report || report.length === 0) {
      toast.error("No data to export");
      return;
    }
    const rows: Array<Record<string, string | number>> = [];
    for (const tech of report) {
      for (const job of tech.jobs) {
        rows.push({
          "Mechanic": tech.memberName,
          "Role": tech.role,
          "Employment Type": tech.employmentType ?? "Not set",
          "RO Number": job.roNumber,
          "Customer": job.customerName,
          "Vehicle": job.vehicleSummary,
          "Status": job.status,
          "Date": job.date,
          "Billable Hours": job.laborHours,
          "Labor Revenue ($)": job.laborRevenue.toFixed(2),
        });
      }
    }
    const today = format(new Date(), "yyyy-MM-dd");
    downloadCsv(rows, `billable-hours-report-${today}.csv`);
    toast.success(`Exported ${rows.length} line item${rows.length !== 1 ? "s" : ""}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
          <Clock size={18} className="text-primary" /> Billable Hours Report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Labor hours from all repair orders assigned to each mechanic. Use this to calculate payroll based on billable work.
        </p>

        {/* Date filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground"
            />
          </div>
          <Button
            size="sm"
            className="cursor-pointer gap-1.5"
            onClick={handleExportCsv}
            disabled={report === undefined || report.length === 0}
          >
            <Download size={14} />
            Export CSV
          </Button>
        </div>

        {/* Summary totals */}
        {report !== undefined && report.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
              <p className="text-lg font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                {totalHours.toFixed(1)}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Hours</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
              <p className="text-lg font-bold text-primary" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                ${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Labor Revenue</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
              <p className="text-lg font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                {report.length}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Techs</p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {report === undefined && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        )}

        {/* Empty state */}
        {report !== undefined && report.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No billable hours found{startDate || endDate ? " in this date range" : ""}. Assign mechanics to repair orders and add labor lines to see their hours here.
          </p>
        )}

        {/* Per-tech breakdown */}
        {report !== undefined && report.length > 0 && (
          <div className="space-y-2">
            {report.map((tech) => (
              <div key={tech.memberId} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedTech(expandedTech === tech.memberId ? null : tech.memberId)}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                      {tech.memberName[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground">{tech.memberName}</p>
                      <p className="text-xs text-muted-foreground">
                        {tech.role} · {tech.jobCount} job{tech.jobCount !== 1 ? "s" : ""}
                        {tech.employmentType ? ` · ${tech.employmentType.toUpperCase()}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">{tech.totalBillableHours.toFixed(1)} hrs</p>
                      <p className="text-xs text-primary font-medium">${tech.totalLaborRevenue.toFixed(2)}</p>
                    </div>
                    <ChevronDown size={14} className={cn("text-muted-foreground transition-transform", expandedTech === tech.memberId && "rotate-180")} />
                  </div>
                </button>

                {expandedTech === tech.memberId && (
                  <div className="border-t border-border bg-muted/10 p-3 space-y-1.5">
                    <div className="grid grid-cols-5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-2 pb-1">
                      <span>RO #</span>
                      <span>Customer</span>
                      <span>Vehicle</span>
                      <span className="text-right">Hours</span>
                      <span className="text-right">Revenue</span>
                    </div>
                    {tech.jobs.map((job) => (
                      <div key={job.roId} className="grid grid-cols-5 text-xs px-2 py-1.5 rounded hover:bg-muted/30">
                        <span className="font-medium text-foreground">{job.roNumber}</span>
                        <span className="text-muted-foreground truncate">{job.customerName}</span>
                        <span className="text-muted-foreground truncate">{job.vehicleSummary}</span>
                        <span className="text-right font-medium">{job.laborHours.toFixed(1)}</span>
                        <span className="text-right text-primary font-medium">${job.laborRevenue.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── All ROs Tab ──────────────────────────────────────────────────────────────

function AllROsTab() {
  const [statusFilter, setStatusFilter] = useState("all");
  const members = useQuery(api.admin.getAdminMembers, {});
  const [memberFilter, setMemberFilter] = useState("all");
  const reassignRO = useMutation(api.admin.reassignRO);

  const ros = useQuery(api.admin.getAllROs, {
    status: statusFilter !== "all" ? statusFilter : undefined,
    assignedTo: memberFilter !== "all" ? (memberFilter as Id<"orgMembers">) : undefined,
  });

  const handleReassign = async (roId: Id<"repairOrders">, memberId: string) => {
    try {
      await reassignRO({
        roId,
        memberId: memberId === "unassigned" ? undefined : (memberId as Id<"orgMembers">),
      });
      toast.success("RO reassigned");
    } catch {
      toast.error("Failed to reassign");
    }
  };

  const techMembers = members?.filter((m) =>
    (m.role === "mechanic" || m.role === "mobile_mechanic") && m.isActive
  ) ?? [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={memberFilter} onValueChange={setMemberFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="All Techs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Techs</SelectItem>
            {techMembers.map((m) => (
              <SelectItem key={m._id} value={m._id} className="text-xs">{m.userName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="outline" className="h-8 px-3 text-xs text-muted-foreground">
          {ros?.length ?? "—"} ROs
        </Badge>
      </div>

      {/* List */}
      {ros === undefined ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : ros.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">No repair orders found.</p>
      ) : (
        <div className="space-y-2">
          {ros.map((ro) => (
            <Card key={ro._id}>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                      {ro.roNumber}
                    </span>
                    <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[ro.status])}>
                      {STATUS_LABELS[ro.status]}
                    </Badge>
                    <Badge variant="outline" className={cn("text-xs capitalize", {
                      "border-red-400/40 text-red-400 bg-red-400/10": ro.priority === "high",
                      "border-yellow-400/40 text-yellow-400 bg-yellow-400/10": ro.priority === "normal",
                      "border-muted-foreground/40 text-muted-foreground": ro.priority === "low",
                    })}>
                      {ro.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground">{ro.customerName} · {ro.vehicleSummary}</p>
                  <p className="text-xs text-muted-foreground truncate">{ro.complaint}</p>
                </div>

                {/* Assign Tech */}
                <div className="shrink-0">
                  <Select
                    value={ro.assignedTo ?? "unassigned"}
                    onValueChange={(v) => handleReassign(ro._id, v)}
                  >
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned" className="text-xs text-muted-foreground">Unassigned</SelectItem>
                      {techMembers.map((m) => (
                        <SelectItem key={m._id} value={m._id} className="text-xs">{m.userName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Invoices Tab ─────────────────────────────────────────────────────────────

const INV_STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  partial: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  paid: "bg-green-500/10 text-green-400 border-green-500/30",
  void: "bg-red-500/10 text-red-400 border-red-500/30",
};

function InvoicesTab() {
  const invoices = useQuery(api.admin.getAllInvoices, {});

  const totalPaid = invoices?.filter((i) => i.status === "paid").reduce((s, i) => s + i.amountPaid, 0) ?? 0;
  const totalOutstanding = invoices?.filter((i) => i.status !== "paid" && i.status !== "void")
    .reduce((s, i) => s + (i.total - i.amountPaid), 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Total Collected" value={`$${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} color="text-green-400" />
        <KpiCard icon={AlertTriangle} label="Outstanding" value={`$${totalOutstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} color="text-red-400" />
        <KpiCard icon={FileText} label="Total Invoices" value={invoices?.length ?? "—"} color="text-primary" />
        <KpiCard icon={CheckCircle2} label="Paid" value={invoices?.filter((i) => i.status === "paid").length ?? "—"} color="text-green-400" />
      </div>

      {/* Invoice list */}
      {invoices === undefined ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : invoices.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">No invoices yet.</p>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv._id} className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm" style={{ fontFamily: "Rajdhani, sans-serif" }}>{inv.invoiceNumber}</span>
                  <Badge variant="outline" className={cn("text-xs", INV_STATUS_COLORS[inv.status])}>
                    {inv.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{inv.customerName} · {new Date(inv.issuedAt).toLocaleDateString()}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-sm text-foreground">${inv.total.toFixed(2)}</p>
                {inv.amountPaid > 0 && inv.status !== "paid" && (
                  <p className="text-xs text-green-400">${inv.amountPaid.toFixed(2)} paid</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared KPI card ──────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string | number; color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon size={16} className={color} />
        </div>
        <p className="text-2xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ─── Reports Tab ─────────────────────────────────────────────────────────────

function getDefaultStartDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getDefaultEndDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function ReportsTab() {
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(getDefaultEndDate);
  const [submitted, setSubmitted] = useState(false);

  const queryArgs = useMemo(
    () => (submitted && startDate && endDate ? { startDate, endDate } : "skip" as const),
    [submitted, startDate, endDate]
  );

  const report = useQuery(api.admin.getFinancialReport, queryArgs);

  const handleRun = () => {
    if (!startDate || !endDate) {
      toast.error("Please select both start and end dates");
      return;
    }
    if (startDate > endDate) {
      toast.error("Start date must be before end date");
      return;
    }
    setSubmitted(true);
  };

  const handleExportCsv = () => {
    if (!report) return;
    const rows = report.invoices.map((inv) => ({
      "Invoice #": inv.invoiceNumber,
      Customer: inv.customerName,
      Vehicle: inv.vehicleSummary,
      Total: inv.total.toFixed(2),
      Paid: inv.amountPaid.toFixed(2),
      Balance: inv.balance.toFixed(2),
      Status: inv.status,
      "Issued Date": format(new Date(inv.issuedAt), "yyyy-MM-dd"),
    }));
    downloadCsv(rows, `financial-report-${startDate}-to-${endDate}.csv`);
    toast.success("CSV exported");
  };

  return (
    <div className="space-y-6">
      {/* Controls row */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setSubmitted(false); }}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setSubmitted(false); }}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <Button size="sm" className="cursor-pointer" onClick={handleRun}>
            <BarChart3 size={14} className="mr-1.5" /> Run Report
          </Button>
          {report && (
            <Button size="sm" variant="secondary" className="cursor-pointer" onClick={handleExportCsv}>
              <Download size={14} className="mr-1.5" /> Export CSV
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Empty state */}
      {!submitted && (
        <div className="text-center py-16 text-muted-foreground">
          <Receipt size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Select a date range and run the report to view financial data.</p>
        </div>
      )}

      {/* Loading state */}
      {submitted && report === undefined && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {/* Report data */}
      {report && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard icon={DollarSign} label="Total Revenue" value={`$${report.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} color="text-green-400" />
            <KpiCard icon={CheckCircle2} label="Paid Invoices" value={report.paidInvoiceCount} color="text-green-400" />
            <KpiCard icon={AlertTriangle} label="Outstanding" value={`$${report.outstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} color="text-red-400" />
            <KpiCard icon={Wrench} label="Labor Revenue" value={`$${report.totalLaborRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} color="text-blue-400" />
            <KpiCard icon={Package} label="Parts Revenue" value={`$${report.totalPartsRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} color="text-purple-400" />
            <KpiCard
              icon={TrendingUp}
              label="Net Margin"
              value={`$${report.netMargin.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
              color={report.netMargin >= 0 ? "text-green-400" : "text-red-400"}
            />
          </div>

          {/* Payroll summary */}
          {report.payrollByTech.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                  <Users size={18} className="text-primary" /> Payroll Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-4">Tech Name</th>
                        <th className="pb-2 pr-4">Type</th>
                        <th className="pb-2 pr-4 text-right">Hours</th>
                        <th className="pb-2 pr-4 text-right">Earned</th>
                        <th className="pb-2 text-right">% of Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.payrollByTech.map((tech) => (
                        <tr key={tech.memberName} className="border-b border-border/50">
                          <td className="py-2 pr-4 font-medium text-foreground">{tech.memberName}</td>
                          <td className="py-2 pr-4">
                            <Badge variant="outline" className="text-xs capitalize">
                              {tech.employmentType ?? "—"}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4 text-right">{tech.totalHours.toFixed(1)}</td>
                          <td className="py-2 pr-4 text-right">${tech.totalEarned.toFixed(2)}</td>
                          <td className="py-2 text-right">
                            {report.totalRevenue > 0
                              ? `${((tech.totalEarned / report.totalRevenue) * 100).toFixed(1)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="font-bold text-foreground">
                        <td className="pt-3" colSpan={2}>Total</td>
                        <td className="pt-3 text-right">
                          {report.payrollByTech.reduce((s, t) => s + t.totalHours, 0).toFixed(1)}
                        </td>
                        <td className="pt-3 text-right">
                          ${report.totalPayrollCost.toFixed(2)}
                        </td>
                        <td className="pt-3 text-right">
                          {report.totalRevenue > 0
                            ? `${((report.totalPayrollCost / report.totalRevenue) * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Invoice detail table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                <FileText size={18} className="text-primary" /> Invoice Detail ({report.invoices.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.invoices.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">No invoices in this date range.</p>
              ) : (
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-3">Invoice #</th>
                        <th className="pb-2 pr-3">Customer</th>
                        <th className="pb-2 pr-3">Vehicle</th>
                        <th className="pb-2 pr-3 text-right">Total</th>
                        <th className="pb-2 pr-3 text-right">Paid</th>
                        <th className="pb-2 pr-3 text-right">Balance</th>
                        <th className="pb-2 pr-3">Status</th>
                        <th className="pb-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.invoices.map((inv) => (
                        <tr key={inv.invoiceNumber} className="border-b border-border/50">
                          <td className="py-2 pr-3 font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-2 pr-3 text-foreground">{inv.customerName}</td>
                          <td className="py-2 pr-3 text-muted-foreground text-xs">{inv.vehicleSummary}</td>
                          <td className="py-2 pr-3 text-right">${inv.total.toFixed(2)}</td>
                          <td className="py-2 pr-3 text-right text-green-400">${inv.amountPaid.toFixed(2)}</td>
                          <td className="py-2 pr-3 text-right text-red-400">
                            {inv.balance > 0 ? `$${inv.balance.toFixed(2)}` : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className={cn("text-xs", INV_STATUS_COLORS[inv.status])}>
                              {inv.status}
                            </Badge>
                          </td>
                          <td className="py-2 text-xs text-muted-foreground">
                            {format(new Date(inv.issuedAt), "MMM d, yyyy")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Tech Performance Tab ────────────────────────────────────────────────────

function TechPerformanceTab() {
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(getDefaultEndDate);
  const [submitted, setSubmitted] = useState(false);

  const queryArgs = useMemo(
    () => (submitted && startDate && endDate ? { startDate, endDate } : "skip" as const),
    [submitted, startDate, endDate]
  );

  const report = useQuery(api.reports.getTechPerformance, queryArgs);

  const handleRun = () => {
    if (!startDate || !endDate) {
      toast.error("Please select both start and end dates");
      return;
    }
    if (startDate > endDate) {
      toast.error("Start date must be before end date");
      return;
    }
    setSubmitted(true);
  };

  const handleExportCsv = () => {
    if (!report) return;
    const rows = report.map((tech) => ({
      "Technician": tech.techName,
      "Role": tech.role === "mobile_mechanic" ? "Mobile Mechanic" : "Mechanic",
      "Type": tech.employmentType.toUpperCase(),
      "Jobs Completed": tech.jobsCompleted,
      "Hours Billed": tech.totalHoursBilled,
      "Avg Hours/Job": tech.avgHoursPerJob,
      "Revenue": tech.totalRevenue.toFixed(2),
      "Avg Revenue/Job": tech.avgRevenuePerJob.toFixed(2),
      "Comeback Rate": `${tech.comebackRate}%`,
      "Comebacks": tech.comebackCount,
    }));
    downloadCsv(rows, `tech-performance-${startDate}-to-${endDate}.csv`);
    toast.success("CSV exported");
  };

  // Totals for summary
  const totals = useMemo(() => {
    if (!report || report.length === 0) return null;
    const totalJobs = report.reduce((s, t) => s + t.jobsCompleted, 0);
    const totalHours = report.reduce((s, t) => s + t.totalHoursBilled, 0);
    const totalRevenue = report.reduce((s, t) => s + t.totalRevenue, 0);
    const totalComebacks = report.reduce((s, t) => s + t.comebackCount, 0);
    return {
      totalJobs,
      totalHours: Math.round(totalHours * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgComebackRate: totalJobs > 0 ? Math.round((totalComebacks / totalJobs) * 1000) / 10 : 0,
    };
  }, [report]);

  // Chart data for bar chart
  const chartData = useMemo(() => {
    if (!report) return [];
    return report.map((t) => ({
      name: t.techName.split(" ")[0],
      revenue: t.totalRevenue,
      hours: t.totalHoursBilled,
      jobs: t.jobsCompleted,
    }));
  }, [report]);

  return (
    <div className="space-y-6">
      {/* Controls row */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setSubmitted(false); }}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setSubmitted(false); }}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <Button size="sm" className="cursor-pointer" onClick={handleRun}>
            <Activity size={14} className="mr-1.5" /> Run Report
          </Button>
          {report && report.length > 0 && (
            <Button size="sm" variant="secondary" className="cursor-pointer" onClick={handleExportCsv}>
              <Download size={14} className="mr-1.5" /> Export CSV
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Empty state */}
      {!submitted && (
        <div className="text-center py-16 text-muted-foreground">
          <Activity size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Select a date range and run the report to view technician performance.</p>
        </div>
      )}

      {/* Loading */}
      {submitted && report === undefined && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {/* Report data */}
      {report && totals && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard icon={Wrench} label="Total Jobs" value={totals.totalJobs} color="text-primary" />
            <KpiCard icon={Clock} label="Total Hours" value={totals.totalHours} color="text-blue-400" />
            <KpiCard
              icon={DollarSign}
              label="Total Revenue"
              value={`$${totals.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
              color="text-green-400"
            />
            <KpiCard
              icon={AlertTriangle}
              label="Comeback Rate"
              value={`${totals.avgComebackRate}%`}
              color={totals.avgComebackRate > 10 ? "text-red-400" : "text-green-400"}
            />
          </div>

          {/* Revenue chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                  <BarChart3 size={18} className="text-primary" /> Revenue by Technician
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                      />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detail table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                <Users size={18} className="text-primary" /> Per-Technician Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4">Technician</th>
                      <th className="pb-2 pr-4">Role</th>
                      <th className="pb-2 pr-4 text-right">Jobs</th>
                      <th className="pb-2 pr-4 text-right">Hours</th>
                      <th className="pb-2 pr-4 text-right">Avg Hrs/Job</th>
                      <th className="pb-2 pr-4 text-right">Revenue</th>
                      <th className="pb-2 pr-4 text-right">Avg $/Job</th>
                      <th className="pb-2 text-right">Comeback %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.map((tech) => (
                      <tr key={tech.memberId} className="border-b border-border/50">
                        <td className="py-2.5 pr-4 font-medium text-foreground">{tech.techName}</td>
                        <td className="py-2.5 pr-4">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {tech.role === "mobile_mechanic" ? "Mobile" : "Mechanic"}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono">{tech.jobsCompleted}</td>
                        <td className="py-2.5 pr-4 text-right font-mono">{tech.totalHoursBilled}</td>
                        <td className="py-2.5 pr-4 text-right font-mono">{tech.avgHoursPerJob}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-green-400">
                          ${tech.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono">
                          ${tech.avgRevenuePerJob.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className={cn(
                          "py-2.5 text-right font-mono",
                          tech.comebackRate > 10 ? "text-red-400" : "text-green-400"
                        )}>
                          {tech.comebackRate}%
                          {tech.comebackCount > 0 && (
                            <span className="text-muted-foreground ml-1">({tech.comebackCount})</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.length === 0 && (
                <p className="text-center py-8 text-muted-foreground text-sm">
                  No technician data found for this period. Make sure you have mechanics assigned to repair orders.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Parts Profitability Tab ─────────────────────────────────────────────────

type SortField = "profit" | "margin" | "revenue" | "qty";

function PartsProfitabilityTab() {
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(getDefaultEndDate);
  const [submitted, setSubmitted] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>("profit");

  const queryArgs = useMemo(
    () => (submitted && startDate && endDate ? { startDate, endDate } : "skip" as const),
    [submitted, startDate, endDate]
  );

  const report = useQuery(api.reports.getPartsProfitability, queryArgs);

  const handleRun = () => {
    if (!startDate || !endDate) {
      toast.error("Please select both start and end dates");
      return;
    }
    if (startDate > endDate) {
      toast.error("Start date must be before end date");
      return;
    }
    setSubmitted(true);
  };

  // Sort the data
  const sortedReport = useMemo(() => {
    if (!report) return [];
    const copy = [...report];
    switch (sortBy) {
      case "profit":
        return copy.sort((a, b) => b.totalProfit - a.totalProfit);
      case "margin":
        return copy.sort((a, b) => b.marginPercent - a.marginPercent);
      case "revenue":
        return copy.sort((a, b) => b.totalRevenue - a.totalRevenue);
      case "qty":
        return copy.sort((a, b) => b.totalQtySold - a.totalQtySold);
    }
  }, [report, sortBy]);

  const handleExportCsv = () => {
    if (!sortedReport.length) return;
    const rows = sortedReport.map((p) => ({
      "Part Name": p.partName,
      "Part #": p.partNumber,
      "Category": p.category,
      "Supplier": p.supplier,
      "Qty Sold": p.totalQtySold,
      "Avg Cost": p.avgUnitCost.toFixed(2),
      "Avg Price": p.avgUnitPrice.toFixed(2),
      "Total Cost": p.totalCost.toFixed(2),
      "Total Revenue": p.totalRevenue.toFixed(2),
      "Total Profit": p.totalProfit.toFixed(2),
      "Margin %": `${p.marginPercent}%`,
    }));
    downloadCsv(rows, `parts-profitability-${startDate}-to-${endDate}.csv`);
    toast.success("CSV exported");
  };

  // Summary totals
  const totals = useMemo(() => {
    if (!report || report.length === 0) return null;
    const totalCost = report.reduce((s, p) => s + p.totalCost, 0);
    const totalRevenue = report.reduce((s, p) => s + p.totalRevenue, 0);
    const totalProfit = report.reduce((s, p) => s + p.totalProfit, 0);
    const totalQty = report.reduce((s, p) => s + p.totalQtySold, 0);
    const avgMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0;
    return { totalCost, totalRevenue, totalProfit, totalQty, avgMargin };
  }, [report]);

  // Top 10 chart data
  const chartData = useMemo(() => {
    if (!sortedReport.length) return [];
    return sortedReport.slice(0, 10).map((p) => ({
      name: p.partName.length > 18 ? p.partName.slice(0, 16) + "..." : p.partName,
      profit: p.totalProfit,
      margin: p.marginPercent,
    }));
  }, [sortedReport]);

  return (
    <div className="space-y-6">
      {/* Controls row */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setSubmitted(false); }}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setSubmitted(false); }}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <Button size="sm" className="cursor-pointer" onClick={handleRun}>
            <Package size={14} className="mr-1.5" /> Run Report
          </Button>
          {sortedReport.length > 0 && (
            <Button size="sm" variant="secondary" className="cursor-pointer" onClick={handleExportCsv}>
              <Download size={14} className="mr-1.5" /> Export CSV
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Empty state */}
      {!submitted && (
        <div className="text-center py-16 text-muted-foreground">
          <Package size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Select a date range and run the report to view parts profitability.</p>
        </div>
      )}

      {/* Loading */}
      {submitted && report === undefined && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {/* Report data */}
      {report && totals && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KpiCard icon={Package} label="Parts Sold" value={totals.totalQty} color="text-primary" />
            <KpiCard
              icon={DollarSign}
              label="Total Cost"
              value={`$${totals.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
              color="text-blue-400"
            />
            <KpiCard
              icon={DollarSign}
              label="Total Revenue"
              value={`$${totals.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
              color="text-cyan-400"
            />
            <KpiCard
              icon={TrendingUp}
              label="Total Profit"
              value={`$${totals.totalProfit.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
              color="text-green-400"
            />
            <KpiCard
              icon={Percent}
              label="Avg Margin"
              value={`${totals.avgMargin}%`}
              color={totals.avgMargin >= 30 ? "text-green-400" : totals.avgMargin >= 15 ? "text-yellow-400" : "text-red-400"}
            />
          </div>

          {/* Top 10 profit chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                  <TrendingUp size={18} className="text-primary" /> Top 10 Parts by Profit
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                      <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        width={80}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(value: number, name: string) =>
                          name === "profit"
                            ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                            : `${value}%`
                        }
                      />
                      <Bar dataKey="profit" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sort + detail table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                  <ClipboardList size={18} className="text-primary" /> Parts Detail ({sortedReport.length} parts)
                </CardTitle>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
                  <SelectTrigger className="w-36 h-8 text-xs cursor-pointer">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="profit" className="cursor-pointer">Sort by Profit</SelectItem>
                    <SelectItem value="margin" className="cursor-pointer">Sort by Margin</SelectItem>
                    <SelectItem value="revenue" className="cursor-pointer">Sort by Revenue</SelectItem>
                    <SelectItem value="qty" className="cursor-pointer">Sort by Qty Sold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-3">Part</th>
                      <th className="pb-2 pr-3">Category</th>
                      <th className="pb-2 pr-3 text-right">Qty</th>
                      <th className="pb-2 pr-3 text-right">Avg Cost</th>
                      <th className="pb-2 pr-3 text-right">Avg Price</th>
                      <th className="pb-2 pr-3 text-right">Revenue</th>
                      <th className="pb-2 pr-3 text-right">Profit</th>
                      <th className="pb-2 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedReport.map((part) => (
                      <tr key={part.partKey} className="border-b border-border/50">
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-foreground truncate max-w-[180px]" title={part.partName}>
                            {part.partName}
                          </div>
                          {part.partNumber && (
                            <div className="text-xs text-muted-foreground">{part.partNumber}</div>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge variant="secondary" className="text-xs">{part.category}</Badge>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono">{part.totalQtySold}</td>
                        <td className="py-2.5 pr-3 text-right font-mono text-muted-foreground">
                          ${part.avgUnitCost.toFixed(2)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono">
                          ${part.avgUnitPrice.toFixed(2)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono">
                          ${part.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className={cn(
                          "py-2.5 pr-3 text-right font-mono font-medium",
                          part.totalProfit >= 0 ? "text-green-400" : "text-red-400"
                        )}>
                          ${part.totalProfit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className={cn(
                          "py-2.5 text-right font-mono",
                          part.marginPercent >= 30 ? "text-green-400" : part.marginPercent >= 15 ? "text-yellow-400" : "text-red-400"
                        )}>
                          {part.marginPercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.length === 0 && (
                <p className="text-center py-8 text-muted-foreground text-sm">
                  No parts data found for this period. Parts profitability is calculated from completed repair orders.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Stripe Tab ──────────────────────────────────────────────────────────────

const STRIPE_LINKS = [
  {
    title: "Payments",
    description: "View all transactions, refunds, and disputes",
    url: "https://dashboard.stripe.com/payments",
    icon: DollarSign,
  },
  {
    title: "Customers",
    description: "Manage saved customer payment methods",
    url: "https://dashboard.stripe.com/customers",
    icon: Users,
  },
  {
    title: "Payouts",
    description: "Track money transfers to your bank account",
    url: "https://dashboard.stripe.com/balance/overview",
    icon: TrendingUp,
  },
  {
    title: "Invoices",
    description: "Stripe-generated invoices and receipts",
    url: "https://dashboard.stripe.com/invoices",
    icon: FileText,
  },
  {
    title: "Disputes",
    description: "Handle chargebacks and payment disputes",
    url: "https://dashboard.stripe.com/disputes",
    icon: AlertTriangle,
  },
  {
    title: "Settings",
    description: "Branding, payment methods, and account settings",
    url: "https://dashboard.stripe.com/settings",
    icon: Settings,
  },
] as const;

function StripeTab() {
  const stripeStatus = useQuery(api.admin.getStripeStatus, {});

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                stripeStatus?.connected ? "bg-green-500/15" : "bg-yellow-500/15"
              )}>
                <CreditCard size={20} className={stripeStatus?.connected ? "text-green-400" : "text-yellow-400"} />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Stripe Connection</h3>
                <p className="text-sm text-muted-foreground">
                  {stripeStatus === undefined
                    ? "Checking..."
                    : stripeStatus.connected
                      ? "Connected and ready to process payments"
                      : "Not configured — add STRIPE_SECRET_KEY in Secrets"}
                </p>
              </div>
            </div>
            <Badge className={stripeStatus?.connected ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"}>
              {stripeStatus?.connected ? "Active" : "Not Connected"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Stripe Dashboard</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {STRIPE_LINKS.map((link) => (
            <a
              key={link.title}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <link.icon size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                      {link.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{link.description}</p>
                  </div>
                </div>
                <ExternalLink size={12} className="text-muted-foreground group-hover:text-primary transition-colors mt-1 shrink-0" />
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Open Dashboard CTA */}
      <Card>
        <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground">Full Stripe Dashboard</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Access your complete payment analytics, reports, and account management
            </p>
          </div>
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button className="cursor-pointer shrink-0">
              <ExternalLink size={14} className="mr-1.5" /> Open Stripe Dashboard
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Admin Page ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const myRole = useQuery(api.admin.getMyRole, {});
  const navigate = useNavigate();

  // Role guard
  if (myRole === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (myRole === null || (myRole.role !== "owner" && myRole.role !== "admin")) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <Shield size={24} className="text-destructive" />
          </div>
          <h2 className="text-xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>Access Denied</h2>
          <p className="text-muted-foreground text-sm">You need admin or owner access to view this page.</p>
          <Button size="sm" className="cursor-pointer" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
          <Shield size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Admin Portal
          </h1>
          <p className="text-sm text-muted-foreground">Back-office management · {ROLE_LABELS[myRole.role]}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview" className="cursor-pointer">
            <BarChart3 size={14} className="mr-1.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="members" className="cursor-pointer">
            <UserCog size={14} className="mr-1.5" /> Members
          </TabsTrigger>
          <TabsTrigger value="ros" className="cursor-pointer">
            <Wrench size={14} className="mr-1.5" /> All ROs
          </TabsTrigger>
          <TabsTrigger value="invoices" className="cursor-pointer">
            <FileText size={14} className="mr-1.5" /> Invoices
          </TabsTrigger>
          <TabsTrigger value="reports" className="cursor-pointer">
            <Receipt size={14} className="mr-1.5" /> Reports
          </TabsTrigger>
          <TabsTrigger value="tech-performance" className="cursor-pointer">
            <Activity size={14} className="mr-1.5" /> Tech Performance
          </TabsTrigger>
          <TabsTrigger value="parts-profit" className="cursor-pointer">
            <Package size={14} className="mr-1.5" /> Parts Profit
          </TabsTrigger>
          <TabsTrigger value="retention" className="cursor-pointer">
            <UserX size={14} className="mr-1.5" /> Retention
          </TabsTrigger>
          {myRole.role === "owner" && (
            <TabsTrigger value="stripe" className="cursor-pointer">
              <CreditCard size={14} className="mr-1.5" /> Stripe
            </TabsTrigger>
          )}
          {myRole.role === "owner" && (
            <TabsTrigger value="free-access" className="cursor-pointer">
              <Gift size={14} className="mr-1.5" /> Free Access
            </TabsTrigger>
          )}
          <TabsTrigger value="settings" className="cursor-pointer" onClick={() => navigate("/settings")}>
            <Settings size={14} className="mr-1.5" /> Settings <ChevronDown size={11} className="ml-0.5 rotate-[-90deg]" />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="members"><MembersTab /></TabsContent>
        <TabsContent value="ros"><AllROsTab /></TabsContent>
        <TabsContent value="invoices"><InvoicesTab /></TabsContent>
        <TabsContent value="reports"><ReportsTab /></TabsContent>
        <TabsContent value="tech-performance"><TechPerformanceTab /></TabsContent>
        <TabsContent value="parts-profit"><PartsProfitabilityTab /></TabsContent>
        <TabsContent value="retention"><CustomerRetentionTab /></TabsContent>
        {myRole.role === "owner" && (
          <TabsContent value="stripe"><StripeTab /></TabsContent>
        )}
        {myRole.role === "owner" && (
          <TabsContent value="free-access"><FreeAccessTab /></TabsContent>
        )}
      </Tabs>
    </div>
  );
}
