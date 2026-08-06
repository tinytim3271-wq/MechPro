import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Wrench, Car, Phone, Play, CheckCircle2,
  Package, FileText, MapPin, HardHat, Shield,
  DollarSign, PenLine, Check, ChevronRight,
  AlertTriangle, CalendarDays, ClipboardList, Clock, MessageSquare,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { format, isToday } from "date-fns";
import MyPayTab from "./_components/MyPayTab.tsx";
import ClockGpsTab from "./_components/ClockGpsTab.tsx";
import JobTrackingPanel from "./_components/JobTrackingPanel.tsx";
import ROPhotoPanel from "@/pages/jobs/_components/ROPhotoPanel.tsx";
import SignaturePad from "@/pages/jobs/_components/SignaturePad.tsx";
import InspectionChecklist from "./_components/InspectionChecklist.tsx";
import ROMessagePanel from "./_components/ROMessagePanel.tsx";
import TechNotificationBell from "./_components/TechNotificationBell.tsx";
import RecommendationDialog, { RecommendationList } from "./_components/RecommendationDialog.tsx";
import TechOnboarding from "./_components/TechOnboarding.tsx";
import PushNotificationBanner from "./_components/PushNotificationBanner.tsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type AssignedRO = {
  _id: Id<"repairOrders">;
  roNumber: string;
  status: string;
  priority: string;
  complaint: string;
  cause?: string;
  correction?: string;
  scheduledAt?: string;
  isMobile: boolean;
  bayName?: string;
  mobileAddress?: string;
  serviceAddress?: string;
  serviceCity?: string;
  serviceState?: string;
  serviceZip?: string;
  customerName: string;
  customerPhone?: string;
  vehicleSummary: string;
  vehicleEngine?: string;
  vehicleMileage?: number;
  vehicleVin?: string;
  laborLines: Array<{ description: string; laborHours: number; laborRate: number; techNotes?: string }>;
  partLines: Array<{ description: string; quantity: number; unitCost: number; unitPrice: number }>;
  totalAmount: number;
  customerSignature?: string;
  signedAt?: string;
  techLocationStatus?: string;
  techLocationUpdatedAt?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const PRIORITY_BORDER: Record<string, string> = {
  high: "border-l-4 border-l-red-500",
  normal: "border-l-4 border-l-yellow-500",
  low: "border-l-4 border-l-border",
};

function isScheduledToday(ro: AssignedRO): boolean {
  if (!ro.scheduledAt) return false;
  try {
    return isToday(new Date(ro.scheduledAt));
  } catch {
    return false;
  }
}

// ─── Job Detail Sheet (mobile-first bottom sheet) ─────────────────────────────

