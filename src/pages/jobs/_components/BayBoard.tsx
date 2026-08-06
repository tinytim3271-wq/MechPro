import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { LayoutGrid, AlertTriangle, Car, User } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  estimate: "border-muted bg-muted/30",
  approved: "border-blue-500/40 bg-blue-500/10",
  in_progress: "border-primary/50 bg-primary/10",
  waiting_parts: "border-yellow-500/40 bg-yellow-500/10",
  completed: "border-green-500/40 bg-green-500/10",
};

const STATUS_DOT: Record<string, string> = {
  estimate: "bg-muted-foreground",
  approved: "bg-blue-400",
  in_progress: "bg-primary",
  waiting_parts: "bg-yellow-400",
  completed: "bg-green-400",
};

type Props = {
  onSelectRO: (id: Id<"repairOrders">) => void;
};

export default function BayBoard({ onSelectRO }: Props) {
  const bayBoard = useQuery(api.repairOrders.getBayBoard, {});
  const updateStatus = useMutation(api.repairOrders.updateROStatus);

  if (bayBoard === undefined) {
    return (
      <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (!bayBoard) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        No organization found. Complete onboarding first.
      </div>
    );
  }

  const { bayNames, assignments } = bayBoard;

  const handleStatusChange = async (roId: string, status: string) => {
    try {
      await updateStatus({
        roId: roId as Id<"repairOrders">,
        status: status as "estimate" | "approved" | "in_progress" | "waiting_parts" | "completed" | "invoiced" | "cancelled",
      });
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LayoutGrid size={14} className="text-primary" />
        <span>{bayNames.length} bays configured</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {bayNames.map((bayName) => {
          const ro = assignments[bayName];
          return (
            <div
              key={bayName}
              className={cn(
                "rounded-xl border p-4 min-h-[160px] flex flex-col transition-colors",
                ro ? STATUS_COLORS[ro.status] ?? "border-border" : "border-dashed border-border bg-muted/10"
              )}
            >
              {/* Bay header */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{bayName}</span>
                {ro && (
                  <div className={cn("w-2 h-2 rounded-full", STATUS_DOT[ro.status] ?? "bg-muted")} />
                )}
              </div>

              {ro ? (
                <div className="flex-1 flex flex-col gap-2">
                  <button
                    onClick={() => onSelectRO(ro._id as Id<"repairOrders">)}
                    className="text-left hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{ro.roNumber}</span>
                      {ro.priority === "high" && <AlertTriangle size={12} className="text-red-400" />}
                    </div>
                    <p className="text-sm font-medium text-foreground mt-1 line-clamp-2">{ro.complaint}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User size={10} />{ro.customerName}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Car size={10} />{ro.vehicleSummary}
                    </p>
                  </button>

                  {/* Status change */}
                  <div className="mt-auto pt-2">
                    <Select
                      value={ro.status}
                      onValueChange={(v) => handleStatusChange(ro._id, v)}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="estimate">Estimate</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="waiting_parts">Waiting Parts</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="invoiced">Invoiced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Empty</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile ROs section */}
      <MobileROsSection onSelectRO={onSelectRO} />
    </div>
  );
}

function MobileROsSection({ onSelectRO }: { onSelectRO: (id: Id<"repairOrders">) => void }) {
  const { results: ros } = usePaginatedQuery(api.repairOrders.listROs, {}, { initialNumItems: 50 });
  const mobileROs = (ros ?? []).filter(
    (r) => r.isMobile && ["approved", "in_progress", "waiting_parts"].includes(r.status)
  );

  if (mobileROs.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Mobile Jobs</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {mobileROs.map((ro) => (
          <button
            key={ro._id}
            onClick={() => onSelectRO(ro._id)}
            className="text-left border border-primary/30 bg-primary/5 rounded-xl p-4 hover:border-primary/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{ro.roNumber}</span>
              <span className="text-xs text-primary font-medium">Mobile</span>
            </div>
            <p className="text-sm font-medium text-foreground mt-1 line-clamp-2">{ro.complaint}</p>
            <p className="text-xs text-muted-foreground mt-1">{ro.customerName} · {ro.vehicleSummary}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
