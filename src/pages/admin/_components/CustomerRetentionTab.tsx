import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  UserX, Phone, Mail, Car, Calendar, DollarSign, Download, Search,
  AlertTriangle, Clock, Users,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { format, formatDistanceToNow } from "date-fns";
import { downloadCsv } from "@/lib/export-csv.ts";
import {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription,
} from "@/components/ui/empty.tsx";

const THRESHOLD_OPTIONS = [
  { value: "90", label: "90+ days" },
  { value: "180", label: "180+ days" },
  { value: "365", label: "1 year+" },
];

function getDaysColor(days: number): string {
  if (days >= 365) return "text-red-400";
  if (days >= 180) return "text-orange-400";
  return "text-yellow-400";
}

function getDaysBadgeColor(days: number): string {
  if (days >= 365) return "bg-red-500/15 text-red-400 border-red-500/30";
  if (days >= 180) return "bg-orange-500/15 text-orange-400 border-orange-500/30";
  return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
}

export default function CustomerRetentionTab() {
  const [threshold, setThreshold] = useState("90");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"days" | "spend" | "visits">("days");

  const data = useQuery(api.reports.getCustomerRetention, {
    daysThreshold: parseInt(threshold),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    let results = data;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      results = results.filter(
        (c) =>
          c.customerName.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.vehicleSummary.toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortBy === "spend") {
      results = [...results].sort((a, b) => b.totalSpend - a.totalSpend);
    } else if (sortBy === "visits") {
      results = [...results].sort((a, b) => b.visitCount - a.visitCount);
    }
    // Default "days" is already sorted by the backend

    return results;
  }, [data, searchQuery, sortBy]);

  // KPI stats
  const totalAtRisk = data?.length ?? 0;
  const totalRevenueLost = data?.reduce((s, c) => s + c.totalSpend, 0) ?? 0;
  const avgDaysSince = totalAtRisk > 0
    ? Math.round((data?.reduce((s, c) => s + c.daysSinceVisit, 0) ?? 0) / totalAtRisk)
    : 0;

  const handleExportCsv = () => {
    if (!filtered.length) return;
    const rows = filtered.map((c) => ({
      "Customer Name": c.customerName,
      "Phone": c.phone,
      "Email": c.email,
      "Last Visit": format(new Date(c.lastVisitDate), "MM/dd/yyyy"),
      "Days Since Visit": c.daysSinceVisit,
      "Vehicle": c.vehicleSummary,
      "Total Spend": `$${c.totalSpend.toFixed(2)}`,
      "Visit Count": c.visitCount,
    }));
    downloadCsv(rows, `customer-retention-${threshold}days-${format(new Date(), "yyyy-MM-dd")}`);
  };

  if (data === undefined) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Customer Retention
          </h2>
          <p className="text-sm text-muted-foreground">
            Customers who haven't visited in a while — reach out to bring them back
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="cursor-pointer gap-1.5"
          onClick={handleExportCsv}
          disabled={filtered.length === 0}
        >
          <Download size={14} /> Export CSV
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <UserX size={18} className="text-red-400 mx-auto mb-1" />
          <div className="text-2xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            {totalAtRisk}
          </div>
          <div className="text-xs text-muted-foreground">At-Risk Customers</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <DollarSign size={18} className="text-primary mx-auto mb-1" />
          <div className="text-2xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            ${totalRevenueLost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div className="text-xs text-muted-foreground">Lifetime Spend (at-risk)</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <Clock size={18} className="text-orange-400 mx-auto mb-1" />
          <div className="text-2xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            {avgDaysSince}
          </div>
          <div className="text-xs text-muted-foreground">Avg Days Since Last Visit</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={threshold} onValueChange={setThreshold}>
          <SelectTrigger className="w-36 cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THRESHOLD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="cursor-pointer">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as "days" | "spend" | "visits")}>
          <SelectTrigger className="w-40 cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="days" className="cursor-pointer">Sort: Days Away</SelectItem>
            <SelectItem value="spend" className="cursor-pointer">Sort: Total Spend</SelectItem>
            <SelectItem value="visits" className="cursor-pointer">Sort: Visit Count</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, email, or vehicle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Users /></EmptyMedia>
            <EmptyTitle>
              {data.length === 0 ? "No at-risk customers" : "No results match your search"}
            </EmptyTitle>
            <EmptyDescription>
              {data.length === 0
                ? `All customers have visited within the last ${threshold} days. Great retention!`
                : "Try adjusting your search or threshold."
              }
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
          </p>
          <div className="border border-border rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="hidden md:grid md:grid-cols-[1fr_140px_140px_100px_90px_90px] gap-3 px-4 py-2.5 bg-muted/30 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <div>Customer</div>
              <div>Vehicle</div>
              <div>Last Visit</div>
              <div className="text-right">Total Spend</div>
              <div className="text-center">Visits</div>
              <div className="text-center">Status</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
              {filtered.map((customer) => (
                <CustomerRow key={customer.customerId} customer={customer} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type CustomerData = {
  customerId: string;
  customerName: string;
  phone: string;
  email: string;
  lastVisitDate: string;
  daysSinceVisit: number;
  vehicleSummary: string;
  totalSpend: number;
  visitCount: number;
};

function CustomerRow({ customer }: { customer: CustomerData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_140px_100px_90px_90px] gap-2 md:gap-3 px-4 py-3 hover:bg-muted/20 transition-colors items-center">
      {/* Customer info */}
      <div className="min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">{customer.customerName}</p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary cursor-pointer"
            >
              <Phone size={10} /> {customer.phone}
            </a>
          )}
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary cursor-pointer"
            >
              <Mail size={10} /> {customer.email}
            </a>
          )}
        </div>
      </div>

      {/* Vehicle */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Car size={11} className="shrink-0" />
        <span className="truncate">{customer.vehicleSummary}</span>
      </div>

      {/* Last visit */}
      <div className="text-xs text-muted-foreground">
        <div>{format(new Date(customer.lastVisitDate), "MMM d, yyyy")}</div>
        <div className={cn("font-medium", getDaysColor(customer.daysSinceVisit))}>
          {formatDistanceToNow(new Date(customer.lastVisitDate), { addSuffix: true })}
        </div>
      </div>

      {/* Total spend */}
      <div className="text-sm font-semibold text-foreground text-right">
        ${customer.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </div>

      {/* Visit count */}
      <div className="text-center text-sm text-muted-foreground">
        {customer.visitCount}
      </div>

      {/* Status badge */}
      <div className="flex justify-center">
        <Badge
          variant="outline"
          className={cn("text-[10px]", getDaysBadgeColor(customer.daysSinceVisit))}
        >
          {customer.daysSinceVisit >= 365 ? (
            <><AlertTriangle size={9} className="mr-0.5" /> Lost</>
          ) : customer.daysSinceVisit >= 180 ? (
            <><AlertTriangle size={9} className="mr-0.5" /> At Risk</>
          ) : (
            <><Calendar size={9} className="mr-0.5" /> Lapsed</>
          )}
        </Badge>
      </div>
    </div>
  );
}
