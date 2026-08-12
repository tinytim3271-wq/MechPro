import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import {
  CheckCircle2, AlertTriangle, XCircle, Minus,
  ClipboardList, Plus, ChevronDown, ChevronUp,
  Camera, X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemResult = "ok" | "needs_attention" | "critical" | "na";

type InspectionItem = {
  _id: Id<"inspectionItems">;
  category: string;
  itemName: string;
  result: ItemResult;
  notes?: string;
  sortOrder: number;
  photoUrl?: string | null;
  photoStorageId?: Id<"_storage">;
};

// ─── Result config ────────────────────────────────────────────────────────────

const RESULTS: Array<{
  value: ItemResult;
  icon: React.ElementType;
  label: string;
  cls: string;
  activeCls: string;
  iconColor: string;
}> = [
  {
    value: "ok",
    icon: CheckCircle2,
    label: "OK",
    cls: "border-border text-muted-foreground hover:border-green-500/50",
    activeCls: "border-green-500 bg-green-500/20 text-green-400",
    iconColor: "text-green-400",
  },
  {
    value: "needs_attention",
    icon: AlertTriangle,
    label: "Attention",
    cls: "border-border text-muted-foreground hover:border-yellow-500/50",
    activeCls: "border-yellow-500 bg-yellow-500/20 text-yellow-400",
    iconColor: "text-yellow-400",
  },
  {
    value: "critical",
    icon: XCircle,
    label: "Critical",
    cls: "border-border text-muted-foreground hover:border-red-500/50",
    activeCls: "border-red-500 bg-red-500/20 text-red-400",
    iconColor: "text-red-400",
  },
  {
    value: "na",
    icon: Minus,
    label: "N/A",
    cls: "border-border text-muted-foreground",
    activeCls: "border-muted bg-muted/40 text-muted-foreground",
    iconColor: "text-muted-foreground",
  },
];

// ─── Inspection Item Row ──────────────────────────────────────────────────────

function ItemRow({ item }: { item: InspectionItem }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateItem = useMutation(api.inspections.updateItemResult);
  const genUploadUrl = useMutation(api.inspections.generateUploadUrl);
  const attachPhoto = useMutation(api.inspections.attachPhotoToItem);
  const removePhoto = useMutation(api.inspections.removePhotoFromItem);

  const currentCfg = RESULTS.find((r) => r.value === item.result)!;

  const handleResult = async (result: ItemResult) => {
    try {
      await updateItem({ itemId: item._id, result, notes: notes || undefined });
      // Auto-expand for flagged items so tech can add notes
      if (result === "needs_attention" || result === "critical") {
        setExpanded(true);
      }
    } catch {
      toast.error("Failed to update item");
    }
  };

  const handleNotesBlur = async () => {
    if (notes === (item.notes ?? "")) return;
    try {
      await updateItem({ itemId: item._id, result: item.result, notes: notes || undefined });
    } catch {
      toast.error("Failed to save notes");
    }
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploadUrl = await genUploadUrl({});
      const res = await fetch(uploadUrl, {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await attachPhoto({ itemId: item._id, storageId });
      toast.success("Photo attached");
    } catch {
      toast.error("Photo upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = async () => {
    try {
      await removePhoto({ itemId: item._id });
    } catch {
      toast.error("Failed to remove photo");
    }
  };

  const hasExtras = item.notes || item.photoUrl;

  return (
    <div
      className={cn(
        "border-b border-border last:border-0",
        item.result === "critical" && "bg-red-500/5",
        item.result === "needs_attention" && "bg-yellow-500/5",
      )}
    >
      {/* Item name row + expand toggle */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={cn("shrink-0", currentCfg.iconColor)}>
          <currentCfg.icon size={15} />
        </span>
        <span className="flex-1 text-sm font-medium text-foreground">{item.itemName}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {item.photoUrl && <Camera size={12} className="text-blue-400" />}
          {hasExtras && !expanded && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          )}
          {expanded ? (
            <ChevronUp size={15} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={15} className="text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Result buttons — large, always labelled for easy phone tapping */}
      <div className="flex gap-1.5 px-4 pb-3">
        {RESULTS.map((r) => {
          const Icon = r.icon;
          const active = item.result === r.value;
          return (
            <button
              key={r.value}
              onClick={() => handleResult(r.value)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer",
                active ? r.activeCls : r.cls
              )}
            >
              <Icon size={16} />
              <span>{r.label}</span>
            </button>
          );
        })}
      </div>

      {/* Expanded: notes + photo */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
          <Textarea
            placeholder="Add notes about this item… (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            rows={2}
            className="text-sm resize-none"
          />

          {item.photoUrl ? (
            <div className="relative inline-block">
              <img
                src={item.photoUrl}
                alt={`Photo for ${item.itemName}`}
                className="w-28 h-28 rounded-xl object-cover border border-border"
              />
              <button
                onClick={handleRemovePhoto}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-destructive flex items-center justify-center cursor-pointer shadow"
              >
                <X size={11} className="text-white" />
              </button>
            </div>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhoto}
              />
              <Button
                size="sm"
                variant="secondary"
                className="cursor-pointer gap-1.5 h-10 px-4"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Spinner /> : <Camera size={14} />}
                {uploading ? "Uploading…" : "Add Photo"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({ category, items }: { category: string; items: InspectionItem[] }) {
  const [open, setOpen] = useState(true);
  const doneCount = items.filter((i) => i.result !== "na").length;
  const criticalCount = items.filter((i) => i.result === "critical").length;
  const attentionCount = items.filter((i) => i.result === "needs_attention").length;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-foreground">{category}</span>
          {criticalCount > 0 && (
            <Badge variant="outline" className="text-[10px] text-red-400 border-red-400/40 bg-red-400/10 py-0">
              {criticalCount} critical
            </Badge>
          )}
          {attentionCount > 0 && (
            <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-400/40 bg-yellow-400/10 py-0">
              {attentionCount} attention
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground shrink-0">
          <span className="text-xs">{doneCount}/{items.length}</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      {open && (
        <div>
          {items.map((item) => (
            <ItemRow key={item._id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InspectionChecklist({ roId }: { roId: Id<"repairOrders"> }) {
  const inspection = useQuery(api.inspections.getInspectionByRO, { roId });
  const createInspection = useMutation(api.inspections.createInspection);
  const completeInspection = useMutation(api.inspections.completeInspection);
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createInspection({ roId });
      toast.success("Inspection started");
    } catch {
      toast.error("Failed to create inspection");
    } finally {
      setCreating(false);
    }
  };

  const handleComplete = async () => {
    if (!inspection) return;
    setCompleting(true);
    try {
      await completeInspection({ inspectionId: inspection._id });
      toast.success("Inspection completed");
    } catch {
      toast.error("Failed to complete inspection");
    } finally {
      setCompleting(false);
    }
  };

  if (inspection === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (inspection === null) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <ClipboardList size={28} className="text-primary" />
        </div>
        <div>
          <p className="font-semibold text-foreground text-base">No inspection started</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Start a multi-point inspection. Mark each item OK, Needs Attention, or Critical — and add notes or photos.
          </p>
        </div>
        <Button className="cursor-pointer h-11 px-6 text-sm font-semibold" onClick={handleCreate} disabled={creating}>
          {creating ? <Spinner /> : <Plus size={15} className="mr-1.5" />}
          {creating ? "Starting…" : "Start Inspection"}
        </Button>
      </div>
    );
  }

  // Group by category
  const categories = inspection.items.reduce<Record<string, InspectionItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item as InspectionItem);
    return acc;
  }, {});

  const totalItems = inspection.items.length;
  const doneItems = inspection.items.filter((i) => i.result !== "na").length;
  const criticalItems = inspection.items.filter((i) => i.result === "critical").length;
  const attentionItems = inspection.items.filter((i) => i.result === "needs_attention").length;
  const progress = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium">{doneItems}/{totalItems} assessed</span>
          <div className="flex gap-3">
            {criticalItems > 0 && (
              <span className="text-red-400 font-semibold flex items-center gap-1">
                <XCircle size={11} /> {criticalItems} critical
              </span>
            )}
            {attentionItems > 0 && (
              <span className="text-yellow-400 font-semibold flex items-center gap-1">
                <AlertTriangle size={11} /> {attentionItems} attn
              </span>
            )}
          </div>
        </div>
        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              criticalItems > 0 ? "bg-red-500" : attentionItems > 0 ? "bg-yellow-500" : "bg-green-500"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Category sections */}
      <div className="space-y-3">
        {Object.entries(categories).map(([cat, items]) => (
          <CategorySection key={cat} category={cat} items={items} />
        ))}
      </div>

      {/* Complete / completed */}
      {inspection.status === "in_progress" && (
        <Button
          className="w-full h-12 cursor-pointer font-semibold text-sm"
          onClick={handleComplete}
          disabled={completing}
        >
          {completing ? <Spinner /> : <CheckCircle2 size={15} className="mr-1.5" />}
          {completing ? "Completing…" : "Mark Inspection Complete"}
        </Button>
      )}
      {inspection.status === "completed" && (
        <div className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-semibold">
          <CheckCircle2 size={16} />
          Inspection Completed
          {inspection.completedAt && (
            <span className="text-xs font-normal text-green-400/70 ml-1">
              · {new Date(inspection.completedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
