import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useLocationFilter } from "@/hooks/use-location-filter.tsx";
import { Calendar, ChevronLeft, ChevronRight, Clock, Wrench, Inbox, CheckCircle2, XCircle, Phone, Mail, Car } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { toast } from "sonner";
import RODetailSheet from "@/pages/jobs/_components/RODetailSheet.tsx";
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
  isSameDay,
  isToday,
  addDays,
  subDays,
} from "date-fns";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ScheduledRO = {
  _id: Id<"repairOrders">;
  _creationTime: number;
  roNumber: string;
  customerName: string;
  vehicleSummary: string;
  complaint: string;
  status: string;
  priority: string;
  scheduledAt?: string;
  promisedAt?: string;
  isMobile: boolean;
  mobileAddress?: string;
  bayName?: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getRODateForDay(ro: ScheduledRO): Date {
  if (ro.scheduledAt) return new Date(ro.scheduledAt);
  return new Date(ro._creationTime);
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    estimate: "Estimate",
    approved: "Approved",
    in_progress: "In Progress",
    waiting_parts: "Waiting Parts",
    completed: "Completed",
    invoiced: "Invoiced",
    cancelled: "Cancelled",
  };
  return map[status] ?? status;
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    estimate: "bg-muted text-muted-foreground",
    approved: "bg-blue-500/15 text-blue-400",
    in_progress: "bg-primary/15 text-primary",
    waiting_parts: "bg-yellow-500/15 text-yellow-400",
    completed: "bg-green-500/15 text-green-400",
    invoiced: "bg-purple-500/15 text-purple-400",
    cancelled: "bg-red-500/15 text-red-400",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

function priorityBorder(priority: string): string {
  if (priority === "high") return "border-l-4 border-l-red-500";
  if (priority === "normal") return "border-l-4 border-l-yellow-500";
  return "";
}

// ─── ROCard ────────────────────────────────────────────────────────────────────

function ROCard({ ro, onClick }: { ro: ScheduledRO; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2.5 rounded-lg bg-card border border-border hover:border-primary/40 transition-colors cursor-pointer ${priorityBorder(ro.priority)}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-bold text-primary font-mono">{ro.roNumber}</span>
        <Badge className={`text-[10px] px-1.5 py-0 ${statusColor(ro.status)}`}>
          {statusLabel(ro.status)}
        </Badge>
      </div>
      <p className="text-xs font-medium text-foreground truncate">{ro.customerName}</p>
      <p className="text-[11px] text-muted-foreground truncate">{ro.vehicleSummary}</p>
    </button>
  );
}

// ─── Mobile Day ROs ─────────────────────────────────────────────────────────────

function MobileDayROs({ dayROs, onSelect }: { dayROs: ScheduledRO[]; onSelect: (ro: ScheduledRO) => void }) {
  if (dayROs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 border border-dashed border-border/60 rounded-lg">
        <span className="text-sm text-muted-foreground">No jobs scheduled</span>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {dayROs.map((ro) => (
        <ROCard key={ro._id} ro={ro} onClick={() => onSelect(ro)} />
      ))}
    </div>
  );
}

// ─── Booking Requests Panel ────────────────────────────────────────────────────

function BookingRequests() {
  const bookings = useQuery(api.bookings.listBookingRequests, {});
  const updateStatus = useMutation(api.bookings.updateBookingStatus);

  const pending = bookings?.filter((b) => b.status === "pending") ?? [];
  const others = bookings?.filter((b) => b.status !== "pending") ?? [];

  const handleStatus = async (
    bookingId: Id<"bookingRequests">,
    status: "confirmed" | "declined"
  ) => {
    try {
      await updateStatus({ bookingId, status });
      toast.success(status === "confirmed" ? "Booking confirmed" : "Booking declined");
    } catch {
      toast.error("Failed to update booking");
    }
  };

  if (bookings === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border/60 rounded-lg">
        <Inbox size={28} className="text-muted-foreground mb-2 opacity-50" />
        <p className="text-sm text-muted-foreground">No booking requests yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Share your booking link with customers to receive online requests
        </p>
      </div>
    );
  }

  const BookingCard = ({ b }: { b: (typeof bookings)[number] }) => {
    const statusColors: Record<string, string> = {
      pending: "bg-yellow-500/15 text-yellow-400",
      confirmed: "bg-green-500/15 text-green-400",
      declined: "bg-red-500/15 text-red-400",
      converted: "bg-blue-500/15 text-blue-400",
    };
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm truncate">{b.customerName}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[b.status]}`}>
                  {b.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Phone size={10} />{b.customerPhone}</span>
                {b.customerEmail && <span className="flex items-center gap-1"><Mail size={10} />{b.customerEmail}</span>}
              </div>
            </div>
            <div className="text-right shrink-0 text-xs text-muted-foreground">
              <p className="font-medium">
                {new Date(b.preferredDate + "T12:00:00").toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric"
                })}
              </p>
              {b.preferredTime && (
                <p className="flex items-center gap-1 justify-end mt-0.5">
                  <Clock size={10} />
                  {(() => {
                    const [h, m] = b.preferredTime.split(":").map(Number);
                    const ampm = h >= 12 ? "PM" : "AM";
                    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
                    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
                  })()}
                </p>
              )}
            </div>
          </div>

          {(b.vehicleYear ?? b.vehicleMake ?? b.vehicleModel) && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Car size={10} />
              {[b.vehicleYear, b.vehicleMake, b.vehicleModel].filter(Boolean).join(" ")}
              {b.vehicleVin && <span className="font-mono ml-1">· {b.vehicleVin}</span>}
            </p>
          )}

          <p className="text-sm border-l-2 border-primary/40 pl-2">{b.serviceDescription}</p>
          {b.notes && <p className="text-xs text-muted-foreground italic">"{b.notes}"</p>}

          <p className="text-[10px] text-muted-foreground">
            Submitted {new Date(b.submittedAt).toLocaleString()}
          </p>

          {b.status === "pending" && (
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="flex-1 cursor-pointer"
                onClick={() => void handleStatus(b._id, "confirmed")}
              >
                <CheckCircle2 size={13} className="mr-1" /> Confirm
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1 cursor-pointer"
                onClick={() => void handleStatus(b._id, "declined")}
              >
                <XCircle size={13} className="mr-1" /> Decline
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide flex items-center gap-1.5">
            <Inbox size={12} /> {pending.length} Pending
          </p>
          {pending.map((b) => <BookingCard key={b._id} b={b} />)}
        </div>
      )}
      {others.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Past Requests</p>
          {others.slice(0, 10).map((b) => <BookingCard key={b._id} b={b} />)}
        </div>
      )}
    </div>
  );
}

