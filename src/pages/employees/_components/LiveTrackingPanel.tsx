import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Clock, MapPin, Users, CheckCircle2, XCircle, Navigation,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { format, formatDistanceToNow } from "date-fns";

export default function LiveTrackingPanel() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const entries = useQuery(api.timeclock.getOrgTimeEntries, { date });

  if (entries === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const clockedIn = entries.filter((e) => e.isClockedIn);
  const clockedOut = entries.filter((e) => !e.isClockedIn && e.totalHoursToday > 0);
  const notClocked = entries.filter((e) => !e.isClockedIn && e.totalHoursToday === 0);
  const totalHoursAll = entries.reduce((s, e) => s + e.totalHoursToday, 0);

  return (
    <div className="space-y-4">
      {/* Header + Date picker */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-primary" />
          <h3 className="font-semibold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            Time Clock & GPS
          </h3>
        </div>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40 h-8 text-xs"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={CheckCircle2}
          label="Clocked In"
          value={clockedIn.length}
          color="text-green-400"
        />
        <StatCard
          icon={XCircle}
          label="Clocked Out"
          value={clockedOut.length}
          color="text-muted-foreground"
        />
        <StatCard
          icon={Users}
          label="Not Started"
          value={notClocked.length}
          color="text-yellow-400"
        />
        <StatCard
          icon={Clock}
          label="Total Hours"
          value={`${totalHoursAll.toFixed(1)}h`}
          color="text-primary"
        />
      </div>

      {/* Employee list */}
      <div className="space-y-2">
        {/* Currently clocked in */}
        {clockedIn.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-green-400 uppercase tracking-wide flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Currently Working ({clockedIn.length})
            </p>
            {clockedIn.map((emp) => (
              <EmployeeTimeRow key={emp.memberId} employee={emp} />
            ))}
          </div>
        )}

        {/* Clocked out today */}
        {clockedOut.length > 0 && (
          <div className="space-y-2 mt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Finished Today ({clockedOut.length})
            </p>
            {clockedOut.map((emp) => (
              <EmployeeTimeRow key={emp.memberId} employee={emp} />
            ))}
          </div>
        )}

        {/* Not clocked in */}
        {notClocked.length > 0 && (
          <div className="space-y-2 mt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Not Clocked In ({notClocked.length})
            </p>
            {notClocked.map((emp) => (
              <EmployeeTimeRow key={emp.memberId} employee={emp} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper components ───────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
  icon: typeof Clock;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-center">
      <Icon size={16} className={cn("mx-auto mb-1", color)} />
      <div className="text-lg font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

type EmployeeEntry = {
  memberId: string;
  name: string;
  role: string;
  avatarUrl?: string;
  isClockedIn: boolean;
  totalHoursToday: number;
  entries: Array<{
    _id: string;
    clockInAt: string;
    clockOutAt?: string;
    totalHours?: number;
  }>;
  lastPing: {
    lat: number;
    lng: number;
    accuracy?: number;
    timestamp: string;
  } | null;
};

function EmployeeTimeRow({ employee }: { employee: EmployeeEntry }) {
  const initials = employee.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const latestEntry = employee.entries[0];
  const clockInTime = latestEntry ? format(new Date(latestEntry.clockInAt), "h:mm a") : null;
  const clockOutTime = latestEntry?.clockOutAt
    ? format(new Date(latestEntry.clockOutAt), "h:mm a")
    : null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
      {/* Avatar */}
      <Avatar className="w-9 h-9 shrink-0">
        {employee.avatarUrl && <AvatarImage src={employee.avatarUrl} />}
        <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
          {initials}
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{employee.name}</span>
          <Badge variant="secondary" className="text-[10px] capitalize">
            {employee.role.replace("_", " ")}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {clockInTime && (
            <span className="text-xs text-muted-foreground">
              In: {clockInTime}
              {clockOutTime && ` · Out: ${clockOutTime}`}
            </span>
          )}
        </div>
      </div>

      {/* Status and location */}
      <div className="flex items-center gap-2 shrink-0">
        {employee.lastPing && (
          <div className="flex items-center gap-1" title={`Last seen: ${formatDistanceToNow(new Date(employee.lastPing.timestamp), { addSuffix: true })}`}>
            <MapPin size={12} className="text-primary" />
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(employee.lastPing.timestamp), { addSuffix: true })}
            </span>
          </div>
        )}
        {employee.totalHoursToday > 0 && (
          <span className="text-xs font-mono font-medium text-primary">
            {employee.totalHoursToday.toFixed(1)}h
          </span>
        )}
        {employee.isClockedIn && (
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" title="Currently working" />
        )}
      </div>
    </div>
  );
}
