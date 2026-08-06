import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { Authenticated, Unauthenticated } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingUp, DollarSign, FileText, Download } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";

// ─── Date range presets ───────────────────────────────────────────────────────

type RangeKey = "today" | "week" | "month" | "last30" | "custom";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "last30", label: "Last 30 Days" },
  { key: "custom", label: "Custom" },
];

function getRangeDates(key: RangeKey, customStart: string, customEnd: string): { start: string; end: string } {
  const now = new Date();
  switch (key) {
    case "today": {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const e = new Date(s.getTime() + 86400000 - 1);
      return { start: s.toISOString(), end: e.toISOString() };
    }
    case "week": {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      const e = endOfWeek(now, { weekStartsOn: 1 });
      return { start: s.toISOString(), end: e.toISOString() };
    }
    case "month": {
      return { start: startOfMonth(now).toISOString(), end: endOfMonth(now).toISOString() };
    }
    case "last30": {
      return { start: subDays(now, 30).toISOString(), end: now.toISOString() };
    }
    case "custom": {
      const s = customStart ? new Date(customStart).toISOString() : subDays(now, 30).toISOString();
      const e = customEnd ? new Date(customEnd + "T23:59:59").toISOString() : now.toISOString();
      return { start: s, end: e };
    }
  }
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(rows: Array<{ service: string; count: number; revenue: number }>) {
  const header = "Service,Jobs,Revenue\n";
  const lines = rows.map((r) => `"${r.service}",${r.count},$${r.revenue.toFixed(2)}`).join("\n");
  const blob = new Blob([header + lines], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "revenue-report.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Inner ────────────────────────────────────────────────────────────────────

function RevenueInner() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const { start, end } = useMemo(
    () => getRangeDates(rangeKey, customStart, customEnd),
    [rangeKey, customStart, customEnd]
  );

  const report = useQuery(api.invoices.getRevenueReport, { startDate: start, endDate: end });

  const chartData = useMemo(
    () =>
      (report?.dailyRevenue ?? []).map((d) => ({
        day: format(new Date(d.date), "MMM d"),
        revenue: d.amount,
      })),
    [report]
  );

  const isLoading = report === undefined;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Revenue Report
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track income over time and top-earning services</p>
        </div>
        {report && report.topServicesList.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => exportCSV(report.topServicesList)}>
            <Download size={14} className="mr-1.5" /> Export CSV
          </Button>
        )}
      </div>

      {/* Range selector */}
      <div className="flex flex-wrap gap-2 items-center">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setRangeKey(opt.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer",
              rangeKey === opt.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground bg-secondary"
            )}
          >
            {opt.label}
          </button>
        ))}
        {rangeKey === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-8 px-2 text-xs rounded-md border border-border bg-background text-foreground"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-8 px-2 text-xs rounded-md border border-border bg-background text-foreground"
            />
          </div>
        )}
      </div>

      {/* KPI cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Revenue Collected</p>
                <DollarSign size={16} className="text-green-400" />
              </div>
              <p className="text-2xl font-bold text-green-400" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                ${(report?.totalRevenue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Paid Invoices</p>
                <FileText size={16} className="text-primary" />
              </div>
              <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                {report?.invoiceCount ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Revenue over time chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            <TrendingUp size={18} className="text-primary" /> Revenue Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : chartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
              No revenue data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
                />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]}
                />
                <Bar dataKey="revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top services */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            <TrendingUp size={18} className="text-primary" /> Top Services by Revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (report?.topServicesList ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No service data for this period</p>
          ) : (
            <div className="divide-y divide-border">
              {(report?.topServicesList ?? []).map((row, i) => {
                const maxRev = report!.topServicesList[0].revenue;
                const pct = maxRev > 0 ? (row.revenue / maxRev) * 100 : 0;
                return (
                  <div key={i} className="py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-foreground truncate max-w-[60%]">{row.service}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">{row.count} job{row.count !== 1 ? "s" : ""}</span>
                        <span className="text-sm font-bold text-foreground">${row.revenue.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function RevenuePage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex h-full items-center justify-center"><SignInButton /></div>
      </Unauthenticated>
      <Authenticated>
        <RevenueInner />
      </Authenticated>
    </>
  );
}