// ─── Schedule Inner (Authenticated) ────────────────────────────────────────────

function ScheduleInner() {
  const { selectedLocationId } = useLocationFilter();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [mobileDay, setMobileDay] = useState(new Date());
  const [selectedRO, setSelectedRO] = useState<ScheduledRO | null>(null);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  const startDate = format(weekStart, "yyyy-MM-dd");
  const endDate = format(weekEnd, "yyyy-MM-dd");

  const ros = useQuery(api.repairOrders.getScheduledROs, {
    startDate,
    endDate,
    ...(selectedLocationId ? { locationId: selectedLocationId } : {}),
  });
  const pendingBookings = useQuery(api.bookings.listBookingRequests, { status: "pending" });
  const pendingCount = pendingBookings?.length;

  // Build days array (Mon-Sun)
  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 7; i++) {
      arr.push(addDays(weekStart, i));
    }
    return arr;
  }, [weekStart]);

  // Group ROs by day
  const rosByDay = useMemo(() => {
    const map = new Map<string, ScheduledRO[]>();
    days.forEach((d) => map.set(format(d, "yyyy-MM-dd"), []));
    if (ros) {
      ros.forEach((ro) => {
        const dateKey = format(getRODateForDay(ro as ScheduledRO), "yyyy-MM-dd");
        const bucket = map.get(dateKey);
        if (bucket) bucket.push(ro as ScheduledRO);
      });
    }
    return map;
  }, [ros, days]);

  // Stats
  const totalJobs = ros?.length ?? 0;
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ros?.forEach((ro) => {
      counts[ro.status] = (counts[ro.status] ?? 0) + 1;
    });
    return counts;
  }, [ros]);

  const goToday = () => {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    setMobileDay(new Date());
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Calendar className="text-primary" size={28} />
        <h1 className="text-2xl md:text-3xl font-bold font-[Rajdhani,sans-serif]">
          Schedule
        </h1>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar" className="cursor-pointer">
            <Calendar size={14} className="mr-1.5" /> Calendar
          </TabsTrigger>
          <TabsTrigger value="bookings" className="cursor-pointer">
            <Inbox size={14} className="mr-1.5" /> Booking Requests
            {(pendingCount ?? 0) > 0 && (
              <span className="ml-1.5 bg-yellow-500 text-black text-[10px] font-bold rounded-full px-1.5 py-0.5">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4 space-y-4">
          {/* Stats Bar */}
          <div className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg bg-card border border-border">
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-muted-foreground" />
              <span className="text-sm font-medium">{totalJobs} jobs this week</span>
            </div>
            {Object.entries(statusCounts).map(([status, count]) => (
              <Badge key={status} className={`text-xs ${statusColor(status)}`}>
                {statusLabel(status)}: {count}
              </Badge>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="cursor-pointer"
                onClick={() => {
                  setWeekStart(subWeeks(weekStart, 1));
                  setMobileDay(subDays(mobileDay, 7));
                }}
              >
                <ChevronLeft size={18} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="cursor-pointer"
                onClick={() => {
                  setWeekStart(addWeeks(weekStart, 1));
                  setMobileDay(addDays(mobileDay, 7));
                }}
              >
                <ChevronRight size={18} />
              </Button>
              <Button variant="secondary" size="sm" className="cursor-pointer" onClick={goToday}>
                Today
              </Button>
            </div>
            <h2 className="text-sm md:text-base font-semibold text-foreground">
              Week of {format(weekStart, "MMMM d, yyyy")}
            </h2>
          </div>

          {/* Loading */}
          {ros === undefined && (
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-lg" />
              ))}
            </div>
          )}

          {/* Desktop Week View (md+) */}
          {ros !== undefined && (
            <div className="hidden md:grid grid-cols-7 gap-2 min-h-[420px]">
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayROs = rosByDay.get(key) ?? [];
                const today = isToday(day);
                return (
                  <div
                    key={key}
                    className={`flex flex-col rounded-lg border ${today ? "border-primary/50 bg-primary/5" : "border-border bg-card/50"}`}
                  >
                    <div className={`px-2 py-2 text-center border-b ${today ? "border-primary/30" : "border-border"}`}>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {format(day, "EEE")}
                      </p>
                      <p className={`text-lg font-bold ${today ? "text-primary" : "text-foreground"}`}>
                        {format(day, "d")}
                      </p>
                    </div>
                    <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto max-h-[360px]">
                      {dayROs.length === 0 && (
                        <div className="flex items-center justify-center h-full min-h-[60px] border border-dashed border-border/60 rounded-md">
                          <span className="text-[11px] text-muted-foreground">No jobs</span>
                        </div>
                      )}
                      {dayROs.map((ro) => (
                        <ROCard key={ro._id} ro={ro} onClick={() => setSelectedRO(ro)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Mobile Day View (below md) */}
          {ros !== undefined && (
            <div className="md:hidden space-y-3">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon"
                  className="cursor-pointer"
                  onClick={() => setMobileDay(subDays(mobileDay, 1))}
                >
                  <ChevronLeft size={18} />
                </Button>
                <div className="text-center">
                  <p className="text-xs uppercase text-muted-foreground">{format(mobileDay, "EEEE")}</p>
                  <p className={`text-lg font-bold ${isToday(mobileDay) ? "text-primary" : "text-foreground"}`}>
                    {format(mobileDay, "MMMM d")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="cursor-pointer"
                  onClick={() => setMobileDay(addDays(mobileDay, 1))}
                >
                  <ChevronRight size={18} />
                </Button>
              </div>
              <MobileDayROs dayROs={rosByDay.get(format(mobileDay, "yyyy-MM-dd")) ?? []} onSelect={setSelectedRO} />
            </div>
          )}

          <p className="text-xs text-muted-foreground pt-2">
            Repair orders are placed on the day they're created. Open one to reschedule it.
          </p>
        </TabsContent>

        <TabsContent value="bookings" className="mt-4">
          <BookingRequests />
        </TabsContent>
      </Tabs>

      {/* Detail Sheet */}
      {selectedRO !== null && (
        <RODetailSheet roId={selectedRO._id} onClose={() => setSelectedRO(null)} />
      )}
    </div>
  );
}

// ─── Main Export ────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  return (
    <>
      <Authenticated>
        <ScheduleInner />
      </Authenticated>
      <Unauthenticated>
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Calendar size={48} className="text-muted-foreground" />
          <p className="text-muted-foreground">Sign in to view the schedule</p>
          <SignInButton />
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </AuthLoading>
    </>
  );
}
