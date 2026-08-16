import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  ClipboardCheck, Wrench, CheckCircle2, Circle, AlertTriangle, Loader2, XCircle,
  Target, Lightbulb, Printer,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useState, useRef } from "react";
import { buildDiagnosticPrintHtml, buildRepairPrintHtml } from "./printChecklists.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

type DiagnosticItem = {
  item: string;
  category?: "visual" | "electrical" | "mechanical" | "scan_tool" | "measurement";
  toolsRequired?: string[];
  verificationCriteria?: string;
  completed: boolean;
  notes?: string;
};

type RepairStep = {
  step: number;
  title: string;
  details: string;
  toolsRequired?: string[];
  torqueSpecs?: string;
  warning?: string;
  completed: boolean;
  notes?: string;
};

type ProbableCause = {
  cause: string;
  likelihood: "high" | "medium" | "low";
  explanation: string;
};

type RecommendedService = {
  service: string;
  reason: string;
  estimatedCost?: number;
};

type AIWorkflowStatus = "pending" | "generating" | "completed" | "failed" | undefined;

// ─── Probable Causes Section ────────────────────────────────────────────────

function ProbableCausesSection({ causes }: { causes: ProbableCause[] | undefined }) {
  if (!causes || causes.length === 0) return null;

  const likelihoodColor = (l: string) => {
    switch (l) {
      case "high": return "bg-red-500/15 text-red-400";
      case "medium": return "bg-yellow-500/15 text-yellow-400";
      case "low": return "bg-blue-500/15 text-blue-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-2 mb-4">
      <h4 className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
        <Target size={12} />
        Probable Causes
      </h4>
      <div className="space-y-1.5">
        {causes.map((pc, idx) => (
          <div key={idx} className="flex items-start gap-2 rounded-md border p-2.5">
            <Badge className={cn("text-[10px] shrink-0 mt-0.5", likelihoodColor(pc.likelihood))}>
              {pc.likelihood}
            </Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{pc.cause}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{pc.explanation}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recommended Services Section ───────────────────────────────────────────

function RecommendedServicesSection({ services }: { services: RecommendedService[] | undefined }) {
  if (!services || services.length === 0) return null;

  return (
    <div className="space-y-2 mt-4 pt-4 border-t">
      <h4 className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
        <Lightbulb size={12} />
        Recommended Additional Services
      </h4>
      <div className="space-y-1.5">
        {services.map((rs, idx) => (
          <div key={idx} className="flex items-start justify-between gap-2 rounded-md border p-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{rs.service}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{rs.reason}</p>
            </div>
            {rs.estimatedCost !== undefined && (
              <span className="text-xs font-medium text-primary shrink-0">
                ~${rs.estimatedCost.toFixed(0)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Category badge helper ──────────────────────────────────────────────────

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null;
  const labels: Record<string, string> = {
    visual: "Visual",
    electrical: "Electrical",
    mechanical: "Mechanical",
    scan_tool: "Scan Tool",
    measurement: "Measurement",
  };
  const colors: Record<string, string> = {
    visual: "bg-green-500/15 text-green-400",
    electrical: "bg-yellow-500/15 text-yellow-400",
    mechanical: "bg-blue-500/15 text-blue-400",
    scan_tool: "bg-purple-500/15 text-purple-400",
    measurement: "bg-orange-500/15 text-orange-400",
  };
  return (
    <Badge className={cn("text-[9px] px-1.5 py-0", colors[category] ?? "bg-muted text-muted-foreground")}>
      {labels[category] ?? category}
    </Badge>
  );
}

// ─── Diagnostic Checklist ────────────────────────────────────────────────────

function DiagnosticChecklist({
  roId,
  items,
  status,
  probableCauses,
  recommendedServices,
  ambiguityFlag,
}: {
  roId: Id<"repairOrders">;
  items: DiagnosticItem[] | undefined;
  status: AIWorkflowStatus;
  probableCauses?: ProbableCause[];
  recommendedServices?: RecommendedService[];
  ambiguityFlag?: string;
}) {
  const toggleItem = useMutation(api.repairOrders.toggleDiagnosticItem);
  const [expandedNotes, setExpandedNotes] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  if (status === "generating" || status === "pending") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 size={28} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">AI is generating diagnostic checklist...</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <XCircle size={28} className="text-destructive" />
        <p className="text-sm text-muted-foreground">AI workflow generation failed</p>
        <p className="text-xs text-muted-foreground">The checklist couldn't be generated. You can still add items manually.</p>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <ClipboardCheck size={28} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No diagnostic checklist available</p>
        <p className="text-xs text-muted-foreground">Create a new RO to auto-generate one from the complaint.</p>
      </div>
    );
  }

  const completedCount = items.filter((i) => i.completed).length;

  const handleToggle = async (index: number, completed: boolean) => {
    await toggleItem({ roId, index, completed });
  };

  const handleSaveNote = async (index: number) => {
    await toggleItem({ roId, index, completed: items[index].completed, notes: noteText });
    setExpandedNotes(null);
    setNoteText("");
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(buildDiagnosticPrintHtml(items, completedCount));
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-4" ref={printRef}>
      {/* Ambiguity warning */}
      {ambiguityFlag && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-yellow-400">Ambiguous complaint detected</p>
            <p className="text-xs text-muted-foreground mt-0.5">{ambiguityFlag}</p>
          </div>
        </div>
      )}

      {/* Probable Causes */}
      <ProbableCausesSection causes={probableCauses} />

      {/* Progress header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <ClipboardCheck size={14} className="text-primary" />
          Diagnostic Verification
        </h3>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs cursor-pointer"
            onClick={handlePrint}
          >
            <Printer size={12} className="mr-1" />
            Print
          </Button>
          <Badge className={completedCount === items.length ? "bg-green-500/15 text-green-400" : "bg-primary/15 text-primary"}>
            {completedCount}/{items.length}
          </Badge>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${(completedCount / items.length) * 100}%` }}
        />
      </div>

      {/* Items */}
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="space-y-1">
            <button
              onClick={() => handleToggle(idx, !item.completed)}
              className={cn(
                "w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-all cursor-pointer",
                item.completed
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-border hover:border-primary/40"
              )}
            >
              {item.completed ? (
                <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />
              ) : (
                <Circle size={16} className="text-muted-foreground shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <span className={cn(
                  "text-sm block",
                  item.completed && "line-through text-muted-foreground"
                )}>
                  {item.item}
                </span>
                {/* Category + Tools */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <CategoryBadge category={item.category} />
                  {item.toolsRequired && item.toolsRequired.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      Tools: {item.toolsRequired.join(", ")}
                    </span>
                  )}
                </div>
                {/* Verification criteria */}
                {item.verificationCriteria && (
                  <p className="text-[11px] text-muted-foreground italic">
                    Pass: {item.verificationCriteria}
                  </p>
                )}
              </div>
            </button>

            {/* Notes toggle */}
            {expandedNotes === idx ? (
              <div className="ml-7 space-y-2">
                <Textarea
                  className="text-xs min-h-[60px]"
                  placeholder="Add tech notes for this step..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="text-xs h-7 cursor-pointer" onClick={() => handleSaveNote(idx)}>Save</Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7 cursor-pointer" onClick={() => setExpandedNotes(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button
                className="ml-7 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                onClick={() => { setExpandedNotes(idx); setNoteText(item.notes ?? ""); }}
              >
                {item.notes ? `Note: ${item.notes}` : "+ Add note"}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Recommended Services */}
      <RecommendedServicesSection services={recommendedServices} />
    </div>
  );
}

// ─── Repair Procedure Checklist ──────────────────────────────────────────────

function RepairProcedureChecklist({
  roId,
  steps,
  status,
}: {
  roId: Id<"repairOrders">;
  steps: RepairStep[] | undefined;
  status: AIWorkflowStatus;
}) {
  const toggleStep = useMutation(api.repairOrders.toggleRepairStep);
  const [expandedNotes, setExpandedNotes] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");

  if (status === "generating" || status === "pending") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 size={28} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">AI is generating repair procedure...</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <XCircle size={28} className="text-destructive" />
        <p className="text-sm text-muted-foreground">AI workflow generation failed</p>
      </div>
    );
  }

  if (!steps || steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <Wrench size={28} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No repair procedure available</p>
        <p className="text-xs text-muted-foreground">Create a new RO to auto-generate one.</p>
      </div>
    );
  }

  const completedCount = steps.filter((s) => s.completed).length;

  const handleToggle = async (index: number, completed: boolean) => {
    await toggleStep({ roId, index, completed });
  };

  const handleSaveNote = async (index: number) => {
    await toggleStep({ roId, index, completed: steps[index].completed, notes: noteText });
    setExpandedNotes(null);
    setNoteText("");
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(buildRepairPrintHtml(steps, completedCount));
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Wrench size={14} className="text-primary" />
          Repair Procedure
        </h3>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs cursor-pointer"
            onClick={handlePrint}
          >
            <Printer size={12} className="mr-1" />
            Print
          </Button>
          <Badge className={completedCount === steps.length ? "bg-green-500/15 text-green-400" : "bg-primary/15 text-primary"}>
            {completedCount}/{steps.length}
          </Badge>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, idx) => (
          <div key={idx} className="space-y-1">
            <button
              onClick={() => handleToggle(idx, !step.completed)}
              className={cn(
                "w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-all cursor-pointer",
                step.completed
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-border hover:border-primary/40"
              )}
            >
              {step.completed ? (
                <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-muted-foreground flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[9px] font-bold text-muted-foreground">{step.step}</span>
                </div>
              )}
              <div className="flex-1 space-y-1 min-w-0">
                <p className={cn(
                  "text-sm font-medium",
                  step.completed && "line-through text-muted-foreground"
                )}>
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.details}</p>

                {/* Tools required */}
                {step.toolsRequired && step.toolsRequired.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="font-medium">Tools:</span> {step.toolsRequired.join(", ")}
                  </p>
                )}

                {/* Torque specs */}
                {step.torqueSpecs && (
                  <p className="text-[10px] text-blue-400 font-medium">
                    Torque: {step.torqueSpecs}
                  </p>
                )}

                {/* Warning */}
                {step.warning && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <AlertTriangle size={11} className="text-yellow-400 shrink-0" />
                    <span className="text-xs text-yellow-400">{step.warning}</span>
                  </div>
                )}
              </div>
            </button>

            {/* Notes */}
            {expandedNotes === idx ? (
              <div className="ml-7 space-y-2">
                <Textarea
                  className="text-xs min-h-[60px]"
                  placeholder="Add tech notes for this step..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="text-xs h-7 cursor-pointer" onClick={() => handleSaveNote(idx)}>Save</Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7 cursor-pointer" onClick={() => setExpandedNotes(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button
                className="ml-7 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                onClick={() => { setExpandedNotes(idx); setNoteText(step.notes ?? ""); }}
              >
                {step.notes ? `Note: ${step.notes}` : "+ Add note"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export { DiagnosticChecklist, RepairProcedureChecklist };
export type { DiagnosticItem, RepairStep, AIWorkflowStatus, ProbableCause, RecommendedService };