function JobDetailSheet({
  roId,
  roSnapshot,
  open,
  onClose,
}: {
  roId: Id<"repairOrders">;
  roSnapshot: AssignedRO;
  open: boolean;
  onClose: () => void;
}) {
  // Live query so status/notes stay fresh after mutations
  const liveRO = useQuery(api.repairOrders.getRO, open ? { roId } : "skip");
  // Merge live data over the snapshot — use snapshot fields not in getRO return
  const ro: AssignedRO = liveRO
    ? {
        ...roSnapshot,
        status: liveRO.status,
        cause: liveRO.cause,
        correction: liveRO.correction,
        laborLines: liveRO.laborLines as AssignedRO["laborLines"],
        partLines: liveRO.partLines as AssignedRO["partLines"],
        totalAmount: liveRO.totalAmount,
        customerSignature: liveRO.customerSignature,
        signedAt: liveRO.signedAt,
      }
    : roSnapshot;
  const updateStatus = useMutation(api.repairOrders.updateROStatus);
  const updateLines = useMutation(api.repairOrders.updateROLines);
  const saveSignature = useMutation(api.repairOrders.saveSignature);
  const [techNotes, setTechNotes] = useState(ro.correction ?? "");
  const [cause, setCause] = useState(ro.cause ?? "");
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [sigDialogOpen, setSigDialogOpen] = useState(false);
  const [sigSaved, setSigSaved] = useState(!!ro.customerSignature);
  const [recDialogOpen, setRecDialogOpen] = useState(false);

  const handleStatusChange = async (status: string) => {
    setUpdating(true);
    try {
      await updateStatus({
        roId: ro._id,
        status: status as "estimate" | "approved" | "in_progress" | "waiting_parts" | "completed" | "invoiced" | "cancelled",
      });
      toast.success(`Status → ${STATUS_LABELS[status]}`);
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await updateLines({
        roId: ro._id,
        laborLines: ro.laborLines,
        partLines: ro.partLines,
        shopFees: [],
        cause: cause || undefined,
        correction: techNotes || undefined,
      });
      toast.success("Notes saved");
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  // Next status actions
  const nextStatuses: Array<{ status: string; label: string; icon: React.ElementType; cls: string }> = [];
  if (ro.status === "approved") {
    nextStatuses.push({ status: "in_progress", label: "Start Job", icon: Play, cls: "bg-orange-500 hover:bg-orange-600 text-white" });
  }
  if (ro.status === "in_progress") {
    nextStatuses.push({ status: "waiting_parts", label: "Waiting on Parts", icon: Package, cls: "bg-yellow-500 hover:bg-yellow-600 text-black" });
    nextStatuses.push({ status: "completed", label: "Mark Complete", icon: CheckCircle2, cls: "bg-green-500 hover:bg-green-600 text-white" });
  }
  if (ro.status === "waiting_parts") {
    nextStatuses.push({ status: "in_progress", label: "Resume Work", icon: Play, cls: "bg-orange-500 hover:bg-orange-600 text-white" });
    nextStatuses.push({ status: "completed", label: "Mark Complete", icon: CheckCircle2, cls: "bg-green-500 hover:bg-green-600 text-white" });
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[92dvh] overflow-y-auto rounded-t-2xl p-0">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <SheetHeader className="px-5 pb-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-xl" style={{ fontFamily: "Rajdhani, sans-serif" }}>
            <Wrench size={18} className="text-primary" />
            {ro.roNumber}
            <Badge variant="outline" className={cn("ml-1 text-xs", STATUS_COLORS[ro.status])}>
              {STATUS_LABELS[ro.status]}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="details" className="flex flex-col flex-1">
          <TabsList className="mx-5 mt-3 grid grid-cols-6 h-10">
            <TabsTrigger value="details" className="text-xs cursor-pointer">
              <FileText size={12} className="mr-1" /> Details
            </TabsTrigger>
            <TabsTrigger value="notes" className="text-xs cursor-pointer">
              <PenLine size={12} className="mr-1" /> Notes
            </TabsTrigger>
            <TabsTrigger value="messages" className="text-xs cursor-pointer">
              <MessageSquare size={12} className="mr-1" /> Chat
            </TabsTrigger>
            <TabsTrigger value="inspection" className="text-xs cursor-pointer">
              <ClipboardList size={12} className="mr-1" /> Inspect
            </TabsTrigger>
            <TabsTrigger value="photos" className="text-xs cursor-pointer">
              <Car size={12} className="mr-1" /> Photos
            </TabsTrigger>
            <TabsTrigger value="recommend" className="text-xs cursor-pointer">
              <Lightbulb size={12} className="mr-1" /> Rec
            </TabsTrigger>
          </TabsList>

          {/* ── Details Tab ── */}
          <TabsContent value="details" className="px-5 py-4 space-y-4 overflow-y-auto">
            {/* Service Location — prominent for mobile techs */}
            {(() => {
              const fullServiceAddr = ro.serviceAddress
                ? [ro.serviceAddress, ro.serviceCity, ro.serviceState, ro.serviceZip].filter(Boolean).join(", ")
                : ro.mobileAddress;
              return fullServiceAddr ? (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-bold text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
                    <MapPin size={11} /> Service Location
                  </p>
                  <p className="font-semibold text-foreground">{fullServiceAddr}</p>
                  <a
                    href={`https://maps.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullServiceAddr)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:bg-blue-600 transition-colors"
                  >
                    <MapPin size={14} /> Get Directions
                  </a>
                </div>
              ) : ro.bayName ? (
                <div className="bg-muted/30 rounded-xl p-4 space-y-1">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Wrench size={11} /> Location
                  </p>
                  <p className="font-semibold text-foreground">{ro.bayName}</p>
                </div>
              ) : null;
            })()}

            {/* Vehicle */}
            <div className="bg-muted/30 rounded-xl p-4 space-y-1.5">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Car size={11} /> Vehicle
              </p>
              <p className="font-bold text-lg text-foreground leading-tight">{ro.vehicleSummary}</p>
              {ro.vehicleEngine && <p className="text-sm text-muted-foreground">{ro.vehicleEngine}</p>}
              {ro.vehicleVin && <p className="text-xs text-muted-foreground font-mono">VIN: {ro.vehicleVin}</p>}
              {ro.vehicleMileage && <p className="text-sm text-muted-foreground">{ro.vehicleMileage.toLocaleString()} mi in</p>}
            </div>

            {/* Customer */}
            <div className="bg-muted/30 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <FileText size={11} /> Customer
              </p>
              <p className="font-semibold text-foreground text-lg leading-tight">{ro.customerName}</p>
              {ro.customerPhone && (
                <a
                  href={`tel:${ro.customerPhone}`}
                  className="inline-flex items-center gap-2 text-primary font-medium text-base cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
                    <Phone size={16} />
                  </div>
                  {ro.customerPhone}
                </a>
              )}
            </div>

            {/* Job Tracking */}
            {ro.isMobile && (
              <JobTrackingPanel
                roId={ro._id}
                techLocationStatus={ro.techLocationStatus}
                serviceAddress={ro.serviceAddress}
                serviceCity={ro.serviceCity}
                serviceState={ro.serviceState}
                serviceZip={ro.serviceZip}
              />
            )}

            {/* Complaint */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Customer Complaint</p>
              <p className="text-sm text-foreground bg-muted/20 rounded-xl p-4 border border-border leading-relaxed">{ro.complaint}</p>
            </div>

            {/* Labor */}
            {ro.laborLines.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Labor</p>
                <div className="space-y-2">
                  {ro.laborLines.map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-muted/20 rounded-xl px-4 py-3">
                      <span className="font-medium">{l.description}</span>
                      <span className="text-muted-foreground text-xs">{l.laborHours}h</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Parts */}
            {ro.partLines.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Parts</p>
                <div className="space-y-2">
                  {ro.partLines.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-muted/20 rounded-xl px-4 py-3">
                      <span className="font-medium">{p.description}</span>
                      <span className="text-muted-foreground text-xs">×{p.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total */}
            {ro.totalAmount > 0 && (
              <div className="flex justify-between items-center bg-primary/10 rounded-xl px-4 py-3 border border-primary/20">
                <span className="font-semibold text-sm">Estimated Total</span>
                <span className="font-bold text-xl text-primary">${ro.totalAmount.toFixed(2)}</span>
              </div>
            )}

            {/* Customer Signature */}
            {(ro.status === "completed" || ro.status === "in_progress") && (
              <div className="border border-border rounded-xl p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Customer Signature</p>
                {ro.customerSignature || sigSaved ? (
                  <div className="flex items-center gap-2 text-green-500 font-semibold text-sm">
                    <Check size={16} /> Signature on file
                  </div>
                ) : (
                  <Button
                    size="lg"
                    variant="secondary"
                    className="w-full cursor-pointer h-12 text-base"
                    onClick={() => setSigDialogOpen(true)}
                  >
                    <PenLine size={18} className="mr-2" />
                    Collect Customer Signature
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── Notes Tab ── */}
          <TabsContent value="notes" className="px-5 py-4 space-y-4 overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Diagnosis / Cause</Label>
              <Textarea
                placeholder="What did you find as the root cause?"
                value={cause}
                onChange={(e) => setCause(e.target.value)}
                rows={3}
                className="resize-none text-base rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Work Performed</Label>
              <Textarea
                placeholder="Describe the work completed, parts replaced, torque specs…"
                value={techNotes}
                onChange={(e) => setTechNotes(e.target.value)}
                rows={6}
                className="resize-none text-base rounded-xl"
              />
            </div>
            <Button
              size="lg"
              className="w-full cursor-pointer h-12 text-base"
              onClick={handleSaveNotes}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Notes"}
            </Button>
          </TabsContent>

          {/* ── Messages Tab ── */}
          <TabsContent value="messages" className="flex-1 overflow-hidden">
            <ROMessagePanel roId={ro._id} />
          </TabsContent>

          {/* ── Inspection Tab ── */}
          <TabsContent value="inspection" className="px-5 py-4 overflow-y-auto">
            <InspectionChecklist roId={ro._id} />
          </TabsContent>

          {/* ── Photos Tab ── */}
          <TabsContent value="photos" className="px-5 py-4 overflow-y-auto">
            <ROPhotoPanel roId={ro._id} />
          </TabsContent>

          {/* ── Recommendations Tab ── */}
          <TabsContent value="recommend" className="px-5 py-4 overflow-y-auto space-y-4">
            <div className="text-center space-y-3 py-2">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Lightbulb size={24} className="text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Spotted something else this vehicle needs? Let the office know.
              </p>
              <Button
                size="lg"
                className="w-full cursor-pointer h-12 text-base font-bold"
                onClick={() => setRecDialogOpen(true)}
              >
                <Lightbulb size={18} className="mr-2" /> Add Recommendation
              </Button>
            </div>
            {/* Existing recommendations */}
            <RecommendationList roId={ro._id} />
          </TabsContent>
        </Tabs>

        {/* ── Status Action Bar (sticky bottom) ── */}
        {nextStatuses.length > 0 && (
          <div className="sticky bottom-0 bg-background border-t border-border px-5 py-4 flex gap-3">
            {nextStatuses.map(({ status, label, icon: Icon, cls }) => (
              <Button
                key={status}
                className={cn("flex-1 cursor-pointer h-14 text-base font-bold", cls)}
                onClick={() => handleStatusChange(status)}
                disabled={updating}
              >
                <Icon size={18} className="mr-2" />
                {updating ? "Updating…" : label}
              </Button>
            ))}
          </div>
        )}

        {/* Signature Dialog */}
        <Dialog open={sigDialogOpen} onOpenChange={setSigDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PenLine size={16} className="text-primary" />
                Customer Signature
              </DialogTitle>
            </DialogHeader>
            <SignaturePad
              existingSignature={ro.customerSignature}
              signedAt={ro.signedAt}
              onSave={async (dataUrl) => {
                await saveSignature({ roId: ro._id, signature: dataUrl });
                setSigSaved(true);
                setSigDialogOpen(false);
                toast.success("Signature saved");
              }}
              onClear={async () => {
                setSigSaved(false);
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Recommendation Dialog */}
        <RecommendationDialog
          open={recDialogOpen}
          onClose={() => setRecDialogOpen(false)}
          roId={ro._id}
        />
      </SheetContent>
    </Sheet>
  );
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({ ro }: { ro: AssignedRO }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={cn(
          "w-full text-left bg-card border border-border rounded-2xl p-4 cursor-pointer",
          "active:scale-[0.98] transition-transform hover:border-primary/40",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          PRIORITY_BORDER[ro.priority] ?? "border-l-4 border-l-border",
          ro.status === "in_progress" && "ring-1 ring-orange-500/30"
        )}
        onClick={() => setOpen(true)}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-lg text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>
              {ro.roNumber}
            </span>
            <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[ro.status])}>
              {STATUS_LABELS[ro.status]}
            </Badge>
            {ro.priority === "high" && (
              <Badge variant="outline" className="text-xs text-red-400 border-red-400/40 bg-red-400/10">
                <AlertTriangle size={10} className="mr-0.5" /> High
              </Badge>
            )}
          </div>
          <ChevronRight size={18} className="text-muted-foreground shrink-0" />
        </div>

        {/* Vehicle */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Car size={18} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-base text-foreground leading-tight">{ro.vehicleSummary}</p>
            <p className="text-sm text-muted-foreground truncate">{ro.customerName}</p>
          </div>
          {ro.customerPhone && (
            <a
              href={`tel:${ro.customerPhone}`}
              onClick={(e) => e.stopPropagation()}
              className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center cursor-pointer shrink-0"
            >
              <Phone size={16} className="text-green-500" />
            </a>
          )}
        </div>

        {/* Location / Bay */}
        {(() => {
          const addr = ro.serviceAddress
            ? [ro.serviceAddress, ro.serviceCity, ro.serviceState].filter(Boolean).join(", ")
            : ro.mobileAddress;
          return addr ? (
            <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium">
              <MapPin size={11} /> {addr}
            </div>
          ) : ro.bayName ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wrench size={11} /> {ro.bayName}
            </div>
          ) : null;
        })()}

        {/* Complaint */}
        <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed">{ro.complaint}</p>
      </button>

      {open && (
        <JobDetailSheet roId={ro._id} roSnapshot={ro} open={open} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

// ─── Status Pill ──────────────────────────────────────────────────────────────

function StatusPill({ count, label, color }: { count: number; label: string; color: string }) {
  if (count === 0) return null;
  return (
    <div className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border", color)}>
      {count} {label}
    </div>
  );
}

// ─── Tech Portal Page ─────────────────────────────────────────────────────────

export default function TechPage() {
  const myRole = useQuery(api.admin.getMyRole, {});
  const assignedROs = useQuery(api.admin.getMyAssignedROs, {}) as AssignedRO[] | undefined;
  const navigate = useNavigate();
  const [showAllJobs, setShowAllJobs] = useState(false);

  // Loading
  if (myRole === undefined || assignedROs === undefined) {
    return (
      <div className="p-5 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
      </div>
    );
  }

  // Not a member
  if (myRole === null) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center space-y-3">
          <HardHat size={36} className="mx-auto text-muted-foreground" />
          <h2 className="text-xl font-bold" style={{ fontFamily: "Rajdhani, sans-serif" }}>Not a member</h2>
          <p className="text-muted-foreground text-sm">You are not assigned to any organization.</p>
        </div>
      </div>
    );
  }

  // Today's jobs vs all
  const todaysROs = assignedROs.filter(isScheduledToday);
  const displayedROs = showAllJobs ? assignedROs : (todaysROs.length > 0 ? todaysROs : assignedROs);
  const showingToday = !showAllJobs && todaysROs.length > 0;

  const inProgress = displayedROs.filter((r) => r.status === "in_progress").length;
  const approved = displayedROs.filter((r) => r.status === "approved").length;
  const waitingParts = displayedROs.filter((r) => r.status === "waiting_parts").length;

  const sortedROs = [...displayedROs].sort((a, b) => {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const statusOrder = { in_progress: 0, approved: 1, waiting_parts: 2, estimate: 3, completed: 4 };
    const pA = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
    const pB = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
    if (pA !== pB) return pA - pB;
    return (statusOrder[a.status as keyof typeof statusOrder] ?? 5) -
           (statusOrder[b.status as keyof typeof statusOrder] ?? 5);
  });

  return (
    <div className="pb-24 max-w-xl mx-auto">
      {/* First-time welcome modal — shows once only */}
      <TechOnboarding />

      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <HardHat size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground leading-tight" style={{ fontFamily: "Rajdhani, sans-serif" }}>
                Tech Portal
              </h1>
              <p className="text-xs text-muted-foreground">{myRole.userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TechNotificationBell />
            {(myRole.role === "owner" || myRole.role === "admin" || myRole.hasAdminAccess) && (
              <Button variant="secondary" size="sm" className="cursor-pointer" onClick={() => navigate("/admin")}>
                <Shield size={14} className="mr-1.5" /> Admin
              </Button>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="jobs" className="px-5 pt-4">
        {/* Push notification opt-in */}
        <PushNotificationBanner />

        <TabsList className="w-full grid grid-cols-3 h-11 mt-3">
          <TabsTrigger value="jobs" className="cursor-pointer text-sm">
            <Wrench size={14} className="mr-1.5" />
            My Jobs
            {assignedROs.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5 font-semibold">
                {assignedROs.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="clock" className="cursor-pointer text-sm">
            <Clock size={14} className="mr-1.5" />
            Clock / GPS
          </TabsTrigger>
          <TabsTrigger value="pay" className="cursor-pointer text-sm">
            <DollarSign size={14} className="mr-1.5" />
            My Pay
          </TabsTrigger>
        </TabsList>

        {/* ── Jobs Tab ── */}
        <TabsContent value="jobs" className="mt-4 space-y-4">
          {/* Today / All toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays size={15} className="text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                {showingToday
                  ? `Today · ${format(new Date(), "MMMM d")}`
                  : "All Active Jobs"}
              </span>
            </div>
            {todaysROs.length > 0 && (
              <button
                className="text-xs text-primary underline underline-offset-2 cursor-pointer"
                onClick={() => setShowAllJobs((v) => !v)}
              >
                {showAllJobs ? `Show today (${todaysROs.length})` : `Show all (${assignedROs.length})`}
              </button>
            )}
          </div>

          {/* Status pills */}
          <div className="flex flex-wrap gap-2">
            <StatusPill count={inProgress} label="In Progress" color="bg-orange-500/10 border-orange-500/30 text-orange-400" />
            <StatusPill count={approved} label="Ready" color="bg-purple-500/10 border-purple-500/30 text-purple-400" />
            <StatusPill count={waitingParts} label="Waiting Parts" color="bg-yellow-500/10 border-yellow-500/30 text-yellow-400" />
          </div>

          {/* Job list */}
          {sortedROs.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                <Wrench size={28} className="text-muted-foreground" />
              </div>
              <h3 className="font-bold text-lg" style={{ fontFamily: "Rajdhani, sans-serif" }}>No jobs today</h3>
              <p className="text-sm text-muted-foreground">
                {todaysROs.length === 0 && assignedROs.length > 0
                  ? `You have ${assignedROs.length} job${assignedROs.length !== 1 ? "s" : ""} scheduled on other days.`
                  : "Your manager will assign jobs here."}
              </p>
              {todaysROs.length === 0 && assignedROs.length > 0 && (
                <Button variant="secondary" size="sm" className="cursor-pointer" onClick={() => setShowAllJobs(true)}>
                  View All Jobs
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {sortedROs.map((ro) => <JobCard key={ro._id} ro={ro} />)}
            </div>
          )}
        </TabsContent>

        {/* ── Clock / GPS Tab ── */}
        <TabsContent value="clock" className="mt-4">
          <ClockGpsTab />
        </TabsContent>

        {/* ── Pay Tab ── */}
        <TabsContent value="pay" className="mt-4">
          <MyPayTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
