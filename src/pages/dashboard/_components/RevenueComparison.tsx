import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { TrendingUp, TrendingDown, Minus, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

export default function RevenueComparison({ locationId }: { locationId?: Id<"locations"> }) {
  const data = useQuery(
    api.dashboard.getRevenueComparison,
    locationId ? { locationId } : {}
  );

  if (data === undefined) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data === null) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle
          className="text-lg flex items-center gap-2"
          style={{ fontFamily: "Rajdhani, sans-serif" }}
        >
          <DollarSign size={20} className="text-primary" />
          Revenue Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Period comparison cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Current month */}
          <div className="rounded-lg border border-border bg-card p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">This Month</p>
            <p className="text-xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
              ${data.currentMonth.revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">{data.currentMonth.label}</p>
          </div>

          {/* vs Last Month */}
          <div className="rounded-lg border border-border bg-card p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">vs Last Month</p>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                ${data.lastMonth.revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <ChangeIndicator percent={data.lastMonth.changePercent} />
            </div>
            <p className="text-xs text-muted-foreground">{data.lastMonth.label}</p>
          </div>

          {/* vs Same Month Last Year */}
          <div className="rounded-lg border border-border bg-card p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">vs Same Month Last Year</p>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                ${data.sameMonthLastYear.revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <ChangeIndicator percent={data.sameMonthLastYear.changePercent} />
            </div>
            <p className="text-xs text-muted-foreground">{data.sameMonthLastYear.label}</p>
          </div>
        </div>

        {/* 12-month trend chart */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">12-Month Revenue Trend</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend}>
                <defs>
                  <linearGradient id="revCompGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "Revenue"]}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--color-foreground)" }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-primary)"
                  fill="url(#revCompGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChangeIndicator({ percent }: { percent: number }) {
  if (percent === 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
        <Minus size={12} />
        0%
      </span>
    );
  }

  const isPositive = percent > 0;

  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-xs font-semibold rounded-full px-1.5 py-0.5",
        isPositive
          ? "text-green-600 bg-green-500/10"
          : "text-red-500 bg-red-500/10"
      )}
    >
      {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {isPositive ? "+" : ""}{percent}%
    </span>
  );
}
